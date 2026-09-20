/**
 * NewsCard Component
 * 深掘り（deep）は大きいカード＋リード、短信（brief）は小さいカード。
 * AI日報は全件が短信なので、従来どおり重要度（tier）で大きさを変える。
 * カード全体がクリック対象（本文モーダルを開く）
 */

import { escapeHtml, formatDate, splitParagraphs } from '../utils.js';
import { scoreMark } from '../article.js';

export function renderNewsCard(article, isBookmarked, sectionLabel) {
  const id = escapeHtml(article.id);
  const deep = article.depth === 'deep';
  // 深掘りは body の最初の節、短信は summary の冒頭をリードにする
  const leadText = deep
    ? splitParagraphs(article.body?.[0]?.text || '')[0] || ''
    : splitParagraphs(article.summary || '')[0] || '';
  const showLead = deep || article.tier === 'must' || article.tier === 'should';
  const size = deep ? 'deep' : `tier-${article.tier}`;

  return `
    <article class="news-card ${size} ${deep ? 'card-deep' : 'card-brief'} open-modal-btn" data-article-id="${id}" tabindex="0" role="button">
      <div class="card-meta">
        ${renderScore(article)}
        ${deep ? '<span class="depth-badge">深掘り</span>' : ''}
        ${sectionLabel ? `<span class="card-category">${escapeHtml(sectionLabel)}</span>` : ''}
        <span class="card-source">${escapeHtml(article.outlet)} ・ ${formatDate(article.pubDate)}</span>
      </div>

      <h3 class="card-title">${escapeHtml(article.headline)}</h3>
      ${showLead && leadText ? `<p class="card-lead">${escapeHtml(leadText)}</p>` : ''}

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

/**
 * スコアは系統ごとに尺度が違う（教科ごとの偏差値と同じ）ので、
 * 帯記号もその系統の基準で付ける。系統をまたいで数字を比べさせない。
 */
export function renderScore(article) {
  if (article.score == null) return '';
  const mark = scoreMark(article.stream, article.score);
  return `<span class="score-badge score-${article.tier}" title="この系統の中での重要度">${mark ? `${mark} ` : ''}${article.score}</span>`;
}
