/**
 * ArticleModal Component
 * 上部（✕）と下部（閉じる・元記事）を固定表示し、読み終えた位置からすぐ閉じられるようにする。
 */

import { escapeHtml, formatDate, splitParagraphs } from '../utils.js';
import { TIERS } from '../article.js';
import { renderScore } from './NewsCard.js';

export function renderArticleModal(article, isBookmarked, categoryLabel) {
  if (!article) return '';

  const tierLabel = article.score != null ? TIERS.find(t => t.id === article.tier)?.label : '';
  const showOriginal = article.originalTitle && article.originalTitle !== article.headline;

  return `
    <div class="modal-backdrop active" id="article-modal">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-topbar">
          <div class="card-meta">
            ${renderScore(article)}
            ${tierLabel ? `<span class="tier-label tier-label-${article.tier}">${tierLabel}</span>` : ''}
            ${categoryLabel ? `<span class="card-category">${escapeHtml(categoryLabel)}</span>` : ''}
          </div>
          <button class="modal-close-btn" id="close-modal-btn" aria-label="閉じる">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>

        <div class="modal-body">
          <h2 class="modal-title" id="modal-title">${escapeHtml(article.headline)}</h2>
          ${showOriginal ? `<p class="modal-original-title">${escapeHtml(article.originalTitle)}</p>` : ''}
          <div class="card-source">${escapeHtml(article.outlet)} ・ ${formatDate(article.pubDate)}</div>
          ${renderSummary(article)}
        </div>

        <div class="modal-actions">
          <button class="action-btn btn-ghost" id="close-modal-bottom-btn">
            <i data-lucide="x"></i>
            <span>閉じる</span>
          </button>
          <button
            class="action-btn btn-ghost modal-bookmark-btn ${isBookmarked ? 'btn-amber' : ''}"
            data-article-id="${escapeHtml(article.id)}"
            aria-label="${isBookmarked ? '保存済み' : '保存する'}"
          >
            <i data-lucide="bookmark"></i>
          </button>
          <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" class="action-btn btn-primary modal-source-link">
            <span>元の記事</span>
            <i data-lucide="external-link"></i>
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderSummary(article) {
  if (!article.summary) {
    return `<p class="modal-paragraph" style="color:var(--text-muted);">この記事の要約はありません。元の記事をご覧ください。</p>`;
  }

  const notice = !article.bodyAvailable
    ? `<div class="summary-notice">
         <i data-lucide="alert-triangle" style="width:16px;height:16px;flex-shrink:0;"></i>
         <span>元記事の本文を取得できませんでした（ペイウォール等）。以下は見出しと概要のみに基づく要約です。</span>
       </div>`
    : '';

  const paragraphs = splitParagraphs(article.summary)
    .map(p => `<p class="modal-paragraph">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `${notice}<div class="summary-text">${paragraphs}</div>`;
}
