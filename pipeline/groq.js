/**
 * Groq の無料枠で OpenAI の公開モデル（GPT-OSS）を使う。GROQ_API_KEY が無ければ何もしない。
 *
 * 無料枠は「毎分8,000トークン」程度と小さいので、1記事ずつ・本文を短めにして呼ぶ。
 * 上限（429）に当たったら、指示された秒数だけ待って1回だけやり直す。
 */

import { FALLBACK_MODEL, TEMPERATURE } from './editorial.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MIN_INTERVAL_MS = 30000;
export const GROQ_BODY_CHARS = 6000;

let apiKey = null;
let lastCallAt = 0;
let disabled = false;
export let groqUsed = false;

export function initGroq(key) {
  apiKey = key || null;
}

export function groqAvailable() {
  return Boolean(apiKey) && !disabled;
}

/**
 * @returns {Promise<any|null>} パースされた JSON。使えない・失敗した場合は null
 */
export async function groqJson({ system, prompt, schema }) {
  if (!groqAvailable()) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callOnce({ system, prompt, schema });
    if (result !== RETRY) return result;
  }
  return null;
}

const RETRY = Symbol('retry');

async function callOnce({ system, prompt, schema }) {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt = Date.now();

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${system}\n\n# 出力形式\n次の JSON Schema に従う JSON だけを出力する。\n${JSON.stringify(schema)}` },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.status === 429) {
      const retryAfter = Math.min(90, Number(res.headers.get('retry-after')) || 60);
      console.warn(`[groq] 上限に到達 → ${retryAfter}秒待って再試行`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return RETRY;
    }
    if (!res.ok) {
      console.warn(`[groq] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (res.status === 401 || res.status === 403) disabled = true; // キーが無効なら以後は呼ばない
      return null;
    }
    const data = await res.json();
    groqUsed = true;
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    console.warn(`[groq] 失敗: ${e.message}`);
    return null;
  }
}
