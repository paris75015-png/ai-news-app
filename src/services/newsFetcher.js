/**
 * 3系統（国内深掘り・国際深掘り・AI日報）を読み込む。
 *
 *   public/data/{domestic,intl,ai}.json          当日分
 *   public/data/archive/{日付}-{系統}.json        過去分
 *   public/data/archive/index.json               どの日付が読めるかの目次（ビルド時に自動生成）
 *
 * どれか1つが無くても他は表示する（ある系統が動かなかった日でも他は読める）。
 */

import { STREAMS, normalizeEdition } from '../article.js';

async function loadJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 国際深掘りの紙面 ＝ 深掘りのコラム（Claude・平日 07:30）＋ 世界の報道から拾った短信（Actions・平日 06:20）。
 * 深掘りは資料のある日だけ出るため、その日の深掘りが無ければ、古い深掘りを今日のものとして出さず短信だけにする。
 */
function mergeIntl(deep, briefs) {
  if (!briefs) return deep;
  const sameDay = deep && deep.date === briefs.date;
  return {
    date: briefs.date,
    stream: 'intl',
    title: '国際深掘り',
    generatedAt: briefs.generatedAt,
    model: sameDay ? deep.model : briefs.model,
    editorialVersion: 2,
    articles: [...(sameDay ? deep.articles || [] : []), ...briefs.articles],
    essays: [],
    productionNote: sameDay ? deep.productionNote : null,
  };
}

export const NewsFetcherService = {
  /** 当日分。画面を開いたときに読むもの */
  async fetchLatest() {
    const results = await Promise.all(STREAMS.filter(s => !s.archiveOnly).map(async s => {
      let data = await loadJson(`./data/${s.file}`);
      if (s.id === 'intl') data = mergeIntl(data, await loadJson('./data/attention/briefs-latest.json'));
      return [s.id, data ? normalizeEdition(data, s.id) : null];
    }));
    return Object.fromEntries(results);
  },

  /** 指定した日のアーカイブ */
  async fetchArchive(date) {
    const results = await Promise.all(STREAMS.map(async s => {
      let data = await loadJson(`./data/archive/${date}-${s.id}.json`);
      if (s.id === 'intl') data = mergeIntl(data, await loadJson(`./data/attention/${date}-briefs.json`));
      return [s.id, data ? normalizeEdition(data, s.id) : null];
    }));
    return Object.fromEntries(results);
  },

  /** 読める日付の一覧（新しい順）。目次が無ければ空で返す */
  async fetchArchiveIndex() {
    const data = await loadJson('./data/archive/index.json');
    return data?.dates ?? [];
  },
};
