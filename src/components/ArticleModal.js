/**
 * ArticleModal Component
 * 上部（✕）と下部（閉じる・元記事）を固定表示し、読み終えた位置からすぐ閉じられるようにする。
 *
 * 深掘り … body のラベル付きの節を順に並べ、最後に出典の一覧を出す
 * 短信   … summary を段落で出す
 */

import { escapeHtml, formatDate, splitParagraphs } from '../utils.js';
import { TIERS } from '../article.js';
import { renderScore } from './NewsCard.js';

const ACCESS_LABEL = { body: '本文確認', excerpt: '抜粋確認', headline: '見出しのみ' };

export function renderArticleModal(article, isBookmarked, sectionLabel) {
  if (!article) return '';

  const tierLabel = article.score != null ? TIERS.find(t => t.id === article.tier)?.label : '';
  const showOriginal = article.originalTitle && article.originalTitle !== article.headline;

  return `
    <div class="modal-backdrop active" id="article-modal">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-topbar">
          <div class="card-meta">
            ${renderScore(article)}
            ${article.depth === 'deep' ? '<span class="depth-badge">深掘り</span>' : ''}
            ${tierLabel ? `<span class="tier-label tier-label-${article.tier}">${tierLabel}</span>` : ''}
            ${sectionLabel ? `<span class="card-category">${escapeHtml(sectionLabel)}</span>` : ''}
          </div>
          <button class="modal-close-btn" id="close-modal-btn" aria-label="閉じる">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>

        <div class="modal-body">
          <h2 class="modal-title" id="modal-title">${escapeHtml(article.headline)}</h2>
          ${showOriginal ? `<p class="modal-original-title">${escapeHtml(article.originalTitle)}</p>` : ''}
          <div class="card-source">${escapeHtml(article.outlet)} ・ ${formatDate(article.pubDate)}</div>
          ${renderContinuity(article)}
          ${article.body ? renderBody(article) : renderSummary(article)}
          ${renderSources(article)}
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

/** 継続ストーリーは、前回いつ扱ったかを先に示す */
function renderContinuity(article) {
  const c = article.continuity;
  if (!c) return '';
  return `<p class="continuity-note">${escapeHtml(c.previousDate)} の続き${c.previousScore != null ? `（前回 ${c.previousScore}）` : ''}</p>`;
}

/** 深掘りの本文。節のラベルを見出しにして順に並べる */
function renderBody(article) {
  const sections = article.body.map(sec => `
    <section class="body-section">
      <h3 class="body-label">${escapeHtml(sec.label)}</h3>
      ${splitParagraphs(sec.text).map(p => `<p class="modal-paragraph">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}
    </section>
  `).join('');
  return `<div class="summary-text">${sections}</div>${renderCredit(article)}`;
}

/** 短信・AI日報の本文 */
function renderSummary(article) {
  if (!article.summary) {
    return `<p class="modal-paragraph" style="color:var(--text-muted);">この記事の本文はありません。元の記事をご覧ください。</p>`;
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

  return `${notice}<div class="summary-text">${paragraphs}</div>${renderCredit(article)}`;
}

/**
 * 出典の一覧。どの媒体を「本文まで読んだのか／抜粋だけか／見出しだけか」を出す。
 * ここが読者にとっての確度の目安になる。
 */
function renderSources(article) {
  const list = (article.sources || []).filter(s => s.outlet);
  if (list.length <= 1) return '';
  const rows = list.map(s => {
    const label = ACCESS_LABEL[s.access] || '';
    const name = s.url
      ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.outlet)}</a>`
      : escapeHtml(s.outlet);
    return `<li class="source-item">
      ${name}
      <span class="source-meta">${escapeHtml(s.date || '')}${s.via ? ` ・ ${escapeHtml(s.via)}掲載` : ''}${label ? ` ・ ${label}` : ''}</span>
    </li>`;
  }).join('');
  return `<section class="sources-section"><h3 class="body-label">出典（${list.length}）</h3><ul class="source-list">${rows}</ul></section>`;
}

function renderCredit(article) {
  return article.summarizedBy
    ? `<p class="summary-credit">要約: ${escapeHtml(modelLabel(article.summarizedBy))}</p>`
    : '';
}

/** モデル名を読みやすい表記にする */
function modelLabel(model) {
  if (model.startsWith('openai/')) return `${model.replace('openai/', 'OpenAI ')}（Groq）`;
  if (model.startsWith('gemini-')) return `Google ${model.replace('gemini-', 'Gemini ')}`;
  if (model.startsWith('claude-')) return model.replace('claude-', 'Claude ');
  if (model === 'gemini' || model === 'groq') return model === 'gemini' ? 'Google Gemini' : 'OpenAI GPT-OSS（Groq）';
  return model;
}
