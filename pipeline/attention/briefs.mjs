/**
 * 世界の報道から拾う短信：順位表から、(A) 海外メディアが大きく扱った話題、(B) 日本の主要見出しに出ていない話題 を選び、
 * 各話題の見出しと概要文だけを材料に、日本語の要約（150〜250字）を付ける。
 *   node pipeline/attention/briefs.mjs     （GEMINI_API_KEY が必要）
 *
 * 出力  public/data/attention/{date}-briefs.json と briefs-latest.json
 *       国際深掘りの画面が、深掘りコラムの下にこの短信を並べる（形は src/article.js の Article）
 *
 * (B) の「日本」は、日本6媒体の主要見出し・ランキングの RSS に出たかどうかだけで測っている。
 * 日本で報道されていないことまでは言えないので、画面では「日本の主要見出しに出ていない」と表す（2026-11-07）。
 * 直近の短信に出た話題は、前回の見出しを材料に添え、新しい事実がなければ出さない（同じ話を2日続けて載せない）。
 *
 * 材料は見出し・RSS の概要文・直接読める媒体（最大2つ）の本文冒頭。本文を読んだのは一部の媒体の冒頭だけ（sources の access に 'body' / 'excerpt' / 'headline' で区別して残す）。
 * 要約は、その材料に書いてあることだけで作る。
 */
import fs from 'node:fs';
import path from 'node:path';
import { initGemini, generateJson, lastUsedModel } from '../gemini.js';
import { fetchArticleBody } from '../fetchArticle.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'public', 'data', 'attention');
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const TOP_CANDIDATES = 14; // (A) 注目度の上位からこの数を候補にし、
const TOP_MAX = 10;        //     スポーツ・芸能・ローカル・前回と同じ話を除いて最大この数を載せる
const PREV_ISSUES = 3;     // 「前回の短信」として見る直近の号数
const GAP_CANDIDATES = 12; // (B) の候補数。ここから Gemini が最大 GAP_MAX 件を選ぶ
const GAP_MAX = 5;
const BODIES_PER_STORY = 2;   // 要約の材料に、直接読める媒体の本文冒頭を最大この数だけ足す
const BODY_CHARS = 1800;
const MIN_WORLD_COVERAGE = 3; // (A) は海外 3 媒体以上が取り上げた話題だけ

if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
if (process.env.LLM_PROVIDER !== 'claude' && !process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');
initGemini(process.env.GEMINI_API_KEY || 'unused');

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

const top = pool.filter(r => cov(r) >= MIN_WORLD_COVERAGE).slice(0, TOP_CANDIDATES);
const topIds = new Set(top.map(r => r.id));
// 日本の主要見出しに出ていない話題：海外で複数媒体が扱い、日本6媒体の主要見出しには出ていない
const gapPool = pool.filter(r => !topIds.has(r.id) && cov(r) >= 2 && jpCov(r) === 0)
  .sort((a, b) => b.worldScore - a.worldScore).slice(0, GAP_CANDIDATES);

// 直近の短信（本日より前の PREV_ISSUES 号）に出た話題 → 最後に出た日と見出し
const prevBrief = {};
fs.readdirSync(DIR).filter(f => /^\d{4}-\d{2}-\d{2}-briefs\.json$/.test(f) && f.slice(0, 10) < date).sort().slice(-PREV_ISSUES)
  .forEach(f => {
    for (const a of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).articles || []) {
      const sid = a.id.replace(/^intl-brief-\d{4}-\d{2}-\d{2}-/, '');
      prevBrief[sid] = { date: f.slice(0, 10), headline: a.headline };
    }
  });

// 直接読める媒体の本文冒頭を取る（Google ニュース経由の通信社は見出しだけ）
const bodies = {}; // 話題 id → [{ name, text }]
const targets = [...top, ...gapPool];
await Promise.all(targets.map(async r => {
  const direct = r.outlets.filter(o => o.region === 'world' && !o.via).sort((a, b) => b.weight - a.weight).slice(0, BODIES_PER_STORY);
  const got = await Promise.all(direct.map(async o => {
    const res = await fetchArticleBody(o.url).catch(() => ({ text: null }));
    return res.text ? { name: o.name, text: res.text.slice(0, BODY_CHARS) } : null;
  }));
  bodies[r.id] = got.filter(Boolean);
}));

const material = r => `id: ${r.id}
海外 ${r.worldCoverage}媒体・注目度 ${r.worldScore}・日本 ${r.jpCoverage}
${r.outlets.filter(o => o.region === 'world').slice(0, 6).map(o => `- ${o.name}: ${o.title}${o.desc && o.desc !== o.title ? ` ／ ${o.desc.slice(0, 200)}` : ''}`).join('\n')}
${prevBrief[r.id] ? `[前回の短信・${prevBrief[r.id].date}] ${prevBrief[r.id].headline}\n` : ''}${(bodies[r.id] || []).map(b => `[本文冒頭・${b.name}]\n${b.text}`).join('\n')}`;

const prompt = `あなたは日本の読者向けに、海外メディアの報道を短く紹介する編集者です。
読者は日本経済新聞を読んでおり、日本の報道は把握しています。海外の報道機関が何を大きく扱っているかを知りたい読者です。

次の話題ごとに、日本語の紹介を作ってください。材料は各媒体の見出し・概要文と、一部の媒体の本文冒頭です。

規則
- 材料に書いてあることだけで書く。材料にない背景・数字・人名・因果を足さない
- summary は150〜250字。誰が・何が・どうなったかを先に書く。一文は短く（60字以内）。指示語で始めない
- headline は日本語で30字以内。事実を述べる。評価語・煽りを入れない
- 材料が見出しだけで内容が分からないときは、分かる範囲だけを短く書く。「詳細は見出しからは分からない」のような断り書きは、本当に何も分からないときだけ付ける
- 同じ話題で媒体により着眼点が違うとき、材料から言える範囲で一文で触れてよい（推測はしない）
- 次の話題は出力しない：その国の中だけの事件・事故、スポーツ、芸能、天気、ローカルな話題。また「前回の短信」があり、材料に前回の見出しから進んだ新しい事実がない話題（新しい事実があるときは、その新しい事実を見出しにする）
- kind が "top" の話題は、上の除外をしたうえで、候補の順に最大${TOP_MAX}件を出力する
- kind が "gap" の話題は、上の除外をしたうえで、日本の読者に意味のあるものを最大${GAP_MAX}件だけ選ぶ

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

console.log(`短信の候補：注目度の上位 ${top.length}件、日本の主要見出しにない候補 ${gapPool.length}件（深掘りの資料 ${deepIds.size}件は除外、前回の短信に出た候補 ${targets.filter(r => prevBrief[r.id]).length}件）`);
const { items } = await generateJson({ models: MODELS, system: '材料にあることだけで、海外報道を簡潔に紹介する編集者。', prompt, schema });

const byId = Object.fromEntries(ranking.map(r => [r.id, r]));
const tier = s => (s >= 50 ? 'must' : s >= 30 ? 'should' : 'interest');
const model = lastUsedModel();
const seen = new Set();
const articles = [];
for (const it of items) {
  const r = byId[it.id];
  if (!r || seen.has(it.id) || !it.summary || !it.headline) continue;
  const gap = !topIds.has(it.id);
  if (articles.filter(a => (a.section === 'gap') === gap).length >= (gap ? GAP_MAX : TOP_MAX)) continue; // 件数の上限は機械的にも守る
  seen.add(it.id);
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
    sources: world.map(o => ({ outlet: o.name, url: o.via ? null : o.url, date, access: (bodies[r.id] || []).some(b => b.name === o.name) ? 'body' : o.desc && o.desc !== o.title ? 'excerpt' : 'headline', via: o.via ? 'Google ニュース' : null, note: o.title })),
    continuity: r.daysSeen > 1 ? { previousDate: r.firstSeen, previousScore: r.peak, note: `${r.daysSeen}日連続で報じられている` } : null,
    coverage: { world: r.worldCoverage, jp: r.jpCoverage, worldTotal: measured.world, jpTotal: measured.jp, daysSeen: r.daysSeen },
    bodyAvailable: (bodies[r.id] || []).length > 0,
    discussionUrl: null,
    summarizedBy: model,
  });
}
articles.sort((a, b) => (a.section === b.section ? b.score - a.score : a.section === 'world' ? -1 : 1));

const out = { date, generatedAt: latest.generatedAt, model, measured, articles };
fs.writeFileSync(path.join(DIR, `${date}-briefs.json`), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(DIR, 'briefs-latest.json'), JSON.stringify(out, null, 1));
console.log(`短信 ${articles.length}件（海外の注目 ${articles.filter(a => a.section === 'world').length}、日本の主要見出しにない ${articles.filter(a => a.section === 'gap').length}）`);
articles.forEach(a => console.log(`  [${a.section}] ${a.score} ${a.coverage.world}/${a.coverage.jp} ${a.headline}`));
