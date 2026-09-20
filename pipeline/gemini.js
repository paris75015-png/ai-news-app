/**
 * Gemini API 呼び出し（JSON 出力）
 * 無料枠は混雑すると 503 を、回数上限に達すると 429 を返す。どちらもすぐ次のモデルに切り替え、
 * 429 のモデルはその実行中は使わない（待っても回復しないため）。
 */

import { GoogleGenAI, ApiError } from '@google/genai';
import { TEMPERATURE } from './editorial.js';

const MIN_INTERVAL_MS = 8000; // 無料枠の毎分リクエスト上限に余裕を持たせる

let client = null;
let lastCallAt = 0;
export const usedModels = new Set();
let lastModel = null;
/** 直前の呼び出しで実際に使われたモデル名 */
export function lastUsedModel() {
  return lastModel;
}
const exhaustedModels = new Set();

export function initGemini(apiKey) {
  client = new GoogleGenAI({ apiKey });
}

/**
 * @param {string[]} models 試す順のモデル一覧
 * @returns {Promise<any>} スキーマに沿ってパースされた JSON
 */
export async function generateJson({ models, system, prompt, schema, maxOutputTokens = 32768 }) {
  let lastError = new Error('使えるモデルがありません（すべて回数上限）');
  for (const model of models.filter(m => !exhaustedModels.has(m))) {
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
          maxOutputTokens, // 既定値のままだと全候補の採点が途中で切れることがある
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        },
      });
      const json = JSON.parse(res.text);
      usedModels.add(model);
      lastModel = model;
      return json;
    } catch (e) {
      lastError = e;
      const busy = e instanceof ApiError && (e.status === 429 || e.status >= 500);
      if (!busy && !(e instanceof SyntaxError)) throw e;
      if (e.status === 429) exhaustedModels.add(model);
      console.warn(`[gemini] ${model}: ${e.status || e.name} → 次のモデルへ${e.status === 429 ? '（本日は使用停止）' : ''}`);
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
