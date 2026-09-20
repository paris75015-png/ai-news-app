import {
  createIcons, AlertTriangle, Bookmark, ExternalLink,
  Inbox, Newspaper, RotateCw, Search, X
} from 'lucide';
import { NewsFetcherService } from './services/newsFetcher.js';
import { StorageService } from './services/storage.js';
import { STREAMS, SECTIONS, TIERS, sectionLabel } from './article.js';
import { renderHeader } from './components/Header.js';
import { renderFilterBar } from './components/FilterBar.js';
import { renderNewsCard } from './components/NewsCard.js';
import { renderArticleModal } from './components/ArticleModal.js';
import { escapeHtml, splitParagraphs } from './utils.js';

// 使用するアイコンだけを読み込む（全アイコンを含めるとバンドルが大きくなるため）
const icons = { AlertTriangle, Bookmark, ExternalLink, Inbox, Newspaper, RotateCw, Search, X };

const LAST_STREAM_KEY = 'lastStream';

const state = {
  // 系統ごとの当日分。読めなかった系統は null
  editions: Object.fromEntries(STREAMS.map(s => [s.id, null])),
  filteredArticles: [],
  bookmarks: StorageService.getBookmarks(),
  currentStream: readLastStream(),
  currentSection: 'all',
  currentDepth: 'all',
  searchQuery: '',
  isBookmarkMode: false,
  activeModalArticle: null,
  isLoading: true
};

/** 前回見ていた系統を覚えておく（読めないときは先頭の系統） */
function readLastStream() {
  try {
    const v = localStorage.getItem(LAST_STREAM_KEY);
    if (STREAMS.some(s => s.id === v)) return v;
  } catch { /* プライベートモード等では使わない */ }
  return STREAMS[0].id;
}

function saveLastStream(id) {
  try { localStorage.setItem(LAST_STREAM_KEY, id); } catch { /* 保存できなくても動作に影響しない */ }
}

async function initApp() {
  renderApp();
  await loadNews();
}

async function loadNews() {
  state.isLoading = true;
  renderApp();

  try {
    state.editions = await NewsFetcherService.fetchAll();
    // 選んでいる系統が本日無ければ、中身のある系統に寄せる
    if (!state.editions[state.currentStream]) {
      const available = STREAMS.find(s => state.editions[s.id]);
      if (available) state.currentStream = available.id;
    }
    if (STREAMS.every(s => !state.editions[s.id])) {
      showToast('⚠️ ニュースを読み込めませんでした。時間をおいて再試行してください。');
    }
  } catch (error) {
    console.error('Failed to load news:', error);
    showToast('⚠️ ニュースを読み込めませんでした。時間をおいて再試行してください。');
  }
  filterArticles();
  state.isLoading = false;
  renderApp();
}

function currentArticles() {
  return state.editions[state.currentStream]?.articles ?? [];
}

function filterArticles() {
  let list = state.isBookmarkMode ? state.bookmarks : currentArticles();

  if (!state.isBookmarkMode) {
    if (state.currentSection !== 'all') list = list.filter(a => a.section === state.currentSection);
    if (state.currentDepth !== 'all') list = list.filter(a => a.depth === state.currentDepth);
  }
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(a => searchableText(a).toLowerCase().includes(q));
  }

  state.filteredArticles = list;
}

/** 検索対象。深掘りは body の各節も含める */
function searchableText(a) {
  const body = (a.body || []).map(s => s.text).join(' ');
  return [a.headline, a.originalTitle, a.outlet, a.summary || '', body].join(' ');
}

function findArticle(id) {
  for (const s of STREAMS) {
    const found = state.editions[s.id]?.articles.find(a => a.id === id);
    if (found) return found;
  }
  return state.bookmarks.find(a => a.id === id);
}

function labelOf(article) {
  return sectionLabel(article.stream, article.section);
}

/**
 * 深掘り2系統はセクション順に、AI日報は重要度の段階順に並べる。
 * 保存した記事の一覧は系統が混ざるので、単純に1列にする。
 */
function renderSections() {
  if (state.isBookmarkMode) return renderGroup('保存した記事', state.filteredArticles);

  const groups = state.currentStream === 'ai'
    ? TIERS.map(t => [t.label, state.filteredArticles.filter(a => a.tier === t.id), t.id])
    : (SECTIONS[state.currentStream] || []).map(s => [s.label, state.filteredArticles.filter(a => a.section === s.id), s.id]);

  const body = groups.map(([label, items, id]) => renderGroup(label, items, id)).join('');
  return body + renderEssays();
}

function renderGroup(label, items, id = 'spare') {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const cards = sorted
    .map(a => renderNewsCard(a, StorageService.isBookmarked(a.id), labelOf(a)))
    .join('');
  return `
    <section class="tier-section">
      <h2 class="tier-heading tier-heading-${escapeHtml(id)}">${escapeHtml(label)}<span class="tier-count">${items.length}</span></h2>
      <div class="news-grid grid-${escapeHtml(id)}">${cards}</div>
    </section>
  `;
}

/** 今日の教養。絞り込みや検索をしているときは出さない（紙面の付録という位置づけのため） */
function renderEssays() {
  const essays = state.editions[state.currentStream]?.essays ?? [];
  const filtering = state.currentSection !== 'all' || state.currentDepth !== 'all' || state.searchQuery.trim();
  if (essays.length === 0 || filtering) return '';

  const items = essays.map(e => `
    <article class="essay-card">
      <h3 class="essay-title">${escapeHtml(e.title)}</h3>
      ${splitParagraphs(e.text).map(p => `<p class="modal-paragraph">${escapeHtml(p)}</p>`).join('')}
    </article>
  `).join('');

  return `
    <section class="tier-section">
      <h2 class="tier-heading tier-heading-essay">今日の教養<span class="tier-count">${essays.length}</span></h2>
      <div class="essay-grid">${items}</div>
    </section>
  `;
}

function renderApp() {
  const appEl = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  if (!appEl) return;

  let contentHtml = '';
  if (state.isLoading) {
    contentHtml = `<div class="news-grid grid-should">${Array(4).fill(0).map(() => `
      <div class="skeleton-card">
        <div class="skeleton-line" style="height: 14px; width: 40%;"></div>
        <div class="skeleton-line" style="height: 24px; width: 90%;"></div>
        <div class="skeleton-line" style="height: 48px; width: 100%;"></div>
      </div>
    `).join('')}</div>`;
  } else if (state.filteredArticles.length === 0) {
    contentHtml = `
      <div class="empty-state">
        <i data-lucide="inbox" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 12px;"></i>
        <h3>${emptyTitle()}</h3>
        <p>${emptyHint()}</p>
      </div>
    `;
  } else {
    contentHtml = renderSections();
  }

  appEl.innerHTML = `
    ${renderHeader(state)}
    <main class="app-container">
      ${renderFilterBar(state)}
      ${contentHtml}
    </main>
  `;

  if (state.activeModalArticle) {
    const a = state.activeModalArticle;
    modalRoot.innerHTML = renderArticleModal(a, StorageService.isBookmarked(a.id), labelOf(a));
  } else {
    modalRoot.innerHTML = '';
  }

  createIcons({ icons });
  attachEventListeners();
}

function emptyTitle() {
  if (state.isBookmarkMode) return '保存した記事はまだありません';
  if (!state.editions[state.currentStream]) return '本日分はまだありません';
  return '該当するニュースが見つかりません';
}

function emptyHint() {
  if (state.isBookmarkMode) return '記事の🔖から保存できます。';
  if (!state.editions[state.currentStream]) {
    const title = STREAMS.find(s => s.id === state.currentStream)?.title || '';
    return `${title}は平日のみ更新します。他の系統のタブに切り替えてみてください。`;
  }
  return '条件を変更するか、別のキーワードで検索してください。';
}

// 記事を開くときに履歴を1つ積む。スマホの「戻る」操作（スワイプ）でも一覧に戻れるようにするため
function openModal(article) {
  state.activeModalArticle = article;
  history.pushState({ modal: article.id }, '');
  renderApp();
  document.querySelector('.modal-content')?.scrollTo(0, 0);
}

function closeModal() {
  if (history.state?.modal) history.back(); // popstate で閉じる
  else hideModal();
}

function hideModal() {
  if (!state.activeModalArticle) return;
  state.activeModalArticle = null;
  renderApp();
}

window.addEventListener('popstate', hideModal);

function toggleBookmark(id) {
  const article = findArticle(id);
  if (!article) return;
  const added = StorageService.toggleBookmark(article);
  state.bookmarks = StorageService.getBookmarks();
  filterArticles();
  const modalScroll = document.querySelector('.modal-content')?.scrollTop;
  renderApp();
  if (modalScroll != null) document.querySelector('.modal-content')?.scrollTo(0, modalScroll);
  showToast(added ? '🔖 保存しました' : '保存から削除しました');
}

function attachEventListeners() {
  // 系統のタブ
  document.querySelectorAll('.stream-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-stream');
      if (id === state.currentStream) return;
      state.currentStream = id;
      state.currentSection = 'all';
      state.currentDepth = 'all';
      state.isBookmarkMode = false;
      saveLastStream(id);
      filterArticles();
      renderApp();
      window.scrollTo({ top: 0 });
    });
  });

  // セクションのタブ
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      state.currentSection = e.currentTarget.getAttribute('data-section');
      filterArticles();
      renderApp();
      window.scrollTo({ top: 0 });
    });
  });

  // 深掘り／短信の切り替え
  document.querySelectorAll('.depth-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.currentDepth = e.currentTarget.getAttribute('data-depth');
      filterArticles();
      renderApp();
    });
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      filterArticles();
      renderApp();
      // 再描画で入力欄が作り直されるのでフォーカスを戻す
      const el = document.getElementById('search-input');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  document.getElementById('refresh-btn')?.addEventListener('click', () => loadNews());

  document.getElementById('bookmarks-toggle-btn')?.addEventListener('click', () => {
    state.isBookmarkMode = !state.isBookmarkMode;
    filterArticles();
    renderApp();
  });

  document.getElementById('logo-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    state.currentSection = 'all';
    state.currentDepth = 'all';
    state.searchQuery = '';
    state.isBookmarkMode = false;
    filterArticles();
    renderApp();
  });

  // カードのクリック → 本文モーダルを開く
  document.querySelectorAll('.open-modal-btn').forEach(card => {
    const open = () => {
      const found = findArticle(card.getAttribute('data-article-id'));
      if (found) openModal(found);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target === card) open();
    });
  });

  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('close-modal-bottom-btn')?.addEventListener('click', closeModal);
  const modalBackdrop = document.getElementById('article-modal');
  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  document.querySelectorAll('.bookmark-btn, .modal-bookmark-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // カードのクリック（モーダル表示）を発火させない
      toggleBookmark(e.currentTarget.getAttribute('data-article-id'));
    });
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.activeModalArticle) closeModal();
});

function showToast(message) {
  const container = document.getElementById('toast-root');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

document.addEventListener('DOMContentLoaded', initApp);
