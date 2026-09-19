/**
 * Gemini API 呼び出し（JSON 出力）
 * 無料枠は混雑すると 503/429 を返すので、少し待って再試行し、それでもだめなら次のモデルに切り替える。
 */

import { GoogleGenAI, ApiError } from '@google/genai';
import { MODELS, TEMPERATURE } from './editorial.js';

const MIN_INTERVAL_MS = 8000; // 無料枠の毎分リクエスト上限に余裕を持たせる
const RETRIES_PER_MODEL = 1;
const RETRY_WAIT_MS = 15000;

let client = null;
let lastCallAt = 0;
export const usedModels = new Set();

export function initGemini(apiKey) {
  client = new GoogleGenAI({ apiKey });
}

/**
 * @returns {Promise<any>} スキーマに沿ってパースされた JSON
 */
export async function generateJson({ system, prompt, schema }) {
  let lastError;
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
      const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();

      try {
        const res = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: system,
            temperature: TEMPERATURE,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
          },
        });
        const json = JSON.parse(res.text);
        usedModels.add(model);
        return json;
      } catch (e) {
        lastError = e;
        const busy = e instanceof ApiError && (e.status === 429 || e.status >= 500);
        if (!busy && !(e instanceof SyntaxError)) throw e;
        const willRetry = attempt < RETRIES_PER_MODEL;
        console.warn(`[gemini] ${model}: ${e.status || e.name}${willRetry ? ` → ${RETRY_WAIT_MS / 1000}秒後に再試行` : ' → 次のモデルへ'}`);
        if (willRetry) await sleep(RETRY_WAIT_MS);
      }
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
