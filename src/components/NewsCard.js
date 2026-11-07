/**
 * NewsCard Component
 * 深掘り（deep）は大きいカード＋リード、短信（brief）は小さいカード。
 * AI日報は全件が短信なので、従来どおり重要度（tier）で大きさを変える。
 * カード全体がクリック対象（本文モーダルを開く）
 */

import { escapeHtml, formatDate, splitParagraphs } from '../utils.js';

export function renderNewsCard(article, isBookmarked, sectionLabel) {
  const id = escapeHtml(article.id);
  const deep = article.depth === 'deep';
  // 深掘りは body の最初の節、短信は summary の冒頭をリードにする
  const leadText = deep
    ? splitParagraphs(article.body?.[0]?.text || '')[0] || ''
    : splitParagraphs(article.summary || '')[0] || '';
  const showLead = deep || article.stream === 'intl' || article.tier === 'must' || article.tier === 'should';
  const size = deep ? 'deep' : `tier-${article.tier}`;

  return `
    <article class="news-card ${size} ${deep ? 'card-deep' : 'card-brief'} ${showLead && leadText ? 'has-lead' : ''} open-modal-btn" data-article-id="${id}" tabindex="0" role="button">
      <div class="card-meta">
        ${deep ? '<span class="depth-badge">深掘り</span>' : ''}
        ${sectionLabel ? `<span class="card-category">${escapeHtml(sectionLabel)}</span>` : ''}
        <span class="card-source">${escapeHtml(article.outlet)} ・ ${formatDate(article.pubDate)}</span>
      </div>

      <h3 class="card-title">${escapeHtml(article.headline)}</h3>
      ${renderFacts(article)}
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
 * 点数は画面に出さない（2026-11-07）。点数は並べる順にだけ使い、読者には数えられる事実を示す。
 *   国際：海外で取り上げた媒体の数・日本の主要見出しに出たか・何日続いているか
 *   AI日報：何も付けない（「必読」「読むべき」などの節の見出しで足りる）
 */
export function renderFacts(article) {
  const c = article.coverage;
  if (!c) return '';
  const n = s => Number(String(s).split('/')[0]);
  const world = n(c.world);
  const jp = n(c.jp);
  const days = c.daysSeen ?? Number((article.continuity?.note || '').match(/(\d+)日連続/)?.[1] || 0);
  const facts = [
    [`海外 ${world}媒体`, `海外${String(c.world).split('/')[1] || ''}媒体のうち、取り上げた数`, ''],
    jp === 0
      ? ['日本の主要見出しになし', '日本6媒体の主要見出し・ランキングに出ていない（報道がないとは限らない）', 'fact-jp-none']
      : [`日本の主要見出し ${jp}媒体`, '日本6媒体の主要見出し・ランキングに出た数', ''],
    days > 1 ? [`${days}日連続`, '海外で報じられ続けている日数', ''] : null,
  ].filter(Boolean);
  return `<p class="card-facts">${facts.map(([t, title, cls]) => `<span class="fact-chip ${cls}" title="${escapeHtml(title)}">${escapeHtml(t)}</span>`).join('')}</p>`;
}
