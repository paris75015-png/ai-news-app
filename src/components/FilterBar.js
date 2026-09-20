/**
 * FilterBar Component - キーワード検索
 * （系統・セクション・深掘り／短信のタブは常に見えるよう Header 側にある）
 */

import { escapeHtml } from '../utils.js';

export function renderFilterBar(state) {
  return `
    <div class="filter-bar">
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
