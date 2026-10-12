/**
 * 読み物の資料づくり（試験運用）：その曜日のテーマで、海外の論考・報道を数日分集め、
 * 「世界では扱われているのに、日本語では扱いが薄い」話題を上位にして、本文ごと保存する。
 *
 *   node pipeline/longread/collect.mjs            … 本番（GEMINI_API_KEY が必要）
 *   node pipeline/longread/collect.mjs --dry-run  … AI を呼ばず、記事1件を1話題とみなして流れだけ確認
 *
 * 狙い（2026-10-12 のユーザー方針）
 *   速報・短信は日々のニュースサイトで足りる。ここで作るのは、ソースが出揃った数日後に読む深掘りの材料。
 *   日本のヘッドラインに出る話題は日経・Yahoo で補える。必読は「日本語の報道から漏れている・扱いが浅いが、世界では注目されている」もの。
 *
 * 手順
 *   1. テーマの媒体から、直近 MAX_AGE_DAYS 日の記事を集める（sources.js）
 *   2. Gemini 1回で、記事を話題ごとにまとめ、テーマと日本語の検索語を付ける（記事の id で束ねるので表記揺れに強い）
 *   3. 本日のテーマの話題を、媒体数・論考の数で並べ、上位を Google ニュース日本語版で検索して日本語の記事数を数える
 *   4. 日本語の記事が少ないほど上に置き直し、上位 KEEP_TOPICS 件の本文を取る（直接 → 読み取り代行 → フィードの要約文）
 *
 * 出力  data/longread/YYYY-MM-DD.json
 * 書き手（Claude の定期実行）はまだこの資料を使っていない。資料の質を見てから切り替える。
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { LONGREAD_FEEDS, THEMES, jpNewsSearchUrl } from './sources.js';
import { fetchArticleBody, fetchViaReader } from '../fetchArticle.js';
import { initGemini, generateJson, lastUsedModel } from '../gemini.js';
import { SCORING_MODELS } from '../editorial.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'data', 'longread');
const MAX_AGE_DAYS = 6;     // 数日遅れで読む前提なので、1週間弱を見る
const PER_FEED = 25;        // 1フィードあたりの上限（新しい順）
const SHORTLIST = 8;        // 日本語の記事数を調べる話題の数
const KEEP_TOPICS = 3;      // 本文を取って保存する話題の数（書き手が1〜2本を選ぶ）
const MAX_SOURCES = 8;      // 1話題あたり本文を取る記事の上限
const MAX_CHARS = 12000;    // 1本文あたりの上限
const MIN_EXCERPT_CHARS = 120;
const KEEP_DAYS = 30;       // 試験中は見比べるため長めに残す

const dryRun = process.argv.includes('--dry-run');
const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text' });
const text = v => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v)).replace(/\s+/g, ' ').trim();
const stripTags = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const linkOf = i => text(i.link?.['@_href'] ?? (Array.isArray(i.link) ? i.link[0]?.['@_href'] : i.link) ?? i.guid);

const now = new Date();
const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
const weekday = new Date(now.getTime() + 9 * 3600e3).getUTCDay(); // JST の曜日（0=日）
// 手動実行で別の曜日のテーマを試すときは LONGREAD_THEME_DAY=1〜5。土日は「自由」
const theme = THEMES[process.env.LONGREAD_THEME_DAY || weekday] || THEMES[5];

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ai-news-app longread)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = parser.parse(await res.text());
  const items = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? doc?.feed?.entry ?? [];
  return Array.isArray(items) ? items : [items];
}

/** 1. テーマの媒体から記事を集める */
async function collect() {
  const feeds = LONGREAD_FEEDS.filter(f => theme.id === 'any' || f.themes.includes(theme.id));
  const limit = now.getTime() - MAX_AGE_DAYS * 86400e3;
  const seen = new Set();
  const articles = [];
  const reach = await Promise.all(feeds.map(async f => {
    try {
      const items = (await fetchXml(f.url))
        .map(i => ({
          outlet: f.outlet || f.name, feed: f.name, kind: f.kind,
          title: text(i.title), url: linkOf(i),
          published: new Date(text(i.pubDate ?? i['dc:date'] ?? i.published ?? i.updated)),
          desc: stripTags(text(i.description ?? i.summary ?? i['content:encoded'])).slice(0, 600),
        }))
        .filter(i => i.title && i.url && !(i.published.getTime() < limit))
        .slice(0, PER_FEED);
      return { feed: f.name, ok: true, items };
    } catch (e) {
      return { feed: f.name, ok: false, error: String(e.cause?.code || e.message), items: [] };
    }
  }));
  for (const r of reach) for (const a of r.items) {
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    articles.push({ id: `a${articles.length + 1}`, ...a, date: isNaN(a.published) ? null : a.published.toISOString().slice(0, 10) });
  }
  for (const r of reach) console.log(`${r.ok ? 'OK' : 'NG'} ${r.feed}：${r.ok ? `${r.items.length}件` : r.error}`);
  return { articles, reach: reach.map(({ items, ...r }) => ({ ...r, count: items.length })) };
}

const GROUP_PROMPT = `あなたは国際ニュースの編集者です。海外の報道・論考の一覧を、同じ話題ごとにまとめてください。

# まとめ方
- 同じ出来事、または同じ争点（同じ選挙・同じ政策論争・同じ紛争の同じ局面）を扱う記事を1つの話題にする。
- 1件だけの話題も、話題として出す。すべての記事をどれか1つの話題に入れる。
- topic：話題の日本語の名前（15〜30字）。何についての話か分かるようにする。
- theme：politics（政治・選挙・外交）／economy（経済・財政・金融・産業政策）／society（社会・人口・教育・文化・格差・移民の暮らし）／conflict（戦争・紛争・テロ・安全保障・軍事）／other のいずれか1つ。
- jpQuery：この話題を日本語のニュース検索で探すときの語。固有名詞を中心に2〜3語、空白区切り。人名・地名は日本の報道で一般的なカタカナ・漢字表記にする（例：「マドゥロ 起訴」「ドイツ 年金改革」）。
- items：その話題に入る記事の id の配列。`;

const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          theme: { type: 'string', enum: ['politics', 'economy', 'society', 'conflict', 'other'] },
          jpQuery: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['topic', 'theme', 'jpQuery', 'items'],
      },
    },
  },
  required: ['topics'],
};

/** 2. 話題ごとにまとめる */
async function group(articles) {
  if (dryRun) {
    return articles.map(a => ({ topic: a.title, theme: theme.id === 'any' ? 'other' : theme.id, jpQuery: a.title.split(/\s+/).slice(0, 3).join(' '), items: [a.id] }));
  }
  const list = articles.map(a => JSON.stringify({ id: a.id, outlet: a.outlet, kind: a.kind, date: a.date, title: a.title, desc: a.desc.slice(0, 200) }));
  const result = await generateJson({ models: SCORING_MODELS, system: GROUP_PROMPT, prompt: `記事（${articles.length}件）:\n${list.join('\n')}`, schema: GROUP_SCHEMA });
  return result.topics || [];
}

/** 3. 日本語の記事数を数える（Google ニュース日本語版の直近7日） */
async function japaneseCoverage(query) {
  try {
    const items = await fetchXml(jpNewsSearchUrl(query));
    return { count: items.length, headlines: items.slice(0, 5).map(i => text(i.title)) };
  } catch (e) {
    return { count: null, error: String(e.cause?.code || e.message), headlines: [] };
  }
}

/** 4. 本文を取る（直接 → 読み取り代行 → フィードの要約文） */
async function readSource(a) {
  const res = await fetchArticleBody(a.url).catch(e => ({ text: null, reason: e.message }));
  let body = res.text, method = body ? 'direct' : null;
  if (!body) {
    body = await fetchViaReader(a.url);
    if (body) method = 'reader';
  }
  const excerpt = !body && a.desc.length >= MIN_EXCERPT_CHARS ? a.desc : null;
  return {
    outlet: a.outlet, kind: a.kind, date: a.date, url: a.url, headline: a.title,
    access: body ? 'body' : excerpt ? 'excerpt' : 'headline',
    text: body ? body.slice(0, MAX_CHARS) : excerpt,
    ...(body ? { method } : { reason: res.reason || 'unknown' }),
  };
}

/** 日本語の記事が少ないほど重くする。null（検索失敗）は中間扱い */
function gapWeight(jpCount) {
  if (jpCount == null) return 1;
  if (jpCount <= 5) return 1.6;
  if (jpCount <= 20) return 1.2;
  if (jpCount <= 50) return 0.9;
  return 0.6;
}

async function main() {
  if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
  if (!dryRun) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');
    initGemini(process.env.GEMINI_API_KEY);
  }
  console.log(`[longread] ${date} テーマ：${theme.label}`);

  const { articles, reach } = await collect();
  if (articles.length === 0) throw new Error('記事を1件も集められませんでした');
  const byId = new Map(articles.map(a => [a.id, a]));

  const grouped = (await group(articles))
    .map(t => ({ ...t, items: [...new Set(t.items)].map(id => byId.get(id)).filter(Boolean) }))
    .filter(t => t.items.length && (theme.id === 'any' ? t.theme !== 'other' : t.theme === theme.id));

  const ranked = grouped.map(t => {
    const outlets = new Set(t.items.map(a => a.outlet));
    const analysis = new Set(t.items.filter(a => a.kind === 'analysis').map(a => a.outlet));
    const dates = t.items.map(a => a.date).filter(Boolean).sort();
    return { ...t, outlets: [...outlets], analysisOutlets: [...analysis], firstDate: dates[0] || null, lastDate: dates.at(-1) || null, world: outlets.size + analysis.size };
  }).sort((a, b) => b.world - a.world);

  const shortlist = ranked.slice(0, SHORTLIST);
  for (const t of shortlist) t.jp = await japaneseCoverage(t.jpQuery);
  for (const t of shortlist) t.priority = Math.round(t.world * gapWeight(t.jp.count) * 10) / 10;
  shortlist.sort((a, b) => b.priority - a.priority);

  const topics = [];
  for (const t of shortlist.slice(0, KEEP_TOPICS)) {
    const items = [...t.items].sort((a, b) => (a.kind === 'analysis' ? -1 : 0) - (b.kind === 'analysis' ? -1 : 0)).slice(0, MAX_SOURCES);
    const sources = [];
    for (const a of items) sources.push(await readSource(a));
    topics.push({
      rank: topics.length + 1,
      topic: t.topic, theme: t.theme, priority: t.priority,
      world: { outlets: t.outlets, analysisOutlets: t.analysisOutlets, firstDate: t.firstDate, lastDate: t.lastDate },
      jp: { query: t.jpQuery, count: t.jp.count, headlines: t.jp.headlines, ...(t.jp.error ? { error: t.jp.error } : {}) },
      bodyCount: sources.filter(s => s.access === 'body').length,
      sources,
    });
    console.log(`[longread] ${topics.length}. ${t.topic}：海外${t.outlets.length}媒体（論考${t.analysisOutlets.length}）／日本語${t.jp.count ?? '?'}件／本文${topics.at(-1).bodyCount}`);
  }

  const output = {
    date, theme, generatedAt: now.toISOString(),
    model: dryRun ? 'dry-run' : lastUsedModel(),
    trial: true,
    feeds: reach,
    counts: { articles: articles.length, topics: grouped.length },
    // 資料にしなかった上位の話題（日本語の記事が多い・海外の媒体が少ない）。採否の妥当性を後で見るために残す
    alsoRan: shortlist.slice(KEEP_TOPICS).map(t => ({ topic: t.topic, outlets: t.outlets.length, jpCount: t.jp.count, priority: t.priority })),
    topics,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${date}.json`), JSON.stringify(output, null, 1) + '\n');
  const limitDate = new Date(Date.parse(date) - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
  for (const f of fs.readdirSync(OUT)) if (f.slice(0, 10) < limitDate) fs.rmSync(path.join(OUT, f));
  console.log(`[longread] 完了：記事${articles.length}件 → 話題${grouped.length}件 → 資料${topics.length}件`);
}

main().catch(e => {
  console.error('[longread] エラー:', e.message);
  process.exit(1);
});
