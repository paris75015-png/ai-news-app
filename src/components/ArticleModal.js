/**
 * ArticleModal Component
 * 日本語見出し・元の見出し・媒体・日時・重要度・要約本文・元記事リンクを表示する
 */

import { escapeHtml, formatDate } from '../utils.js';
import { TIERS } from '../article.js';
import { renderScore } from './NewsCard.js';

export function renderArticleModal(article, isBookmarked, categoryLabel) {
  if (!article) return '';

  const tierLabel = article.score != null ? TIERS.find(t => t.id === article.tier)?.label : '';
  const showOriginal = article.originalTitle && article.originalTitle !== article.headline;

  return `
    <div class="modal-backdrop active" id="article-modal">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <div>
            <div class="card-meta" style="margin-bottom:10px;">
              ${renderScore(article)}
              ${tierLabel ? `<span class="tier-label tier-label-${article.tier}">${tierLabel}</span>` : ''}
              ${categoryLabel ? `<span class="card-category">${escapeHtml(categoryLabel)}</span>` : ''}
            </div>
            <h2 class="modal-title" id="modal-title">${escapeHtml(article.headline)}</h2>
            ${showOriginal ? `<p class="modal-original-title">${escapeHtml(article.originalTitle)}</p>` : ''}
            <div class="card-source" style="margin-top:8px;">
              ${escapeHtml(article.outlet)} ・ ${formatDate(article.pubDate)}
            </div>
          </div>
          <button class="modal-close-btn" id="close-modal-btn" aria-label="閉じる">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>

        <div>${renderSummary(article)}</div>

        <div class="modal-actions">
          <button
            class="action-btn btn-ghost modal-bookmark-btn ${isBookmarked ? 'btn-amber' : ''}"
            data-article-id="${escapeHtml(article.id)}"
          >
            <i data-lucide="bookmark"></i>
            <span>${isBookmarked ? '保存済み' : '保存する'}</span>
          </button>

          <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" class="action-btn btn-primary" style="text-decoration:none;">
            <span>元の記事を読む</span>
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

  const paragraphs = article.summary
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p class="modal-paragraph">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `${notice}<div class="summary-text">${paragraphs}</div>`;
}
