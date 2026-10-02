/**
 * 注目度の試作・第1段：各媒体の見出しフィードを取得し、到達できたかを調べる。
 * 出力：data/attention/YYYY-MM-DD-headlines.json
 *   node pipeline/attention/fetch.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { FEEDS } from './feeds.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'data', 'attention');
const MAX_AGE_H = 40; // これより古い見出しは数えない
const TOP_N = 25; // 1媒体あたり上位何件まで見るか
const parser = new XMLParser({ ignoreAttributes: false, textNodeName: '#text' });

const text = v => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? '') : String(v)).replace(/\s+/g, ' ').trim();

const stripTags = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function parseItems(xml) {
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? doc?.feed?.entry ?? [];
  return (Array.isArray(items) ? items : [items]).map(i => ({
    title: text(i.title),
    url: text(i.link?.['@_href'] ?? i.link ?? i.guid),
    published: text(i.pubDate ?? i['dc:date'] ?? i.published ?? i.updated),
    desc: stripTags(text(i.description ?? i.summary ?? i['content:encoded'])).slice(0, 300),
  })).filter(i => i.title);
}

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ai-news-app attention prototype)' },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const items = parseItems(await res.text());
    if (items.length === 0) return { ok: false, error: '見出しを取り出せない' };
    // 古い見出しだけのフィードを外す（更新が止まったフィードの混入を避ける）
    const fresh = items.filter(i => {
      const t = Date.parse(i.published);
      return Number.isNaN(t) || Date.now() - t < MAX_AGE_H * 3600e3;
    });
    if (fresh.length < 3) return { ok: false, error: `更新が止まっている（新しい見出し ${fresh.length}件）` };
    return { ok: true, items: fresh.slice(0, TOP_N) };
  } catch (e) {
    return { ok: false, error: String(e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

const jstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const results = await Promise.all(FEEDS.map(async f => ({ ...f, ...(await fetchFeed(f)) })));
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `${jstDate()}-headlines.json`);
fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), feeds: results }, null, 1));

for (const r of results) {
  console.log(`${r.ok ? 'OK ' : 'NG '} ${r.region.padEnd(5)} ${r.name.padEnd(26)} ${r.ok ? r.items.length + '件  ' + r.items[0].title.slice(0, 40) : r.error}`);
}
console.log(`\n到達 ${results.filter(r => r.ok).length}/${results.length} → ${path.relative(ROOT, file)}`);
