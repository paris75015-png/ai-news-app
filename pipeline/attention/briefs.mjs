/**
 * 世界の報道から拾う短信：順位表から、(A) 海外メディアが大きく扱った話題、(B) 日本の報道が薄い話題 を選び、
 * 各話題の見出しと概要文だけを材料に、日本語の要約（150〜250字）を付ける。
 *   node pipeline/attention/briefs.mjs     （GEMINI_API_KEY が必要）
 *
 * 出力  public/data/attention/{date}-briefs.json と briefs-latest.json
 *       国際深掘りの画面が、深掘りコラムの下にこの短信を並べる（形は src/article.js の Article）
 *
 * 材料は見出しと RSS の概要文だけ。本文は読んでいない（sources の access は 'headline' / 'excerpt'）。
 * 要約は、その材料に書いてあることだけで作る。
 */
import fs from 'node:fs';
import path from 'node:path';
import { initGemini, generateJson, lastUsedModel } from '../gemini.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'public', 'data', 'attention');
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const TOP_N = 10;          // (A) 注目度の上位から
const GAP_CANDIDATES = 12; // (B) の候補数。ここから Gemini が最大 GAP_MAX 件を選ぶ
const GAP_MAX = 5;
const MIN_WORLD_COVERAGE = 3; // (A) は海外 3 媒体以上が取り上げた話題だけ

if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');
initGemini(process.env.GEMINI_API_KEY);

const latest = JSON.parse(fs.readFileSync(path.join(DIR, 'latest.json'), 'utf8'));
const { date, ranking, measured } = latest;

// 本日、深掘りの資料になった話題は、深掘りのコラムが扱うので短信には入れない
const dossierDir = path.join(ROOT, 'data', 'dossiers');
const deepIds = new Set(
  fs.existsSync(dossierDir)
    ? fs.readdirSync(dossierDir).filter(f => f.startsWith(date + '-')).map(f => JSON.parse(fs.readFileSync(path.join(dossierDir, f), 'utf8')).id)
    : []
);

const cov = r => Number(r.worldCoverage.split('/')[0]);
const jpCov = r => Number(r.jpCoverage.split('/')[0]);
const pool = ranking.filter(r => !deepIds.has(r.id));

const top = pool.filter(r => cov(r) >= MIN_WORLD_COVERAGE).slice(0, TOP_N);
const topIds = new Set(top.map(r => r.id));
// 日本の報道が薄い話題：海外で複数媒体が扱い、日本の測定媒体の見出しには出ていない
const gapPool = pool.filter(r => !topIds.has(r.id) && cov(r) >= 2 && jpCov(r) === 0)
  .sort((a, b) => b.worldScore - a.worldScore).slice(0, GAP_CANDIDATES);

const material = r => `id: ${r.id}
海外 ${r.worldCoverage}媒体・注目度 ${r.worldScore}・日本 ${r.jpCoverage}
${r.outlets.filter(o => o.region === 'world').slice(0, 6).map(o => `- ${o.name}: ${o.title}${o.desc && o.desc !== o.title ? ` ／ ${o.desc.slice(0, 200)}` : ''}`).join('\n')}`;

const prompt = `あなたは日本の読者向けに、海外メディアの報道を短く紹介する編集者です。
読者は日本経済新聞を読んでおり、日本の報道は把握しています。海外の報道機関が何を大きく扱っているかを知りたい読者です。

次の話題ごとに、日本語の紹介を作ってください。材料は各媒体の見出しと概要文だけです。

規則
- 材料に書いてあることだけで書く。材料にない背景・数字・人名・因果を足さない
- summary は150〜250字。誰が・何が・どうなったかを先に書く。一文は短く（60字以内）。指示語で始めない
- headline は日本語で30字以内。事実を述べる。評価語・煽りを入れない
- 見出しだけで内容が分からないときは、分かる範囲だけ書き、「詳細は見出しからは分からない」と書く
- 同じ話題で媒体により着眼点が違うとき、材料から言える範囲で一文で触れてよい（推測はしない）
- kind が "gap" の話題は、候補の中から日本の読者に意味のあるものを最大${GAP_MAX}件だけ選び、残りは出力しない。国内の事件・スポーツ・芸能・天気・ローカルな話題は選ばない。"top" の話題は選別せず、すべて出力する

${[...top.map(r => ['top', r]), ...gapPool.map(r => ['gap', r])].map(([k, r]) => `kind: ${k}\n${material(r)}`).join('\n\n')}`;

const schema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, headline: { type: 'string' }, summary: { type: 'string' } },
        required: ['id', 'headline', 'summary'],
      },
    },
  },
  required: ['items'],
};

console.log(`短信の候補：注目度の上位 ${top.length}件、日本で薄い候補 ${gapPool.length}件（深掘りの資料 ${deepIds.size}件は除外）`);
const { items } = await generateJson({ models: MODELS, system: '材料にあることだけで、海外報道を簡潔に紹介する編集者。', prompt, schema });

const byId = Object.fromEntries(ranking.map(r => [r.id, r]));
const tier = s => (s >= 50 ? 'must' : s >= 30 ? 'should' : 'interest');
const model = lastUsedModel();
const seen = new Set();
const articles = [];
for (const it of items) {
  const r = byId[it.id];
  if (!r || seen.has(it.id) || !it.summary || !it.headline) continue;
  seen.add(it.id);
  const gap = !topIds.has(it.id);
  const world = r.outlets.filter(o => o.region === 'world').sort((a, b) => b.weight - a.weight);
  const lead = world[0];
  articles.push({
    id: `intl-brief-${date}-${r.id}`,
    stream: 'intl',
    depth: 'brief',
    section: gap ? 'gap' : 'world',
    headline: it.headline,
    originalTitle: lead.title,
    outlet: lead.name,
    url: lead.url,
    region: 'overseas',
    category: null,
    score: r.worldScore,
    tier: tier(r.worldScore),
    pubDate: latest.generatedAt,
    body: null,
    summary: it.summary,
    sources: world.map(o => ({ outlet: o.name, url: o.via ? null : o.url, date, access: o.desc && o.desc !== o.title ? 'excerpt' : 'headline', via: o.via ? 'Google ニュース' : null, note: o.title })),
    continuity: r.daysSeen > 1 ? { previousDate: r.firstSeen, previousScore: r.peak, note: `${r.daysSeen}日連続で報じられている` } : null,
    coverage: { world: r.worldCoverage, jp: r.jpCoverage, worldTotal: measured.world, jpTotal: measured.jp },
    bodyAvailable: false,
    discussionUrl: null,
    summarizedBy: model,
  });
}
articles.sort((a, b) => (a.section === b.section ? b.score - a.score : a.section === 'world' ? -1 : 1));

const out = { date, generatedAt: latest.generatedAt, model, measured, articles };
fs.writeFileSync(path.join(DIR, `${date}-briefs.json`), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(DIR, 'briefs-latest.json'), JSON.stringify(out, null, 1));
console.log(`短信 ${articles.length}件（海外の注目 ${articles.filter(a => a.section === 'world').length}、日本で薄い ${articles.filter(a => a.section === 'gap').length}）`);
articles.forEach(a => console.log(`  [${a.section}] ${a.score} ${a.coverage.world}/${a.coverage.jp} ${a.headline}`));
