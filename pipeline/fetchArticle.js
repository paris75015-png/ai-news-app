/**
 * 記事本文の取得と抽出（ブラウザからは CORS で取得できないため、毎朝の処理の中で行う）
 */

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_BODY_CHARS = 40000;
// これより短い抽出結果はペイウォールやログイン画面とみなす
const MIN_BODY_CHARS = 400;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

/**
 * @returns {Promise<{ text: string|null, truncated: boolean, reason?: string }>}
 */
export async function fetchArticleBody(url) {
  if (!isFetchableUrl(url)) return { text: null, truncated: false, reason: 'invalid-url' };

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { text: null, truncated: false, reason: `http-${res.status}` };

    const type = res.headers.get('content-type') || '';
    if (!type.includes('html')) return { text: null, truncated: false, reason: 'not-html' };

    const bytes = await readLimited(res, MAX_HTML_BYTES);
    return extractText(decodeHtml(bytes, type));
  } catch (e) {
    return { text: null, truncated: false, reason: e.name === 'TimeoutError' ? 'timeout' : 'fetch-error' };
  }
}

/** HN の Ask/Show HN 投稿など、HTML 断片の本文をテキスト化する */
export function htmlFragmentToText(fragment) {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${fragment}</body></html>`);
  return normalize(document.body.textContent || '');
}

function extractText(html) {
  const { document } = parseHTML(html);
  const parsed = new Readability(document).parse();
  const text = normalize(parsed?.textContent || '');

  if (text.length < MIN_BODY_CHARS) return { text: null, truncated: false, reason: 'too-short' };
  if (text.length > MAX_BODY_CHARS) return { text: text.slice(0, MAX_BODY_CHARS), truncated: true };
  return { text, truncated: false };
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
