import {
  createIcons, AlertTriangle, Bookmark, ExternalLink,
  Inbox, Newspaper, RotateCw, Search, X
} from 'lucide';
import { NewsFetcherService } from './services/newsFetcher.js';
import { StorageService } from './services/storage.js';
import { TIERS } from './article.js';
import { renderHeader } from './components/Header.js';
import { renderFilterBar } from './components/FilterBar.js';
import { renderNewsCard } from './components/NewsCard.js';
import { renderArticleModal } from './components/ArticleModal.js';

// 使用するアイコンだけを読み込む（全アイコンを含めるとバンドルが大きくなるため）
const icons = { AlertTriangle, Bookmark, ExternalLink, Inbox, Newspaper, RotateCw, Search, X };

// Application State
const state = {
  articles: [],
  categories: [],
  generatedAt: null,
  filteredArticles: [],
  bookmarks: StorageService.getBookmarks(),
  currentCategory: 'all',
  currentRegion: 'all',
  searchQuery: '',
  isBookmarkMode: false,
  activeModalArticle: null,
  isLoading: true
};

async function initApp() {
  renderApp();
  await loadNews();
}

async function loadNews() {
  state.isLoading = true;
  renderApp();

  try {
    const data = await NewsFetcherService.fetchNews();
    state.articles = data.articles;
    state.categories = data.categories;
    state.generatedAt = data.generatedAt;
  } catch (error) {
    console.error('Failed to load news:', error);
    showToast('⚠️ ニュースを読み込めませんでした。時間をおいて再試行してください。');
  }
  filterArticles();
  state.isLoading = false;
  renderApp();
}

function filterArticles() {
  let list = state.isBookmarkMode ? state.bookmarks : state.articles;

  if (state.currentCategory !== 'all') {
    list = list.filter(a => a.category === state.currentCategory);
  }
  if (state.currentRegion !== 'all') {
    list = list.filter(a => a.region === state.currentRegion);
  }
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(a =>
      [a.headline, a.originalTitle, a.outlet, a.summary || ''].some(s => s.toLowerCase().includes(q))
    );
  }

  state.filteredArticles = list;
}

function findArticle(id) {
  return state.articles.find(a => a.id === id) || state.bookmarks.find(a => a.id === id);
}

function categoryLabel(id) {
  return state.categories.find(c => c.id === id)?.label || '';
}

/** 重要度の段階ごとにまとめ、紙面のように大きい順に並べる */
function renderSections() {
  return TIERS.map(tier => {
    const items = state.filteredArticles
      .filter(a => a.tier === tier.id)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (items.length === 0) return '';
    const cards = items
      .map(a => renderNewsCard(a, StorageService.isBookmarked(a.id), categoryLabel(a.category)))
      .join('');
    return `
      <section class="tier-section">
        <h2 class="tier-heading tier-heading-${tier.id}">${tier.label}<span class="tier-count">${items.length}</span></h2>
        <div class="news-grid grid-${tier.id}">${cards}</div>
      </section>
    `;
  }).join('');
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
        <h3>該当するニュースが見つかりません</h3>
        <p>${state.isBookmarkMode ? '保存した記事はまだありません。' : '条件を変更するか、別のキーワードで検索してください。'}</p>
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
    modalRoot.innerHTML = renderArticleModal(a, StorageService.isBookmarked(a.id), categoryLabel(a.category));
  } else {
    modalRoot.innerHTML = '';
  }

  createIcons({ icons });
  attachEventListeners();
}

function closeModal() {
  state.activeModalArticle = null;
  renderApp();
}

function toggleBookmark(id) {
  const article = findArticle(id);
  if (!article) return;
  const added = StorageService.toggleBookmark(article);
  state.bookmarks = StorageService.getBookmarks();
  filterArticles();
  renderApp();
  showToast(added ? '🔖 保存しました' : '保存から削除しました');
}

function attachEventListeners() {
  // Category Tabs
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      state.currentCategory = e.currentTarget.getAttribute('data-category');
      filterArticles();
      renderApp();
    });
  });

  // Region Toggle
  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.currentRegion = e.currentTarget.getAttribute('data-region');
      filterArticles();
      renderApp();
    });
  });

  // Search Input
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
    state.currentCategory = 'all';
    state.currentRegion = 'all';
    state.searchQuery = '';
    state.isBookmarkMode = false;
    filterArticles();
    renderApp();
  });

  // Card Click → 要約モーダルを開く
  document.querySelectorAll('.open-modal-btn').forEach(card => {
    const open = () => {
      const found = findArticle(card.getAttribute('data-article-id'));
      if (found) {
        state.activeModalArticle = found;
        renderApp();
      }
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target === card) open();
    });
  });

  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
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
