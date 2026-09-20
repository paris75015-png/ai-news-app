/**
 * Header Component
 * 画面上部に固定表示される。系統のタブ（国内深掘り／国際深掘り／AI日報）と、
 * その中の絞り込みタブをここに置き、スクロールしても常に切り替えられるようにする。
 */

import { escapeHtml } from '../utils.js';
import { STREAMS, SECTIONS, DEPTHS } from '../article.js';

export function renderHeader(state) {
  const edition = state.editions[state.currentStream];
  const updated = edition?.generatedAt
    ? new Date(edition.generatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const title = STREAMS.find(s => s.id === state.currentStream)?.title || 'ニュース';

  return `
    <header class="app-header">
      <div class="header-content">
        <a href="#" class="logo-group" id="logo-btn">
          <div class="logo-icon-wrapper">
            <i data-lucide="newspaper"></i>
          </div>
          <div class="logo-text-group">
            <span class="logo-title">${escapeHtml(title)}</span>
            <span class="logo-subtitle">${updated ? `${updated} 更新` : '平日更新'}</span>
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
      <nav class="stream-nav" aria-label="系統">${renderStreamTabs(state)}</nav>
      ${state.isBookmarkMode ? '' : `<nav class="category-nav" aria-label="絞り込み">${renderSectionTabs(state)}</nav>`}
    </header>
  `;
}

/** 系統のタブ。3系統はスコアの尺度が違うため、必ずどれか1つだけを表示する */
function renderStreamTabs(state) {
  return `<div class="stream-tabs">${STREAMS.map(s => {
    const n = state.editions[s.id]?.articles.length ?? 0;
    const missing = state.editions[s.id] == null;
    return `
      <button class="stream-pill ${state.currentStream === s.id ? 'active' : ''} ${missing ? 'missing' : ''}"
              data-stream="${escapeHtml(s.id)}"
              ${missing ? 'title="本日分はまだありません"' : ''}>
        ${escapeHtml(s.title)}<span class="cat-count">${missing ? '—' : n}</span>
      </button>`;
  }).join('')}</div>`;
}

/** セクションのタブと、深掘り／短信の切り替え */
function renderSectionTabs(state) {
  const list = state.editions[state.currentStream]?.articles ?? [];
  const sections = (SECTIONS[state.currentStream] || []).filter(sec => list.some(a => a.section === sec.id));
  const countOf = id => list.filter(a => a.section === id).length;

  const tabs = [{ id: 'all', label: 'すべて' }, ...sections].map(c => `
    <button class="cat-pill ${state.currentSection === c.id ? 'active' : ''}" data-section="${escapeHtml(c.id)}">
      ${escapeHtml(c.label)}<span class="cat-count">${c.id === 'all' ? list.length : countOf(c.id)}</span>
    </button>`).join('');

  // AI日報は全件が短信なので、深掘り／短信の切り替えは出さない
  const hasDeep = list.some(a => a.depth === 'deep');
  const depth = !hasDeep ? '' : `
    <div class="depth-toggle">
      ${DEPTHS.map(d => {
        const n = d.id === 'all' ? list.length : list.filter(a => a.depth === d.id).length;
        return `<button class="depth-btn ${state.currentDepth === d.id ? 'active' : ''}" data-depth="${d.id}">${d.label}<span class="cat-count">${n}</span></button>`;
      }).join('')}
    </div>`;

  return `<div class="category-tabs">${tabs}</div>${depth}`;
}
