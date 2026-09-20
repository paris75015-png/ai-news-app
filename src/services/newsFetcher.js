/**
 * 3系統（国内深掘り・国際深掘り・AI日報）の当日分を読み込む。
 *
 *   public/data/domestic.json … 国内深掘り（クラウドの定期実行が書く）
 *   public/data/intl.json     … 国際深掘り（同上）
 *   public/data/ai.json       … AI日報（GitHub Actions が書く）
 *
 * どれか1つが無くても他は表示する（深掘りが動かなかった日でも AI日報は読める）。
 */

import { STREAMS, normalizeEdition } from '../article.js';

export const NewsFetcherService = {
  async fetchAll() {
    const results = await Promise.all(STREAMS.map(async s => {
      try {
        const res = await fetch(`./data/${s.file}`, { cache: 'no-store' });
        if (!res.ok) return [s.id, null];
        return [s.id, normalizeEdition(await res.json(), s.id)];
      } catch {
        return [s.id, null];
      }
    }));
    return Object.fromEntries(results);
  },
};
