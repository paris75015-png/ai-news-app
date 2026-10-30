/**
 * Gemini API 呼び出し（JSON 出力）
 * 無料枠は混雑すると 503 を、回数上限に達すると 429 を返す。どちらもすぐ次のモデルに切り替え、
 * 429 のモデルはその実行中は使わない（待っても回復しないため）。
 * 通信エラー（fetch failed）も混雑と同じに扱う。
 * retryWaitsMs を渡すと、全モデルが混雑したときに、その間隔で待って最初のモデルからやり直す。
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
 * @param {number[]} [retryWaitsMs] 全モデルが混雑したときに待つ時間（回数分）。省略時は待たずに失敗する
 * @returns {Promise<any>} スキーマに沿ってパースされた JSON
 */
export async function generateJson({ models, system, prompt, schema, maxOutputTokens = 32768, retryWaitsMs = [] }) {
  let lastError = new Error('使えるモデルがありません（すべて回数上限）');
  for (let round = 0; round <= retryWaitsMs.length; round++) {
    const usable = models.filter(m => !exhaustedModels.has(m));
    if (usable.length === 0) break;
    if (round > 0) {
      const ms = retryWaitsMs[round - 1];
      console.warn(`[gemini] 全モデルが混雑。${Math.round(ms / 1000)}秒待って再試行（${round}/${retryWaitsMs.length}回目）`);
      await sleep(ms);
    }

    for (const model of usable) {
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
        const busy = (e instanceof ApiError && (e.status === 429 || e.status >= 500)) || isNetworkError(e);
        if (!busy && !(e instanceof SyntaxError)) throw e;
        if (e.status === 429) exhaustedModels.add(model);
        console.warn(`[gemini] ${model}: ${e.status || e.message || e.name} → 次のモデルへ${e.status === 429 ? '（本日は使用停止）' : ''}`);
      }
    }
  }
  throw lastError;
}

/** 通信そのものの失敗（2026-10-13・10-27 は「fetch failed」で、次のモデルも試さずに止まっていた） */
function isNetworkError(e) {
  return e instanceof TypeError && /fetch failed|network|socket|terminated/i.test(e.message);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
