/**
 * 要約AIの比較用（公開ページには影響しない）
 * 今日の紙面から数件を選び、同じ本文・同じ指示で Gemini と Groq の両方に要約させてログに出す。
 *
 *   GEMINI_API_KEY=... GROQ_API_KEY=... node pipeline/compare.mjs [件数] [Geminiモデル,...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchArticleBody } from './fetchArticle.js';
import { initGemini, generateJson } from './gemini.js';
import { initGroq, groqJson, GROQ_BODY_CHARS } from './groq.js';
import { SUMMARY_PROMPT, SUMMARY_SCHEMA, SUMMARY_MODELS, FALLBACK_MODEL } from './editorial.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const count = Number(process.argv[2] || 6);
const geminiModels = process.argv[3] ? process.argv[3].split(',') : SUMMARY_MODELS;

initGemini(process.env.GEMINI_API_KEY);
initGroq(process.env.GROQ_API_KEY);

// 本文が取れる記事を、カテゴリーと海外／国内がばらけるように選ぶ
const news = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/news.json'), 'utf8'));
const picked = [];
const usedKeys = new Set();
for (const a of news.articles) {
  if (picked.length >= count) break;
  const key = `${a.category}-${a.region}`;
  if (usedKeys.has(key)) continue;
  const body = await fetchArticleBody(a.url);
  if (!body.text) continue;
  usedKeys.add(key);
  picked.push({ ...a, body: body.text.slice(0, GROQ_BODY_CHARS) }); // 両者に同じ長さの本文を渡す
}

const results = [];
for (const a of picked) {
  const prompt = `記事（1件）:\n${JSON.stringify([{ id: a.id, title: a.originalTitle, outlet: a.outlet, bodyAvailable: true, body: a.body }])}`;
  const entry = { id: a.id, title: a.originalTitle, outlet: a.outlet, url: a.url };

  let t = Date.now();
  try {
    const g = await generateJson({ models: geminiModels, system: SUMMARY_PROMPT, prompt, schema: SUMMARY_SCHEMA });
    entry.gemini = { ms: Date.now() - t, ...g.items?.[0] };
  } catch (e) {
    entry.gemini = { ms: Date.now() - t, error: String(e.status || e.message) };
  }

  t = Date.now();
  const q = await groqJson({ system: SUMMARY_PROMPT, prompt, schema: SUMMARY_SCHEMA });
  entry.groq = q ? { ms: Date.now() - t, ...q.items?.[0] } : { ms: Date.now() - t, error: 'failed' };

  results.push(entry);
  console.log(`[compare] ${results.length}/${picked.length} ${a.outlet}`);
}

console.log(`[compare] Gemini候補: ${geminiModels.join(',')} / Groq: ${FALLBACK_MODEL}`);
console.log('===COMPARE_JSON_START===');
console.log(JSON.stringify(results));
console.log('===COMPARE_JSON_END===');
