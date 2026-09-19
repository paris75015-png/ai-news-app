/**
 * 毎朝の処理：ニュースを集め、Gemini で見出し・採点・分類・要約をして public/data/news.json に保存する
 *
 *   npm run news            … 本番（.env または環境変数の GEMINI_API_KEY が必要）
 *   npm run news -- --dry-run … AI を呼ばずに流れだけ確認（見出し・要約は仮のもの）
 */

import fs from 'node:fs';
import path from 'node:path';
import { SOURCES } from './sources.js';
import { collectCandidates } from './collect.js';
import { fetchArticleBody, htmlFragmentToText } from './fetchArticle.js';
import { initGemini, generateJson } from './gemini.js';
import {
  COLLECT, EDITORIAL_VERSION, MODEL, CATEGORIES, tierOf,
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
  }

  const seen = readJson(SEEN_FILE, {});
  const all = await collectCandidates(SOURCES);
  const candidates = all.filter(c => !seen[c.id]);
  console.log(`[build] 候補 ${all.length}件（うち既出 ${all.length - candidates.length}件を除外）`);
  if (candidates.length === 0) throw new Error('候補がありません');

  const scored = dryRun ? fakeScores(candidates) : await scoreCandidates(candidates);
  const selected = scored
    .filter(a => !a.duplicateOf && a.score >= COLLECT.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, COLLECT.maxPublished);
  console.log(`[build] 掲載 ${selected.length}件`);
  if (selected.length === 0) throw new Error('掲載できる記事がありません');

  await attachBodies(selected);
  if (dryRun) selected.forEach(a => (a.summary = `（dry-run）${a.snippet}`));
  else await summarize(selected);

  const now = new Date();
  const output = {
    generatedAt: now.toISOString(),
    editorialVersion: EDITORIAL_VERSION,
    model: dryRun ? 'dry-run' : MODEL,
    categories: CATEGORIES,
    articles: selected.map(a => ({
      id: a.id,
      url: a.url,
      headline: a.headline,
      originalTitle: a.title,
      outlet: a.outlet,
      region: a.region,
      category: a.category,
      score: a.score,
      tier: tierOf(a.score),
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
    system: SCORING_PROMPT,
    prompt: `記事候補（${list.length}件）:\n${list.map(x => JSON.stringify(x)).join('\n')}`,
    schema: SCORING_SCHEMA,
  });

  const byId = new Map(result.items.map(r => [r.id, r]));
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
      };
    });
}

async function attachBodies(articles) {
  const queue = [...articles];
  const worker = async () => {
    for (let a; (a = queue.shift()); ) {
      const body = a.bodyHtml
        ? { text: htmlFragmentToText(a.bodyHtml) || null }
        : await fetchArticleBody(a.url);
      a.body = body.text;
      a.bodyAvailable = Boolean(body.text);
      if (!a.bodyAvailable) console.log(`[body] 取得不可 (${body.reason}): ${a.url}`);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
}

async function summarize(articles) {
  for (let i = 0; i < articles.length; i += SUMMARY_BATCH) {
    const batch = articles.slice(i, i + SUMMARY_BATCH);
    const payload = batch.map(a => ({
      id: a.id,
      title: a.title,
      outlet: a.outlet,
      bodyAvailable: a.bodyAvailable,
      ...(a.bodyAvailable ? { body: a.body.slice(0, BODY_CHARS_FOR_SUMMARY) } : { snippet: a.snippet }),
    }));
    try {
      const result = await generateJson({
        system: SUMMARY_PROMPT,
        prompt: `記事（${payload.length}件）:\n${JSON.stringify(payload)}`,
        schema: SUMMARY_SCHEMA,
      });
      for (const r of result.items) {
        const a = batch.find(x => x.id === r.id);
        if (a && r.summary.trim()) a.summary = r.summary.trim();
      }
      console.log(`[summary] ${Math.min(i + SUMMARY_BATCH, articles.length)}/${articles.length}`);
    } catch (e) {
      // 要約に失敗しても見出しと点数は掲載する
      console.error(`[summary] 失敗 (${e.status || e.message}): ${batch.map(a => a.id).join(', ')}`);
    }
  }
}

function fakeScores(candidates) {
  const ids = CATEGORIES.map(c => c.id);
  return candidates.map(c => {
    const n = parseInt(c.id.slice(0, 6), 16);
    return { ...c, headline: c.title, score: 30 + (n % 70), category: ids[n % ids.length], duplicateOf: null };
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
