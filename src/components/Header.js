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

/**
 * カテゴリーのタブ。親カテゴリー（経済など）だけをタブにし、選択中の親に小分類（金融など）があれば下に並べる。
 * state.currentCategory の値：'all' / 親の id（小分類も含めて表示）/ '<id>:self'（親だけ）/ 小分類の id
 */
function renderCategoryTabs(state) {
  const list = state.isBookmarkMode ? state.bookmarks : state.articles;
  const countOf = ids => list.filter(a => ids.includes(a.category)).length;
  const tops = state.categories.filter(c => !c.parent);
  const childrenOf = id => state.categories.filter(c => c.parent === id);
  const activeTop = tops.find(t => t.id === state.currentCategory.replace(/:self$/, '') ||
    childrenOf(t.id).some(c => c.id === state.currentCategory));

  const tabs = [{ id: 'all', label: 'すべて' }, ...tops].map(c => {
    const ids = c.id === 'all' ? null : [c.id, ...childrenOf(c.id).map(x => x.id)];
    const active = c.id === 'all' ? state.currentCategory === 'all' : activeTop?.id === c.id;
    return `
      <button class="cat-pill ${active ? 'active' : ''}" data-category="${escapeHtml(c.id)}">
        ${escapeHtml(c.label)}<span class="cat-count">${ids ? countOf(ids) : list.length}</span>
      </button>`;
  }).join('');

  const children = activeTop ? childrenOf(activeTop.id) : [];
  const subs = children.length === 0 ? '' : `
    <div class="subcat-nav">
      ${[
        { id: activeTop.id, label: 'すべて', ids: [activeTop.id, ...children.map(c => c.id)] },
        { id: `${activeTop.id}:self`, label: `${activeTop.label}全般`, ids: [activeTop.id] },
        ...children.map(c => ({ id: c.id, label: c.label, ids: [c.id] })),
      ].map(c => `
        <button class="subcat-pill ${state.currentCategory === c.id ? 'active' : ''}" data-category="${escapeHtml(c.id)}">
          ${escapeHtml(c.label)}<span class="cat-count">${countOf(c.ids)}</span>
        </button>`).join('')}
    </div>`;

  return `<div class="category-tabs">${tabs}</div>${subs}`;
}
