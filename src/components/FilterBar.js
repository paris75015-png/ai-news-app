/**
 * FilterBar Component - カテゴリーのタブ・海外／国内・キーワード検索
 */

import { escapeHtml } from '../utils.js';

const REGIONS = [
  { id: 'all', label: 'すべて' },
  { id: 'overseas', label: '海外' },
  { id: 'domestic', label: '国内' },
];

export function renderFilterBar(state) {
  const tabs = [{ id: 'all', label: 'すべて' }, ...state.categories].map(c => `
    <button class="cat-pill ${state.currentCategory === c.id ? 'active' : ''}" data-category="${escapeHtml(c.id)}">
      ${escapeHtml(c.label)}
    </button>
  `).join('');

  const regions = REGIONS.map(r => `
    <button class="region-btn ${state.currentRegion === r.id ? 'active' : ''}" data-region="${r.id}">${r.label}</button>
  `).join('');

  return `
    <div class="filter-bar">
      <div class="category-nav">${tabs}</div>
      <div class="filter-row">
        <div class="region-toggle">${regions}</div>
        <div class="search-wrapper">
          <i data-lucide="search" class="search-icon" style="width:16px;height:16px;"></i>
          <input
            type="text"
            id="search-input"
            class="search-input"
            placeholder="キーワードで検索..."
            value="${escapeHtml(state.searchQuery)}"
          />
        </div>
      </div>
    </div>
  `;
}
