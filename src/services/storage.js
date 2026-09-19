/**
 * Storage Service - ブックマークを localStorage に保存する
 */

import { normalizeArticle } from '../article.js';

const BOOKMARKS_KEY = 'ai_news_app_bookmarks';

export const StorageService = {
  getBookmarks() {
    try {
      const data = localStorage.getItem(BOOKMARKS_KEY);
      return data ? JSON.parse(data).filter(isRealArticle).map(normalizeArticle) : [];
    } catch {
      return [];
    }
  },

  isBookmarked(id) {
    return this.getBookmarks().some(item => item.id === id);
  },

  toggleBookmark(article) {
    const bookmarks = this.getBookmarks();
    const index = bookmarks.findIndex(item => item.id === article.id);
    let added = false;

    if (index >= 0) {
      bookmarks.splice(index, 1);
    } else {
      bookmarks.unshift(article);
      added = true;
    }

    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (e) {
      console.error('Failed to save bookmark', e);
    }
    return added;
  }
};

// 旧バージョンの固定サンプル記事（id が "news-" で始まる）は実在しない内容なので読み込まない
function isRealArticle(item) {
  return item && item.id && !String(item.id).startsWith('news-');
}
