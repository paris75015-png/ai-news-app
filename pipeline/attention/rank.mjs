/**
 * 注目度の試作・第2段：見出しを「同じ出来事」にまとめ、媒体ごとの扱いの大きさを合計して並べる。
 *   node pipeline/attention/rank.mjs [headlines.json]   （GEMINI_API_KEY が必要）
 * 出力：data/attention/YYYY-MM-DD-ranking.json と、標準出力に上位の一覧
 *
 * 点数の考え方（LLM は「同じ出来事か」の判定だけを行い、点数は並び順から機械的に出す）
 *   媒体 m が出来事 e に付けた重さ w(m,e) = その媒体での最上位の見出しの重み
 *     rank 型フィード … 先頭 1.0 から末尾 0.3 まで直線的に下がる
 *     time 型フィード … 新着順で重要度を表さないので一律 0.5
 *   注目度 = 取り上げた媒体の重さの合計 ÷ 測れた媒体数 × 100（満点＝全媒体が先頭で扱う）
 *   海外と国内を別々に計算し、差（世界は大きく・日本は薄い）を gap として出す
 */
import fs from 'node:fs';
import path from 'node:path';
import { initGemini, generateJson } from '../gemini.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'data', 'attention');
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');
initGemini(process.env.GEMINI_API_KEY);

const file = process.argv[2] || fs.readdirSync(OUT).filter(f => f.endsWith('-headlines.json')).sort().pop();
const src = JSON.parse(fs.readFileSync(path.isAbsolute(file) ? file : path.join(OUT, path.basename(file)), 'utf8'));
const feeds = src.feeds.filter(f => f.ok);

// 見出し1件ごとに通し番号を振る
const items = [];
for (const f of feeds) {
  f.items.forEach((it, i) => {
    const n = f.items.length;
    const weight = f.kind === 'rank' ? 1 - 0.7 * (n > 1 ? i / (n - 1) : 0) : 0.5;
    items.push({ n: items.length, feed: f.id, region: f.region, title: it.title, url: it.url, weight });
  });
}

const prompt = `次の見出し一覧は、世界各国の報道機関（w:海外、j:国内）の見出しです。形式は「番号|媒体|見出し」です。
同じ出来事・同じ話題を報じている見出しをまとめてください。

規則
- 2つ以上の「異なる媒体」が報じている出来事だけを出す。1媒体しか報じていないものは出さない
- 同じ媒体の複数見出しが同じ出来事なら、同じグループに入れてよい
- 出来事の粒度は「具体的な1つの出来事・1つの論点」。戦争や選挙など大きな括りに丸めない（例：「イラン戦争」ではなく「米国のイラク撤退をイランが勝利と評価」）
- title は日本語の短い見出し（25字以内）。事実だけを書き、評価語を足さない
- スポーツ・芸能・天気の定型記事は除く
- members には、そのグループに属する見出しの番号をすべて入れる

${items.map(i => `${i.n}|${i.feed}|${i.title}`).join('\n')}`;

const schema = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          members: { type: 'array', items: { type: 'integer' } },
        },
        required: ['title', 'members'],
      },
    },
  },
  required: ['stories'],
};

console.log(`見出し ${items.length}件（${feeds.length}媒体）をまとめます…`);
const { stories } = await generateJson({ models: MODELS, system: '報道の見出しを、同じ出来事ごとに正確にグループ化する編集者。', prompt, schema });

const total = { world: feeds.filter(f => f.region === 'world').length, jp: feeds.filter(f => f.region === 'jp').length };
const byId = Object.fromEntries(feeds.map(f => [f.id, f]));

const ranking = stories.map(s => {
  const best = {}; // 媒体 → その出来事での最大の重さと見出し
  for (const n of s.members) {
    const it = items[n];
    if (!it) continue;
    if (!best[it.feed] || it.weight > best[it.feed].weight) best[it.feed] = it;
  }
  const outlets = Object.entries(best).map(([id, it]) => ({ id, name: byId[id].name, region: it.region, weight: +it.weight.toFixed(2), title: it.title, url: it.url }));
  const part = r => outlets.filter(o => o.region === r);
  const score = r => (total[r] ? Math.round((part(r).reduce((a, o) => a + o.weight, 0) / total[r]) * 100) : 0);
  const cover = r => `${part(r).length}/${total[r]}`;
  return {
    title: s.title,
    worldScore: score('world'), worldCoverage: cover('world'),
    jpScore: score('jp'), jpCoverage: cover('jp'),
    gap: score('world') - score('jp'),
    outlets,
  };
}).filter(r => r.outlets.length >= 2).sort((a, b) => b.worldScore - a.worldScore);

const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, `${date}-ranking.json`), JSON.stringify({ date, feeds: { ...total, unreachable: src.feeds.filter(f => !f.ok).map(f => ({ id: f.id, name: f.name, error: f.error })) }, ranking }, null, 1));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n=== 世界の注目度（海外${total.world}媒体・国内${total.jp}媒体で測定）===`);
console.log(pad('順', 3), pad('海外', 6), pad('取上', 7), pad('国内', 5), pad('取上', 6), '出来事');
ranking.slice(0, 30).forEach((r, i) => console.log(pad(i + 1, 3), pad(r.worldScore, 6), pad(r.worldCoverage, 7), pad(r.jpScore, 5), pad(r.jpCoverage, 6), r.title));
console.log('\n=== 世界は大きく、日本は薄い（差の大きい順）===');
ranking.filter(r => r.worldScore >= 15).sort((a, b) => b.gap - a.gap).slice(0, 15).forEach(r => console.log(pad(r.gap, 4), pad(r.worldCoverage, 7), pad(r.jpCoverage, 5), r.title));
