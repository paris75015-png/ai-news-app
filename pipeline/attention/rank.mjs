/**
 * 注目度：見出しを「同じ出来事」にまとめ、媒体ごとの扱いの大きさを合計して並べる。
 * 数日続く話題を追えるよう、前日までの話題の一覧を渡して同じ話題に同じ id を引き継ぐ。
 *   node pipeline/attention/rank.mjs [headlines.json]   （GEMINI_API_KEY が必要）
 *
 * 入力  data/attention/YYYY-MM-DD-headlines.json（fetch.mjs の出力）
 *       data/attention/stories.json（話題の台帳。毎日更新して保存する）
 * 出力  public/data/attention/YYYY-MM-DD.json と latest.json（画面用の順位表）
 *       data/attention/stories.json（台帳）
 *
 * 点数の考え方（LLM は「同じ出来事か」の判定だけを行い、点数は並び順から機械的に出す）
 *   媒体 m が出来事 e に付けた重さ w(m,e) = その媒体での最上位の見出しの重み
 *     rank 型フィード … 先頭 1.0 から末尾 0.3 まで直線的に下がる
 *     time 型フィード … 新着順で重要度を表さないので一律 0.5
 *   注目度 = 取り上げた媒体の重さの合計 ÷ 測れた媒体数 × 100（満点＝全媒体が先頭で扱う）
 *   海外と国内を別々に計算する
 */
import fs from 'node:fs';
import path from 'node:path';
import { initGemini, generateJson } from '../gemini.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, 'data', 'attention');
const PUBLIC_OUT = path.join(ROOT, 'public', 'data', 'attention');
const STORIES_FILE = path.join(WORK, 'stories.json');
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const CONTINUE_DAYS = 5;   // 何日前までの話題を引き継ぎ対象にするか（営業日の記録で数える）
const KEEP_DAYS = 30;      // 台帳に残す日数

if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');
initGemini(process.env.GEMINI_API_KEY);

const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const file = process.argv[2] || path.join(WORK, `${date}-headlines.json`);
const src = JSON.parse(fs.readFileSync(file, 'utf8'));
const feeds = src.feeds.filter(f => f.ok);

const registry = fs.existsSync(STORIES_FILE) ? JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8')) : { stories: {} };
const stories = registry.stories;

// 引き継ぎ対象：直近の記録日（営業日）CONTINUE_DAYS 日以内に出た話題
const recentDates = [...new Set(Object.values(stories).flatMap(s => Object.keys(s.days)))].filter(d => d < date).sort().slice(-CONTINUE_DAYS);
const candidates = Object.values(stories).filter(s => recentDates.some(d => s.days[d]));

// 見出し1件ごとに通し番号を振る
const items = [];
for (const f of feeds) {
  f.items.forEach((it, i) => {
    const n = f.items.length;
    const weight = f.kind === 'rank' ? 1 - 0.7 * (n > 1 ? i / (n - 1) : 0) : 0.5;
    items.push({ n: items.length, feed: f.id, region: f.region, title: it.title, url: it.url, weight, via: f.via });
  });
}

const prompt = `次の見出し一覧は、世界各国の報道機関の見出しです。形式は「番号|媒体|見出し」です。
同じ出来事・同じ話題を報じている見出しをまとめてください。

規則
- 2つ以上の「異なる媒体」が報じている出来事だけを出す。1媒体しか報じていないものは出さない
- 同じ媒体の複数見出しが同じ出来事なら、同じグループに入れてよい
- 出来事の粒度は「具体的な1つの出来事・1つの論点」。戦争や選挙など大きな括りに丸めない
- title は日本語の短い見出し（25字以内）。事実だけを書き、評価語を足さない
- スポーツ・芸能・天気の定型記事は除く
- members には、そのグループに属する見出しの番号をすべて入れる
- continuesId：下の「前日までの話題」と**同じ出来事の続報**（同じ事件・同じ決定・同じ論点の展開）なら、その id を入れる。同じ戦争・同じ国・同じ人物というだけで、別の出来事（別の演説、別の攻撃、別の事件）は引き継がない。該当がなければ空文字
- 同じ前日話題を2つのグループに入れない。迷ったら1つにまとめる
- japan：日本・日本企業・日本人が主題または当事者の話題なら true

前日までの話題（id|最初に出た日|題）
${candidates.length ? candidates.map(s => `${s.id}|${s.firstSeen}|${s.title}`).join('\n') : '（なし）'}

今日の見出し
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
          continuesId: { type: 'string' },
          japan: { type: 'boolean' },
        },
        required: ['title', 'members', 'continuesId', 'japan'],
      },
    },
  },
  required: ['stories'],
};

console.log(`見出し ${items.length}件（${feeds.length}媒体）をまとめます。引き継ぎ候補 ${candidates.length}件`);
const { stories: grouped } = await generateJson({ models: MODELS, system: '報道の見出しを、同じ出来事ごとに正確にグループ化する編集者。', prompt, schema });

const total = { world: feeds.filter(f => f.region === 'world').length, jp: feeds.filter(f => f.region === 'jp').length };
const byId = Object.fromEntries(feeds.map(f => [f.id, f]));

// グループ → 媒体ごとの最大の重み
const today = [];
for (const g of grouped) {
  const best = {};
  for (const n of g.members) {
    const it = items[n];
    if (it && (!best[it.feed] || it.weight > best[it.feed].weight)) best[it.feed] = it;
  }
  const outlets = Object.entries(best).map(([id, it]) => ({ id, name: byId[id].name, region: it.region, weight: +it.weight.toFixed(2), title: it.title, url: it.url, via: it.via || null }));
  if (outlets.length < 2) continue;
  today.push({ g, outlets });
}

// 同じ前日話題を引き継ぐグループが複数あれば、先頭以外は新しい話題として扱う
const used = new Set();
let seq = 0;
for (const t of today) {
  let id = t.g.continuesId && stories[t.g.continuesId] && !used.has(t.g.continuesId) ? t.g.continuesId : null;
  if (!id) id = `s-${date.replace(/-/g, '')}-${String(++seq).padStart(2, '0')}`;
  used.add(id);
  t.id = id;
}

const part = (outlets, r) => outlets.filter(o => o.region === r);
const score = (outlets, r) => (total[r] ? Math.round((part(outlets, r).reduce((a, o) => a + o.weight, 0) / total[r]) * 100) : 0);

const ranking = today.map(t => {
  const prior = stories[t.id];
  const worldScore = score(t.outlets, 'world');
  const jpScore = score(t.outlets, 'jp');
  const day = { worldScore, worldCoverage: part(t.outlets, 'world').length, jpScore, jpCoverage: part(t.outlets, 'jp').length, outlets: t.outlets };
  const entry = prior || { id: t.id, title: t.g.title, firstSeen: date, days: {} };
  entry.title = prior ? prior.title : t.g.title;      // 題は初出のものを保つ
  entry.latestTitle = t.g.title;
  entry.japan = !!t.g.japan || !!entry.japan;
  entry.lastSeen = date;
  entry.days[date] = day;
  stories[t.id] = entry;
  const daysSeen = Object.keys(entry.days).length;
  const peak = Math.max(...Object.values(entry.days).map(d => d.worldScore));
  return {
    id: t.id,
    title: t.g.title,
    firstSeen: entry.firstSeen,
    daysSeen,
    history: Object.fromEntries(Object.entries(entry.days).map(([d, v]) => [d, v.worldScore])),
    peak,
    worldScore, worldCoverage: `${day.worldCoverage}/${total.world}`,
    jpScore, jpCoverage: `${day.jpCoverage}/${total.jp}`,
    gap: worldScore - jpScore,
    japan: entry.japan,
    outlets: t.outlets,
  };
}).sort((a, b) => b.worldScore - a.worldScore);

// 台帳の古い記録を落とす
const limit = new Date(Date.parse(date) - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
for (const s of Object.values(stories)) {
  for (const d of Object.keys(s.days)) if (d < limit) delete s.days[d];
  if (Object.keys(s.days).length === 0 && !s.dossier) delete stories[s.id];
}
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(PUBLIC_OUT, { recursive: true });
fs.writeFileSync(STORIES_FILE, JSON.stringify(registry, null, 1));

const out = {
  date,
  generatedAt: new Date().toISOString(),
  measured: { world: total.world, jp: total.jp },
  unreachable: src.feeds.filter(f => !f.ok).map(f => ({ id: f.id, name: f.name, error: f.error })),
  ranking,
};
fs.writeFileSync(path.join(PUBLIC_OUT, `${date}.json`), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(PUBLIC_OUT, 'latest.json'), JSON.stringify(out, null, 1));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n=== 世界の注目度（海外${total.world}媒体・国内${total.jp}媒体）===`);
console.log(pad('順', 3), pad('海外', 5), pad('取上', 7), pad('国内', 5), pad('日数', 4), '出来事');
ranking.slice(0, 30).forEach((r, i) => console.log(pad(i + 1, 3), pad(r.worldScore, 5), pad(r.worldCoverage, 7), pad(r.jpScore, 5), pad(r.daysSeen, 4), r.title + (r.japan ? '【日本】' : '')));
