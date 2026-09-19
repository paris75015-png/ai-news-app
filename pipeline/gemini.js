/**
 * Gemini API 呼び出し（JSON 出力・無料枠の回数制限に合わせた間隔調整と再試行）
 */

import { GoogleGenAI, ApiError } from '@google/genai';
import { MODEL, TEMPERATURE } from './editorial.js';

const MIN_INTERVAL_MS = 8000; // 無料枠の毎分リクエスト上限に余裕を持たせる
const MAX_RETRIES = 4;

let client = null;
let lastCallAt = 0;

export function initGemini(apiKey) {
  client = new GoogleGenAI({ apiKey });
}

/**
 * @returns {Promise<any>} スキーマに沿ってパースされた JSON
 */
export async function generateJson({ system, prompt, schema }) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();

    try {
      const res = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature: TEMPERATURE,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        },
      });
      return JSON.parse(res.text);
    } catch (e) {
      const retryable = e instanceof SyntaxError || (e instanceof ApiError && (e.status === 429 || e.status >= 500));
      if (!retryable || attempt >= MAX_RETRIES) throw e;
      const backoff = 30000 * (attempt + 1);
      console.warn(`[gemini] ${e.status || e.name}: ${backoff / 1000}秒後に再試行 (${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
