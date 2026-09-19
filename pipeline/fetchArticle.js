/**
 * 記事本文の取得と抽出（ブラウザからは CORS で取得できないため、毎朝の処理の中で行う）
 */

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_BODY_CHARS = 40000;
const MAX_PAGES = 5; // 複数ページに分かれた記事（ITmedia、ダイヤモンド等）は続きのページも読む
// これより短い抽出結果はペイウォールやログイン画面とみなす
const MIN_BODY_CHARS = 400;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

/**
 * @returns {Promise<{ text: string|null, truncated: boolean, reason?: string, pages?: number }>}
 */
export async function fetchArticleBody(url) {
  if (!isFetchableUrl(url)) return { text: null, truncated: false, reason: 'invalid-url' };

  const first = await fetchPage(url);
  if (first.error) return { text: null, truncated: false, reason: first.error };

  const texts = [first.text];
  const visited = new Set([first.url]);
  let next = first.next;
  while (next && texts.length < MAX_PAGES && !visited.has(next)) {
    visited.add(next);
    const page = await fetchPage(next);
    if (page.error || !page.text) break;
    texts.push(page.text);
    next = page.next;
  }

  const text = texts.join('\n\n');
  if (text.length < MIN_BODY_CHARS) return { text: null, truncated: false, reason: 'too-short' };
  if (text.length > MAX_BODY_CHARS) return { text: text.slice(0, MAX_BODY_CHARS), truncated: true, pages: texts.length };
  return { text, truncated: false, pages: texts.length };
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { error: `http-${res.status}` };

    const type = res.headers.get('content-type') || '';
    if (!type.includes('html')) return { error: 'not-html' };

    const bytes = await readLimited(res, MAX_HTML_BYTES);
    const { document } = parseHTML(decodeHtml(bytes, type));
    const next = findNextPage(document, res.url || url);
    const parsed = new Readability(document).parse();
    return { url: res.url || url, text: normalize(parsed?.textContent || ''), next };
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? 'timeout' : 'fetch-error' };
  }
}

/** 「次のページ」へのリンクを探す（同じサイト内のものだけ） */
function findNextPage(document, pageUrl) {
  const base = new URL(pageUrl);
  const candidates = [
    document.querySelector('link[rel="next"]')?.getAttribute('href'),
    document.querySelector('a[rel="next"]')?.getAttribute('href'),
    [...document.querySelectorAll('a')].find(a => /次のページ|次ページ/.test(a.textContent || ''))?.getAttribute('href'),
  ];
  // ダイヤモンド・オンラインのように ?page=2 形式のもの
  const current = Number(base.searchParams.get('page') || 1);
  const pageLink = [...document.querySelectorAll('a[href]')]
    .map(a => a.getAttribute('href'))
    .find(h => new RegExp(`[?&]page=${current + 1}(&|$)`).test(h));
  candidates.push(pageLink);

  for (const href of candidates) {
    if (!href) continue;
    try {
      const u = new URL(href, base);
      if (u.host === base.host && u.pathname === base.pathname ? u.search !== base.search : u.host === base.host) {
        return u.toString();
      }
    } catch {}
  }
  return null;
}

/** HN の Ask/Show HN 投稿など、HTML 断片の本文をテキスト化する */
export function htmlFragmentToText(fragment) {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${fragment}</body></html>`);
  return normalize(document.body.textContent || '');
}

function normalize(text) {
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readLimited(res, limit) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

// 文字コードは HTTP ヘッダー → <meta> の順に判定する（国内サイトには Shift_JIS / EUC-JP が残っている）
function decodeHtml(bytes, contentType) {
  const head = bytes.subarray(0, 4096).toString('latin1');
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ||
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
    'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ローカルネットワークへのリクエストを防ぐ（RSS に不正な URL が含まれていた場合の保険）
function isFetchableUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host.startsWith('[')) return false; // IPv6 リテラルは許可しない
  return true;
}
