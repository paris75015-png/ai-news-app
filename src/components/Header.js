/**
 * Header Component
 * 画面上部に固定表示される。カテゴリーのタブもここに置き、スクロールしても常に切り替えられるようにする。
 */

import { escapeHtml } from '../utils.js';

export function renderHeader(state) {
  const updated = state.generatedAt
    ? new Date(state.generatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return `
    <header class="app-header">
      <div class="header-content">
        <a href="#" class="logo-group" id="logo-btn">
          <div class="logo-icon-wrapper">
            <i data-lucide="newspaper"></i>
          </div>
          <div class="logo-text-group">
            <span class="logo-title">AI News</span>
            <span class="logo-subtitle">${updated ? `${updated} 更新` : '毎朝更新・テックニュースを日本語で'}</span>
          </div>
        </a>

        <div class="header-actions">
          <button id="bookmarks-toggle-btn" class="action-btn ${state.isBookmarkMode ? 'btn-amber' : 'btn-ghost'}">
            <i data-lucide="bookmark"></i>
            <span>保存（${state.bookmarks.length}）</span>
          </button>

          <button id="refresh-btn" class="action-btn btn-primary" aria-label="再読み込み">
            <i data-lucide="rotate-cw"></i>
          </button>
        </div>
      </div>
      <nav class="category-nav" aria-label="カテゴリー">${renderCategoryTabs(state)}</nav>
    </header>
  `;
}

function renderCategoryTabs(state) {
  const counts = {};
  for (const a of state.isBookmarkMode ? state.bookmarks : state.articles) {
    counts[a.category] = (counts[a.category] || 0) + 1;
  }
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  return [{ id: 'all', label: 'すべて' }, ...state.categories].map(c => `
    <button class="cat-pill ${state.currentCategory === c.id ? 'active' : ''}" data-category="${escapeHtml(c.id)}">
      ${escapeHtml(c.label)}<span class="cat-count">${c.id === 'all' ? total : counts[c.id] || 0}</span>
    </button>
  `).join('');
}
