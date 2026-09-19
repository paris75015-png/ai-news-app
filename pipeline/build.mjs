/**
 * 毎日の処理：ニュースを集め、Gemini で見出し・採点・分類・要約をして public/data/news.json に保存する
 *
 *   npm run news            … 本番（.env または環境変数の GEMINI_API_KEY が必要。GROQ_API_KEY は任意の予備）
 *   npm run news -- --dry-run … AI を呼ばずに流れだけ確認（見出し・要約は仮のもの）
 */

import fs from 'node:fs';
import path from 'node:path';
import { SOURCES } from './sources.js';
import { collectCandidates } from './collect.js';
import { fetchArticleBody, htmlFragmentToText } from './fetchArticle.js';
import { initGemini, generateJson, usedModels } from './gemini.js';
import { initGroq, groqAvailable, groqJson, groqUsed, GROQ_BODY_CHARS } from './groq.js';
import {
  COLLECT, EDITORIAL_VERSION, CATEGORIES, tierOfRank,
  SCORING_MODELS, SUMMARY_MODELS, FALLBACK_MODEL,
  SCORING_PROMPT, SCORING_SCHEMA, SUMMARY_PROMPT, SUMMARY_SCHEMA,
} from './editorial.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const SEEN_FILE = path.join(ROOT, 'data', 'seen.json');
const SUMMARY_BATCH = 3;           // 1回の要約呼び出しに含める記事数
const BODY_CHARS_FOR_SUMMARY = 12000;

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
  if (!dryRun) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');
    initGemini(process.env.GEMINI_API_KEY);
    initGroq(process.env.GROQ_API_KEY);
    console.log(`[build] 予備AI（Groq）: ${groqAvailable() ? '有効' : '未設定'}`);
  }

  const seen = readJson(SEEN_FILE, {});
  const all = await collectCandidates(SOURCES);
  const candidates = all.filter(c => !seen[c.id]);
  console.log(`[build] 候補 ${all.length}件（うち既出 ${all.length - candidates.length}件を除外）`);
  if (candidates.length === 0) throw new Error('候補がありません');

  const scored = dryRun ? fakeScores(candidates) : await scoreCandidates(candidates);
  const selected = selectBalanced(scored);
  const perCategory = CATEGORIES.map(c => `${c.label}${selected.filter(a => a.category === c.id).length}`).join(' ');
  console.log(`[build] 掲載 ${selected.length}件（${perCategory}）`);
  if (selected.length === 0) throw new Error('掲載できる記事がありません');

  await attachBodies(selected);
  if (dryRun) selected.forEach(a => (a.summary = `（dry-run）${a.snippet}`));
  else await summarize(selected);

  const now = new Date();
  const output = {
    generatedAt: now.toISOString(),
    editorialVersion: EDITORIAL_VERSION,
    models: dryRun ? ['dry-run'] : [...usedModels, ...(groqUsed ? [FALLBACK_MODEL] : [])],
    categories: CATEGORIES,
    articles: selected.map((a, rank) => ({
      id: a.id,
      url: a.url,
      headline: a.headline,
      originalTitle: a.title,
      outlet: a.outlet,
      region: a.region,
      category: a.category,
      score: a.score,
      tier: tierOfRank(rank),
      pubDate: a.pubDate,
      summary: a.summary || null,
      bodyAvailable: a.bodyAvailable,
      discussionUrl: a.discussionUrl || null,
    })),
  };

  writeJson(path.join(OUT_DIR, 'news.json'), output);
  if (!dryRun) {
    writeJson(path.join(OUT_DIR, 'archive', `${jstDate(now)}.json`), output);
    for (const a of selected) seen[a.id] = now.toISOString();
    writeJson(SEEN_FILE, pruneSeen(seen, now));
  }
  console.log(`[build] 完了: ${path.relative(ROOT, path.join(OUT_DIR, 'news.json'))}`);
}

/** 全候補を1回の呼び出しで採点する（同じ基準で相対評価させ、重複も判定させるため） */
async function scoreCandidates(candidates) {
  const list = candidates.map(c => ({
    id: c.id, title: c.title, outlet: c.outlet, region: c.region, snippet: c.snippet,
  }));
  const result = await generateJson({
    models: SCORING_MODELS,
    system: SCORING_PROMPT,
    prompt: `記事候補（${list.length}件）:\n${list.map(x => JSON.stringify(x)).join('\n')}`,
    schema: SCORING_SCHEMA,
  });

  // order はモデルが付けた順位（items の並び順）。同点のときの並びに使う
  const byId = new Map(result.items.map((r, order) => [r.id, { ...r, order }]));
  const validCategories = new Set(CATEGORIES.map(c => c.id));
  return candidates
    .filter(c => byId.has(c.id))
    .map(c => {
      const r = byId.get(c.id);
      return {
        ...c,
        headline: r.headline.trim() || c.title,
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        category: validCategories.has(r.category) ? r.category : 'business',
        duplicateOf: r.duplicateOf && byId.has(r.duplicateOf) && r.duplicateOf !== c.id ? r.duplicateOf : null,
        order: r.order,
      };
    });
}

/**
 * 掲載記事を選ぶ。まず各カテゴリーの上位を最低件数ずつ確保し、残りを重要度順に埋める。
 * 1カテゴリーの上限も設け、特定の分野だけで紙面が埋まらないようにする。
 */
function selectBalanced(scored) {
  const ranked = scored
    .filter(a => !a.duplicateOf && a.score >= COLLECT.minScore)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const picked = new Set();
  const count = {};
  const take = a => {
    picked.add(a);
    count[a.category] = (count[a.category] || 0) + 1;
  };

  for (const c of CATEGORIES) {
    ranked.filter(a => a.category === c.id).slice(0, COLLECT.perCategoryMin).forEach(take);
  }
  for (const a of ranked) {
    if (picked.size >= COLLECT.maxPublished) break;
    if (!picked.has(a) && (count[a.category] || 0) < COLLECT.perCategoryMax) take(a);
  }
  return ranked.filter(a => picked.has(a)).slice(0, COLLECT.maxPublished);
}

async function attachBodies(articles) {
  const queue = [...articles];
  const worker = async () => {
    for (let a; (a = queue.shift()); ) {
      const body = a.bodyHtml
        ? { text: htmlFragmentToText(a.bodyHtml) || null }
        : a.fetchBody === false
          ? { text: null, reason: 'skipped' }
          : await fetchArticleBody(a.url);
      a.body = body.text;
      a.bodyAvailable = Boolean(body.text);
      if (!a.bodyAvailable) console.log(`[body] 取得不可 (${body.reason}): ${a.url}`);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
}

async function summarize(articles) {
  const deadline = Date.now() + COLLECT.summaryTimeLimitMin * 60 * 1000;
  const failed = [];

  for (let i = 0; i < articles.length; i += SUMMARY_BATCH) {
    const batch = articles.slice(i, i + SUMMARY_BATCH);
    if (Date.now() > deadline) {
      failed.push(...batch);
      continue;
    }
    try {
      const result = await generateJson({
        models: SUMMARY_MODELS,
        system: SUMMARY_PROMPT,
        prompt: summaryPrompt(batch, BODY_CHARS_FOR_SUMMARY),
        schema: SUMMARY_SCHEMA,
      });
      applySummaries(batch, result);
      console.log(`[summary] ${Math.min(i + SUMMARY_BATCH, articles.length)}/${articles.length}`);
    } catch (e) {
      console.error(`[summary] Gemini で要約できず (${e.status || e.message}): ${batch.length}件`);
    }
    failed.push(...batch.filter(a => !a.summary));
  }

  // Gemini で要約できなかった記事は、予備AI（Groq）で1件ずつ要約する
  for (const a of failed) {
    if (!groqAvailable() || Date.now() > deadline) break;
    const result = await groqJson({ system: SUMMARY_PROMPT, prompt: summaryPrompt([a], GROQ_BODY_CHARS), schema: SUMMARY_SCHEMA });
    if (result) applySummaries([a], result);
    console.log(`[summary] 予備AIで要約: ${a.summary ? '成功' : '失敗'} ${a.id}`);
  }

  const missing = articles.filter(a => !a.summary).length;
  if (missing) console.warn(`[summary] 要約なしで掲載: ${missing}件`);
}

function summaryPrompt(batch, bodyChars) {
  const payload = batch.map(a => ({
    id: a.id,
    title: a.title,
    outlet: a.outlet,
    bodyAvailable: a.bodyAvailable,
    ...(a.bodyAvailable ? { body: a.body.slice(0, bodyChars) } : { snippet: a.snippet }),
  }));
  return `記事（${payload.length}件）:\n${JSON.stringify(payload)}`;
}

function applySummaries(batch, result) {
  for (const r of result?.items || []) {
    const a = batch.find(x => x.id === r.id);
    const paragraphs = (Array.isArray(r.paragraphs) ? r.paragraphs : [r.summary || ''])
      .map(p => String(p).trim())
      .filter(Boolean);
    if (a && paragraphs.length) a.summary = paragraphs.join('\n\n');
  }
}

function fakeScores(candidates) {
  const ids = CATEGORIES.map(c => c.id);
  return candidates.map(c => {
    const n = parseInt(c.id.slice(0, 6), 16);
    return { ...c, headline: c.title, score: 30 + (n % 70), category: ids[n % ids.length], duplicateOf: null, order: 0 };
  });
}

function pruneSeen(seen, now) {
  const limit = now.getTime() - COLLECT.seenRetentionDays * 86400 * 1000;
  return Object.fromEntries(Object.entries(seen).filter(([, t]) => new Date(t).getTime() >= limit));
}

function jstDate(d) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d); // YYYY-MM-DD
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

main().catch(e => {
  console.error('[build] エラー:', e.message);
  process.exit(1);
});
