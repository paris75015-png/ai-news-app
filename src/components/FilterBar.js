/**
 * FilterBar Component — 日付の移動・制作記録・キーワード検索
 * （系統・セクション・深掘り／短信のタブは常に見えるよう Header 側にある）
 */

import { escapeHtml, formatEditionDate } from '../utils.js';

export function renderFilterBar(state) {
  return `
    <div class="filter-bar">
      ${renderDateNav(state)}
      <button id="production-note-btn" class="action-btn btn-ghost" title="この紙面がどう作られたかの記録">
        <i data-lucide="clipboard-list"></i>
        <span>制作記録</span>
      </button>
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

/**
 * 日付の移動。左が過去、右が未来。いちばん新しい日にいるときは右を押せない。
 * 前日・前々日と見比べたいときのための機能なので、1日ずつ動かす形にしている。
 */
function renderDateNav(state) {
  const dates = state.archiveDates.map(d => d.date);      // 新しい順
  const current = state.currentDate || dates[0] || null;
  const i = dates.indexOf(current);

  const older = i >= 0 && i < dates.length - 1 ? dates[i + 1] : null;
  const newer = i > 0 ? dates[i - 1] : null;
  const isLatest = state.currentDate === null;

  return `
    <div class="date-nav">
      <button class="date-btn" data-date="${older || ''}" ${older ? '' : 'disabled'} aria-label="前の日">
        <i data-lucide="chevron-left" style="width:16px;height:16px;"></i>
      </button>
      <span class="date-label">${current ? escapeHtml(formatEditionDate(current)) : '—'}${isLatest ? '' : ' <span class="date-past">過去</span>'}</span>
      <button class="date-btn" data-date="${newer || ''}" ${newer ? '' : 'disabled'} aria-label="次の日">
        <i data-lucide="chevron-right" style="width:16px;height:16px;"></i>
      </button>
      ${isLatest ? '' : '<button class="date-btn date-latest" data-date="latest">最新へ</button>'}
    </div>
  `;
}
