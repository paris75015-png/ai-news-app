/**
 * Gemini API 呼び出し（JSON 出力）
 * 無料枠は混雑すると 503 を、回数上限に達すると 429 を返す。どちらもすぐ次のモデルに切り替え、
 * 429 のモデルはその実行中は使わない（待っても回復しないため）。
 * 通信エラー（fetch failed）も混雑と同じに扱う。
 * retryWaitsMs を渡すと、全モデルが混雑したときに、その間隔で待って最初のモデルからやり直す。
 *
 * 比較試験（2026-11、Haiku 版）：環境変数 LLM_PROVIDER=claude のときは、Gemini を呼ばずに
 * Claude Code の CLI（claude -p）で CLAUDE_MODEL（既定 claude-haiku-5-5）を呼ぶ。models は無視する。
 * 指示文・材料は Gemini 版と同じものを渡す。JSON の形は強制できないので、指示文の末尾でスキーマを示す。
 */

import { spawn } from 'node:child_process';
import { GoogleGenAI, ApiError } from '@google/genai';
import { TEMPERATURE } from './editorial.js';

const USE_CLAUDE = process.env.LLM_PROVIDER === 'claude';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
/** Claude で使ったトークンの合計（比較の記録用） */
export const claudeUsage = { calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, ms: 0 };
if (USE_CLAUDE) {
  // 比較の記録：実行の最後に、呼び出し回数・失敗・トークン数を1行で残す（API で払った場合の費用の見積もりに使う）
  process.on('exit', () => console.log(`[claude] 合計 ${JSON.stringify({ model: CLAUDE_MODEL, ...claudeUsage })}`));
}

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
  if (USE_CLAUDE) return claudeJson({ system, prompt, schema, retryWaitsMs });
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

/**
 * Claude Code の CLI で1回呼ぶ。道具はすべて外し、Claude Code 既定の指示文は system で置き換える。
 * 失敗したら（認証・混雑・JSON が読めない）retryWaitsMs の間隔で、少なくとも1回はやり直す。
 */
async function claudeJson({ system, prompt, schema, retryWaitsMs }) {
  const waits = retryWaitsMs.length ? retryWaitsMs : [30000];
  const fullPrompt = `${prompt}\n\n# 出力形式\n次の JSON Schema に従う JSON だけを返す。前置き・説明・コードブロックの記号は付けない。\n${JSON.stringify(schema)}`;
  let lastError;
  for (let round = 0; round <= waits.length; round++) {
    if (round > 0) {
      console.warn(`[claude] 失敗。${Math.round(waits[round - 1] / 1000)}秒待って再試行（${round}/${waits.length}回目）`);
      await sleep(waits[round - 1]);
    }
    const started = Date.now();
    claudeUsage.calls++;
    try {
      const out = await runClaude(['-p', '--model', CLAUDE_MODEL, '--system-prompt', system, '--tools', '',
        '--output-format', 'json', '--no-session-persistence'], fullPrompt);
      const res = JSON.parse(out);
      claudeUsage.ms += Date.now() - started;
      claudeUsage.inputTokens += (res.usage?.input_tokens || 0) + (res.usage?.cache_creation_input_tokens || 0);
      claudeUsage.cacheReadTokens += res.usage?.cache_read_input_tokens || 0;
      claudeUsage.outputTokens += res.usage?.output_tokens || 0;
      if (res.is_error) {
        const err = new Error(`claude: ${String(res.result).slice(0, 200)}`);
        if (/authenticat|401|403/i.test(String(res.result))) err.fatal = true; // 認証の失敗は待っても直らない
        throw err;
      }
      const json = extractJson(res.result);
      usedModels.add(CLAUDE_MODEL);
      lastModel = CLAUDE_MODEL;
      return json;
    } catch (e) {
      claudeUsage.failures++;
      lastError = e;
      console.warn(`[claude] ${CLAUDE_MODEL}: ${e.message.slice(0, 200)}`);
      if (e.fatal) break;
    }
  }
  throw lastError;
}

/** 応答の文字列から JSON 本体を取り出す（コードブロックや前置きが付いても読めるように） */
function extractJson(text) {
  const t = String(text).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch { /* 前後に文が付いている場合は、最初の { から最後の } までを読む */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new SyntaxError('応答に JSON が見つかりません');
  return JSON.parse(t.slice(start, end + 1));
}

function runClaude(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN || 'claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60 * 1000); // 1回の呼び出しは10分で打ち切る
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      // 認証エラーなども is_error 付きの JSON で返るので、終了コードより先に中身を見る
      if (stdout.trim().startsWith('{')) resolve(stdout);
      else reject(new Error(`claude が終了コード ${code} で終わった: ${(stderr || stdout).slice(0, 200)}`));
    });
    child.stdin.end(input);
  });
}

/** 通信そのものの失敗（2026-10-13・10-27 は「fetch failed」で、次のモデルも試さずに止まっていた） */
function isNetworkError(e) {
  return e instanceof TypeError && /fetch failed|network|socket|terminated/i.test(e.message);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
