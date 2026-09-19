/**
 * FilterBar Component - 海外／国内の切り替えとキーワード検索
 * （カテゴリーのタブは常に見えるよう Header 側にある）
 */

import { escapeHtml } from '../utils.js';

const REGIONS = [
  { id: 'all', label: 'すべて' },
  { id: 'overseas', label: '海外' },
  { id: 'domestic', label: '国内' },
];

export function renderFilterBar(state) {
  const regions = REGIONS.map(r => `
    <button class="region-btn ${state.currentRegion === r.id ? 'active' : ''}" data-region="${r.id}">${r.label}</button>
  `).join('');

  return `
    <div class="filter-bar">
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
  `;
}
