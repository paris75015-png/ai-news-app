/**
 * 各ソースから記事候補を集める
 * 候補: { id, url, title, snippet, outlet, sourceId, region, pubDate, bodyHtml? }
 */

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { COLLECT } from './editorial.js';

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const HN_TOP_COUNT = 40;
const UA = 'Mozilla/5.0 (compatible; ai-news-app/1.0)';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

export async function collectCandidates(sources) {
  const cutoff = Date.now() - COLLECT.maxAgeHours * 3600 * 1000;

  const results = await Promise.allSettled(
    sources.map(s => (s.type === 'hackernews' ? fetchHackerNews(s) : fetchRss(s)))
  );

  const candidates = [];
  results.forEach((r, i) => {
    const source = sources[i];
    if (r.status === 'rejected') {
      console.warn(`[collect] ${source.name}: 取得失敗 (${r.reason?.message || r.reason})`);
      return;
    }
    const fresh = r.value
      .filter(c => c.url && c.title && new Date(c.pubDate).getTime() >= cutoff)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, COLLECT.maxPerSource);
    console.log(`[collect] ${source.name}: ${fresh.length}件`);
    candidates.push(...fresh);
  });

  // 同じURLは1件にまとめる
  const seen = new Set();
  return candidates.filter(c => (seen.has(c.url) ? false : seen.add(c.url)));
}

/** URL から安定したIDを作る（日をまたいでも同じ記事は同じID） */
export function articleId(url) {
  return createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 12);
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|fbclid|gclid)/.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchRss(source) {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = parser.parse(await res.text());

  const items =
    doc.rss?.channel?.item ??      // RSS 2.0
    doc['rdf:RDF']?.item ??        // RSS 1.0 (RDF)
    doc.feed?.entry ??             // Atom
    [];

  return toArray(items).map(item => {
    const url = normalizeUrl(atomLink(item.link) || text(item.link) || text(item.guid));
    return {
      id: articleId(url),
      url,
      title: clean(text(item.title)),
      snippet: clean(stripHtml(text(item.description) || text(item.summary) || text(item.content))).slice(0, 300),
      outlet: source.name,
      sourceId: source.id,
      region: source.region,
      pubDate: toIso(text(item.pubDate) || text(item['dc:date']) || text(item.published) || text(item.updated)),
    };
  });
}

async function fetchHackerNews(source) {
  const res = await fetch(`${HN_API}/topstories.json`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ids = (await res.json()).slice(0, HN_TOP_COUNT);

  const items = await Promise.all(
    ids.map(id =>
      fetch(`${HN_API}/item/${id}.json`, { signal: AbortSignal.timeout(20000) })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  return items
    .filter(s => s && s.type === 'story' && !s.dead && !s.deleted && s.title)
    .map(s => {
      const discussionUrl = `https://news.ycombinator.com/item?id=${s.id}`;
      const url = normalizeUrl(s.url || discussionUrl);
      return {
        id: articleId(url),
        url,
        title: s.title,
        snippet: `Hacker News で ${s.score || 0} ポイント・${s.descendants || 0} コメント`,
        outlet: s.url ? hostnameOf(s.url) : 'Hacker News',
        sourceId: source.id,
        region: source.region,
        pubDate: new Date(s.time * 1000).toISOString(),
        bodyHtml: s.url ? null : s.text || null,
        discussionUrl,
      };
    });
}

function toArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  return v['#text'] != null ? String(v['#text']) : '';
}

function atomLink(link) {
  const links = toArray(link).filter(l => typeof l === 'object' && l['@_href']);
  const alt = links.find(l => !l['@_rel'] || l['@_rel'] === 'alternate');
  return (alt || links[0])?.['@_href'] || '';
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, ' ');
}

function clean(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Hacker News';
  }
}
