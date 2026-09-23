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

export const NewsFetcherService = {
  /** 当日分。画面を開いたときに読むもの */
  async fetchLatest() {
    const results = await Promise.all(STREAMS.map(async s => {
      const data = await loadJson(`./data/${s.file}`);
      return [s.id, data ? normalizeEdition(data, s.id) : null];
    }));
    return Object.fromEntries(results);
  },

  /** 指定した日のアーカイブ */
  async fetchArchive(date) {
    const results = await Promise.all(STREAMS.map(async s => {
      const data = await loadJson(`./data/archive/${date}-${s.id}.json`);
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
