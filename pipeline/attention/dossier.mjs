/**
 * 深掘りの資料づくり：数日続いている話題を選び、複数媒体の本文を集めて1話題1ファイルに保存する。
 *   node pipeline/attention/dossier.mjs
 *
 * 選ぶ条件（初日は速報で各社が横並びになるため、2日目・3日目を狙う）
 *   - 記録された日数が 2 または 3 日（それ以降は見送る。長く続く話題は日曜版の領分）
 *   - 今日の海外の取り上げ媒体が 3 以上
 *   - 今日の点数が、初日から続けて「順位上位 12 以内」または「最高点の 40% 以上」を保っている
 *   - 資料をまだ作っていない
 *   上限は 1 日 5 話題（Sonnet の定期実行のリミットを守るため）
 *
 * 出力  data/dossiers/YYYY-MM-DD-{id}.json
 *       本文を読めた媒体は access:"body"、フィードの要約文だけ読めた媒体は "excerpt"、
 *       見出しだけの媒体（Reuters 等の Google ニュース経由）は "headline"
 *
 * 本文の取り方（上から順に試し、取れた時点で止める）
 *   1. 直接取得（fetchArticleBody）
 *   2. 直接が 403 などで失敗したとき、読み取り代行（r.jina.ai）を一度だけ試す。READER_FALLBACK=0 で無効にできる
 *   3. それも失敗したとき、フィードの要約文が 120 字以上あれば "excerpt" として載せる
 *   どの手段で取れたかは sources[].method に残す（実測して効果を確かめるため）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchArticleBody } from '../fetchArticle.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const STORIES_FILE = path.join(ROOT, 'data', 'attention', 'stories.json');
const LATEST = path.join(ROOT, 'public', 'data', 'attention', 'latest.json');
const OUT = path.join(ROOT, 'data', 'dossiers');
const MAX_PER_DAY = 5;
const MAX_BODIES = 14;         // 1話題あたり本文を取る最大の媒体数（直接フィードの媒体は全部取る）
const MAX_CHARS = 9000;        // 1本文あたりの上限
const READER_FALLBACK = process.env.READER_FALLBACK !== '0';
const MIN_EXCERPT_CHARS = 120;
const READER_MIN_CHARS = 400;  // これより短い代行結果は、ログイン画面や失敗ページとみなす
const KEEP_DAYS = 14;

/** 直接取れない媒体の本文を、読み取り代行経由で一度だけ試す。失敗しても null を返すだけ */
async function fetchViaReader(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const t = (await res.text()).replace(/\n{3,}/g, '\n\n').trim();
    return t.length >= READER_MIN_CHARS ? t : null;
  } catch {
    return null;
  }
}

/** 本文の末尾に通信社の署名があれば、その名前を返す（独立した媒体の数え間違いを防ぐ） */
function wireOf(text) {
  const tail = text.slice(-400);
  if (/\bREUTERS\b|\(Reuters\)/i.test(tail)) return 'Reuters';
  if (/\(AP\)|\bAssociated Press\b/.test(tail)) return 'AP';
  if (/\bAFP\b|Agence France-Presse/i.test(tail)) return 'AFP';
  return null;
}

const registry = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
const latest = JSON.parse(fs.readFileSync(LATEST, 'utf8'));
const date = latest.date;

const rankOf = Object.fromEntries(latest.ranking.map((r, i) => [r.id, i + 1]));

const picked = latest.ranking
  .filter(r => {
    const s = registry.stories[r.id];
    if (!s || s.dossier) return false;
    const days = Object.keys(s.days).length;   // 台帳の記録日数（画面用の順位表ではなく台帳を正とする）
    const peak = Math.max(...Object.values(s.days).map(d => d.worldScore));
    if (days < 2 || days > 3) return false;
    if (Number(r.worldCoverage.split('/')[0]) < 3) return false;
    return rankOf[r.id] <= 12 || r.worldScore >= 0.4 * peak;
  })
  .slice(0, MAX_PER_DAY);

console.log(`資料の対象 ${picked.length}件：${picked.map(p => p.title).join(' / ') || 'なし'}`);
fs.mkdirSync(OUT, { recursive: true });

for (const r of picked) {
  const s = registry.stories[r.id];
  // 記録された全日の見出しから、直接読める媒体を新しい日から優先して選ぶ
  const seenOutlet = new Set();
  const cands = [];
  for (const d of Object.keys(s.days).sort().reverse()) {
    for (const o of s.days[d].outlets) {
      if (o.region !== 'world' || o.via || seenOutlet.has(o.id)) continue;
      seenOutlet.add(o.id);
      cands.push({ ...o, date: d });
    }
  }
  const sources = [];
  for (const o of cands.slice(0, MAX_BODIES)) {
    const res = await fetchArticleBody(o.url).catch(e => ({ text: null, reason: String(e.message) }));
    let text = res.text, method = text ? 'direct' : null;
    if (!text && READER_FALLBACK) {
      text = await fetchViaReader(o.url);
      if (text) method = 'reader';
    }
    const excerpt = !text && (o.desc || '').length >= MIN_EXCERPT_CHARS ? o.desc : null;
    sources.push({
      outlet: o.name, date: o.date, url: o.url, headline: o.title,
      access: text ? 'body' : excerpt ? 'excerpt' : 'headline',
      text: text ? text.slice(0, MAX_CHARS) : excerpt,
      ...(text ? { method, wire: wireOf(text) } : { reason: res.reason || 'unknown' }),
    });
  }
  // 本文を取らなかった媒体（取れなかった・直接取れない通信社など）は見出しだけ載せる
  const headlineOnly = [];
  const taken = new Set(sources.map(x => x.outlet));
  for (const d of Object.keys(s.days).sort().reverse()) {
    for (const o of s.days[d].outlets) {
      if (o.region !== 'world' || taken.has(o.name)) continue;
      taken.add(o.name);
      headlineOnly.push({ outlet: o.name, date: d, url: o.url, headline: o.title, access: 'headline' });
    }
  }

  const dossier = {
    id: r.id,
    title: s.title,
    date,
    firstSeen: s.firstSeen,
    daysSeen: Object.keys(s.days).length,
    history: Object.fromEntries(Object.entries(s.days).map(([d, v]) => [d, v.worldScore])),                       // 日付 → 海外の注目度
    coverage: { world: r.worldCoverage, jp: r.jpCoverage },
    japan: !!s.japan,
    sources: [...sources, ...headlineOnly],
    bodyCount: sources.filter(x => x.access === 'body').length,
    excerptCount: sources.filter(x => x.access === 'excerpt').length,
  };
  fs.writeFileSync(path.join(OUT, `${date}-${r.id}.json`), JSON.stringify(dossier, null, 1));
  s.dossier = date;
  console.log(`  ${r.title}：本文 ${dossier.bodyCount}（代行 ${sources.filter(x => x.method === 'reader').length}） / 要約 ${dossier.excerptCount} / 見出しのみ ${dossier.sources.length - dossier.bodyCount - dossier.excerptCount}`);
}

fs.writeFileSync(STORIES_FILE, JSON.stringify(registry, null, 1));

// 古い資料を消す
const limit = new Date(Date.parse(date) - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
for (const f of fs.readdirSync(OUT)) if (f.slice(0, 10) < limit) fs.rmSync(path.join(OUT, f));
