/**
 * Header Component
 */

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
    </header>
  `;
}
