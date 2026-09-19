/**
 * News Fetcher Service
 * 毎朝の処理で生成された public/data/news.json を読み込む。
 */

import { normalizeArticle } from '../article.js';

export const NewsFetcherService = {
  async fetchNews() {
    const res = await fetch('./data/news.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`news.json: ${res.status}`);
    const data = await res.json();
    return {
      generatedAt: data.generatedAt,
      categories: data.categories || [],
      articles: data.articles.map(normalizeArticle),
    };
  },
};
