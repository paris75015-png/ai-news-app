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
  SCORING_MODELS, SUMMARY_MODELS, FALLBACK_MODEL, GROQ_TOP_ARTICLES,
  SCORING_PROMPT, SCORING_SCHEMA, SUMMARY_PROMPT, SUMMARY_SCHEMA, HEADLINE_PROMPT, HEADLINE_SCHEMA,
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
    console.log(`[build] Groq: ${groqAvailable() ? '有効' : '未設定（Gemini のみで要約）'}`);
  }

  const seen = readJson(SEEN_FILE, {});
  const today = jstDate(new Date());
  const all = await collectCandidates(SOURCES);
  // 前日までに掲載した記事は除く（同じ日の再実行では、今日の記事を消さないよう除外しない）
  const candidates = all.filter(c => !seen[c.id] || jstDate(new Date(seen[c.id])) === today);
  console.log(`[build] 候補 ${all.length}件（うち既出 ${all.length - candidates.length}件を除外）`);
  if (candidates.length === 0) throw new Error('候補がありません');

  const scored = dryRun ? fakeScores(candidates) : await scoreCandidates(candidates);
  // 本文が取れない記事を差し替えられるよう、多めに選んでから本文を取得する
  const ranked = scored
    .filter(a => !a.duplicateOf)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const shortlist = selectBalanced(ranked, COLLECT.maxPublished + COLLECT.selectionBuffer);
  await attachBodies(shortlist);
  if (!dryRun) await substituteFromDuplicates(shortlist, scored);

  // 本文が取れた記事だけで、カテゴリーの配分をやり直して最終決定する
  const selected = selectBalanced(shortlist.filter(a => a.bodyAvailable), COLLECT.maxPublished);
  const dropped = shortlist.filter(a => !a.bodyAvailable).length;
  const perCategory = CATEGORIES.map(c => `${c.label}${selected.filter(a => a.category === c.id).length}`).join(' ');
  console.log(`[build] 掲載 ${selected.length}件（${perCategory}）／本文が取れず不採用 ${dropped}件`);
  if (selected.length === 0) throw new Error('掲載できる記事がありません');

  if (dryRun) selected.forEach(a => (a.summary = `（dry-run）${a.snippet}`));
  else {
    await summarize(selected);
    await fillHeadlines(selected);
    await verifyHeadlines(selected);
  }

  const now = new Date();
  const output = {
    generatedAt: now.toISOString(),
    editorialVersion: EDITORIAL_VERSION,
    models: dryRun ? ['dry-run'] : [...usedModels, ...(groqUsed ? [FALLBACK_MODEL] : [])],
    categories: CATEGORIES,
    articles: selected.map((a, rank) => ({
      id: a.id,
      url: a.url,
      headline: a.headline || a.title,
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
      summarizedBy: a.summarizedBy || null,
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
  const items = await scoreList(candidates);
  console.log(`[score] ${items.length}/${candidates.length}件の採点が返った`);

  // 採点が返らなかった候補があれば、その分だけもう一度採点する（混雑時の軽量モデルは途中で出力を打ち切ることがある）
  const returned = new Set(items.map(r => r.id));
  const missing = candidates.filter(c => !returned.has(c.id));
  if (missing.length > candidates.length * 0.1) {
    const more = await scoreList(missing).catch(e => {
      console.warn(`[score] 追加採点に失敗 (${e.status || e.message})`);
      return [];
    });
    console.log(`[score] 追加採点 ${more.length}/${missing.length}件`);
    items.push(...more);
  }

  // order はモデルが付けた順位（items の並び順）。同点のときの並びに使う
  const byId = new Map(items.map((r, order) => [r.id, { ...r, order }]));
  const validCategories = new Set(CATEGORIES.map(c => c.id));
  return candidates
    .filter(c => byId.has(c.id))
    .map(c => {
      const r = byId.get(c.id);
      return {
        ...c,
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        category: validCategories.has(r.category) ? r.category : 'business',
        duplicateOf: r.duplicateOf && byId.has(r.duplicateOf) && r.duplicateOf !== c.id ? r.duplicateOf : null,
        order: r.order,
      };
    });
}

async function scoreList(candidates) {
  const list = candidates.map(c => ({
    id: c.id, title: c.title, outlet: c.outlet, region: c.region, snippet: c.snippet,
  }));
  const result = await generateJson({
    models: SCORING_MODELS,
    system: SCORING_PROMPT,
    prompt: `記事候補（${list.length}件）:\n${list.map(x => JSON.stringify(x)).join('\n')}`,
    schema: SCORING_SCHEMA,
  });
  return result.items || [];
}

/**
 * 重要度順の記事から limit 件を選ぶ。まず各カテゴリー（小分類ごと）の上位を最低件数ずつ確保し、
 * 残りを重要度順に埋める。1カテゴリーの上限も設け、特定の分野だけで紙面が埋まらないようにする。
 */
function selectBalanced(ranked, limit) {
  const picked = new Set();
  const count = {};
  const take = a => {
    picked.add(a);
    count[a.category] = (count[a.category] || 0) + 1;
  };
  const fill = (minScore, maxPerCategory) => {
    for (const a of ranked) {
      if (picked.size >= limit) return;
      if (!picked.has(a) && a.score >= minScore && (count[a.category] || 0) < maxPerCategory) take(a);
    }
  };

  // 1) 各カテゴリーの上位を最低件数ずつ（点数が低めでも、その分野の最上位なら載せる）
  for (const c of CATEGORIES) {
    ranked.filter(a => a.category === c.id && a.score >= COLLECT.minScore - 15)
      .slice(0, COLLECT.perCategoryMin).forEach(take);
  }
  // 2) 残りを重要度順に、カテゴリー上限を守って埋める
  fill(COLLECT.minScore, COLLECT.perCategoryMax);
  // 3) それでも件数が足りない日は、上限と点数の条件を緩めて30件前後にそろえる
  fill(COLLECT.minScore, Infinity);
  fill(COLLECT.minScore - 15, Infinity);

  return ranked.filter(a => picked.has(a));
}

/**
 * 本文が取れなかった記事は、同じ出来事を報じた別の媒体の記事（採点時に重複と判定されたもの）に差し替える。
 * 点数・カテゴリーはそのまま引き継ぐ。
 */
async function substituteFromDuplicates(shortlist, scored) {
  for (const a of shortlist.filter(x => !x.bodyAvailable)) {
    const alternatives = scored.filter(d => d.duplicateOf === a.id);
    for (const d of alternatives) {
      const body = d.bodyHtml ? { text: htmlFragmentToText(d.bodyHtml) || null } : await fetchArticleBody(d.url);
      if (!body.text) continue;
      console.log(`[body] 差し替え: ${a.outlet} → ${d.outlet}（${d.title.slice(0, 40)}）`);
      Object.assign(a, {
        id: d.id, url: d.url, title: d.title, snippet: d.snippet, outlet: d.outlet, region: d.region,
        sourceId: d.sourceId, discussionUrl: d.discussionUrl, body: body.text, bodyAvailable: true,
      });
      break;
    }
  }
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

/**
 * 要約：重要度上位の記事は Groq（情報量が多い）、残りは Gemini が同時に担当する。
 * どちらかで失敗した記事は、もう一方で要約し直す。
 */
async function summarize(articles) {
  const deadline = Date.now() + COLLECT.summaryTimeLimitMin * 60 * 1000;
  const useGroq = groqAvailable();
  const groqPart = useGroq ? articles.slice(0, GROQ_TOP_ARTICLES) : [];
  const geminiPart = useGroq ? articles.slice(GROQ_TOP_ARTICLES) : articles;

  await Promise.all([summarizeWithGroq(groqPart, deadline), summarizeWithGemini(geminiPart, deadline)]);

  // 取りこぼしを、もう一方のAIで補う
  const leftover = articles.filter(a => !a.summary);
  if (leftover.length) {
    console.log(`[summary] 取りこぼし ${leftover.length}件を補完`);
    await summarizeWithGemini(leftover.filter(a => groqPart.includes(a)), deadline);
    await summarizeWithGroq(articles.filter(a => !a.summary), deadline);
  }

  const missing = articles.filter(a => !a.summary).length;
  if (missing) console.warn(`[summary] 要約なしで掲載: ${missing}件`);
}

async function summarizeWithGemini(articles, deadline) {
  for (let i = 0; i < articles.length; i += SUMMARY_BATCH) {
    if (Date.now() > deadline) return;
    const batch = articles.slice(i, i + SUMMARY_BATCH);
    try {
      const result = await generateJson({
        models: SUMMARY_MODELS,
        system: SUMMARY_PROMPT,
        prompt: summaryPrompt(batch, BODY_CHARS_FOR_SUMMARY),
        schema: SUMMARY_SCHEMA,
      });
      applySummaries(batch, result, 'gemini');
      console.log(`[gemini] 要約 ${batch.filter(a => a.summary).length}/${batch.length}件`);
    } catch (e) {
      console.error(`[gemini] 要約できず (${e.status || e.message}): ${batch.length}件`);
    }
  }
}

async function summarizeWithGroq(articles, deadline) {
  for (const a of articles) {
    if (!groqAvailable() || Date.now() > deadline) return;
    const result = await groqJson({ system: SUMMARY_PROMPT, prompt: summaryPrompt([a], GROQ_BODY_CHARS), schema: SUMMARY_SCHEMA });
    if (result) applySummaries([a], result, 'groq');
    console.log(`[groq] 要約 ${a.summary ? '成功' : '失敗'} ${a.id}`);
  }
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

function applySummaries(batch, result, by) {
  for (const r of result?.items || []) {
    const a = batch.find(x => x.id === r.id);
    if (!a) continue;
    const paragraphs = (Array.isArray(r.paragraphs) ? r.paragraphs : [r.summary || ''])
      .map(p => String(p).trim())
      .filter(Boolean);
    if (paragraphs.length) {
      a.summary = paragraphs.join('\n\n');
      a.summarizedBy = by;
    }
    if (r.headline?.trim()) a.headline = r.headline.trim();
  }
}

/**
 * 見出しの固有名詞（カタカナ語・英字語）が、要約本文か元の見出しに出てくるかを機械的に確かめる。
 * 出てこない語がある見出しは取り違えの疑いがあるので、要約本文から作り直す。
 * それでも合わなければ、要約の最初の一文を見出しにする。
 */
async function verifyHeadlines(articles) {
  const suspicious = articles.filter(a => a.summary && headlineIssues(a).length);
  if (suspicious.length === 0) return;
  for (const a of suspicious) console.warn(`[headline] 要確認「${a.headline}」: ${headlineIssues(a).join('、')}`);

  try {
    const result = await generateJson({
      models: SUMMARY_MODELS,
      system: `${HEADLINE_PROMPT}\n要約（summary）に書かれている固有名詞・数値だけを使う。`,
      prompt: JSON.stringify(suspicious.map(a => ({ id: a.id, title: a.title, summary: a.summary }))),
      schema: HEADLINE_SCHEMA,
    });
    for (const r of result.items || []) {
      const a = suspicious.find(x => x.id === r.id);
      if (a && r.headline?.trim()) a.headline = r.headline.trim();
    }
  } catch (e) {
    console.warn(`[headline] 作り直しに失敗 (${e.status || e.message})`);
  }

  for (const a of suspicious) {
    if (headlineIssues(a).length === 0) continue;
    const first = a.summary.split(/(?<=。)/)[0];
    a.headline = first.length > 60 ? `${first.slice(0, 58)}…` : first.replace(/。$/, '');
    console.warn(`[headline] 要約の冒頭を見出しに使用: ${a.id}`);
  }
}

/** 見出しの疑わしい点を挙げる（空なら問題なし） */
function headlineIssues(a) {
  const issues = unsupportedTerms(a);
  // 本文に former / 前・元 が無いのに「前大統領」「元CEO」などと書いていないか
  const exPosition = a.headline.match(/[前元](大統領|首相|社長|会長|CEO|長官|知事|委員長|議長)/);
  const reference = `${a.summary || ''} ${a.body || ''} ${a.title || ''}`.toLowerCase();
  if (exPosition && !/former|ex-|前職|退任|辞任|元[^\s]{0,4}(だった|である)/.test(reference)) {
    issues.push(`${exPosition[0]}（本文に前職の記載なし）`);
  }
  return issues;
}

function unsupportedTerms(a) {
  const reference = `${a.summary || ''} ${a.title || ''}`.toLowerCase();
  const katakana = (a.headline.match(/[ァ-ヶー]{5,}/g) || [])  // システム・サーバーのような一般的な短い語は対象外
    // 「プライバシーリスク」のような複合語は、4文字のまとまりがどこかに出てくれば可とする
    .filter(t => ![...Array(t.length - 3).keys()].some(k => reference.includes(t.slice(k, k + 4))));
  const latin = (a.headline.match(/[A-Za-z][A-Za-z0-9.&'-]{2,}/g) || [])
    .filter(t => !/^[A-Z0-9]{2,4}$/.test(t)) // ATC などの短い略語は対象外
    .filter(t => !reference.includes(t.toLowerCase()));
  return [...katakana, ...latin];
}

/** 要約できず見出しも無い記事は、見出しだけまとめて日本語化する（英語の見出しのまま載せないため） */
async function fillHeadlines(articles) {
  const missing = articles.filter(a => !a.headline);
  if (missing.length === 0) return;
  try {
    const result = await generateJson({
      models: SUMMARY_MODELS,
      system: HEADLINE_PROMPT,
      prompt: JSON.stringify(missing.map(a => ({ id: a.id, title: a.title, snippet: a.snippet }))),
      schema: HEADLINE_SCHEMA,
    });
    for (const r of result.items || []) {
      const a = missing.find(x => x.id === r.id);
      if (a && r.headline?.trim()) a.headline = r.headline.trim();
    }
  } catch (e) {
    console.warn(`[headline] 見出しの日本語化に失敗 (${e.status || e.message})。元の見出しで掲載`);
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
