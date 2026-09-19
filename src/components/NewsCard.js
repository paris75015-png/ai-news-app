/**
 * NewsCard Component
 * 重要度（tier）によって大きさと情報量を変える：
 *   must     … 大きいカード＋要約の冒頭
 *   should   … 中くらいのカード＋要約の冒頭（短め）
 *   interest … 見出しのみのカード
 *   spare    … 1行のリスト
 * カード全体がクリック対象（要約モーダルを開く）
 */

import { escapeHtml, formatDate } from '../utils.js';

export function renderNewsCard(article, isBookmarked, categoryLabel) {
  const id = escapeHtml(article.id);
  const lead = article.summary ? escapeHtml(article.summary.split(/\n\s*\n/)[0]) : '';
  const showLead = (article.tier === 'must' || article.tier === 'should') && lead;

  return `
    <article class="news-card tier-${article.tier} open-modal-btn" data-article-id="${id}" tabindex="0" role="button">
      <div class="card-meta">
        ${renderScore(article)}
        ${categoryLabel ? `<span class="card-category">${escapeHtml(categoryLabel)}</span>` : ''}
        <span class="card-source">${escapeHtml(article.outlet)} ・ ${formatDate(article.pubDate)}</span>
      </div>

      <h3 class="card-title">${escapeHtml(article.headline)}</h3>
      ${showLead ? `<p class="card-lead">${lead}</p>` : ''}

      <button
        class="icon-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}"
        data-article-id="${id}"
        title="${isBookmarked ? '保存から削除' : '保存する'}"
        aria-label="${isBookmarked ? '保存から削除' : '保存する'}"
      >
        <i data-lucide="bookmark" style="width:15px;height:15px;"></i>
      </button>
    </article>
  `;
}

export function renderScore(article) {
  if (article.score == null) return '';
  return `<span class="score-badge score-${article.tier}" title="重要度スコア">${article.score}</span>`;
}
