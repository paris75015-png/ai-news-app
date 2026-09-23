/**
 * ProductionNote Component — その紙面がどう作られたかの記録。
 *
 * 記事そのものではないので紙面には出さず、ここから開く形にしている。
 * 「どの媒体に届いたか」「何を落としたか」「件数が目標に届いたか」が分かるので、
 * その日の紙面をどこまで信用してよいかの目安になる。
 */

import { escapeHtml } from '../utils.js';

const ACCESS_LABEL = { body: '本文確認', excerpt: '抜粋確認', headline: '見出しのみ' };

export function renderProductionNote(edition, streamTitle) {
  const note = edition?.productionNote;
  if (!edition) return '';

  const access = {};
  for (const a of edition.articles) for (const s of a.sources || []) {
    access[s.access] = (access[s.access] || 0) + 1;
  }
  const total = Object.values(access).reduce((n, v) => n + v, 0);
  const bodyRate = total ? Math.round(((access.body || 0) / total) * 100) : 0;

  return `
    <div class="modal-backdrop active" id="production-note-modal">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="note-title">
        <div class="modal-topbar">
          <div class="card-meta">
            <span class="card-category">制作記録</span>
            <span class="card-source">${escapeHtml(streamTitle)} ・ ${escapeHtml(edition.date || '')}</span>
          </div>
          <button class="modal-close-btn" id="close-note-btn" aria-label="閉じる">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>

        <div class="modal-body">
          <h2 class="modal-title" id="note-title">この紙面はこう作られました</h2>

          <section class="body-section">
            <h3 class="body-label">出典の確度</h3>
            <p class="modal-paragraph">
              出典 ${total} 件のうち、記事本文まで読めたのは <strong>${bodyRate}%</strong>（${access.body || 0}件）。
              ${Object.entries(access).map(([k, v]) => `${ACCESS_LABEL[k] || k} ${v}`).join(' ／ ')}
            </p>
            <p class="modal-paragraph note-hint">
              「抜粋確認」は検索結果に出た範囲だけを見て書いたという意味です。
              そこに現れた数値は引用してよい決まりですが、本文確認より一段落ちます。
            </p>
          </section>

          ${note ? `
          <section class="body-section">
            <h3 class="body-label">媒体への到達</h3>
            <p class="modal-paragraph">
              届いた：${(note.reachedOutlets || []).map(escapeHtml).join('、') || 'なし'}<br>
              届かなかった：${(note.unreachedOutlets || []).map(escapeHtml).join('、') || 'なし'}
            </p>
          </section>

          ${(note.excluded || []).length ? `
          <section class="body-section">
            <h3 class="body-label">落とした話題（${note.excluded.length}）</h3>
            <ul class="source-list">
              ${note.excluded.map(e => `<li class="source-item">${escapeHtml(e.topic)}<span class="source-meta">${escapeHtml(e.reason)}</span></li>`).join('')}
            </ul>
          </section>` : ''}

          ${note.counts ? `
          <section class="body-section">
            <h3 class="body-label">件数</h3>
            <p class="modal-paragraph">
              深掘り ${note.counts.deep ?? '—'} 件 ／ 短信 ${note.counts.brief ?? '—'} 件 ／ 教養 ${note.counts.essays ?? '—'} 件
              ${note.counts.chars ? `／ 本文 ${note.counts.chars} 字` : ''}
            </p>
          </section>` : ''}

          ${note.text ? `
          <section class="body-section">
            <h3 class="body-label">編集の記録</h3>
            <p class="modal-paragraph">${escapeHtml(note.text).replace(/\n/g, '<br>')}</p>
          </section>` : ''}
          ` : '<p class="modal-paragraph note-hint">この紙面には制作記録がありません。</p>'}

          <section class="body-section">
            <h3 class="body-label">生成</h3>
            <p class="modal-paragraph">${escapeHtml(edition.model || '不明')}${edition.editorialVersion != null ? ` ／ 編集方針 v${edition.editorialVersion}` : ''}</p>
          </section>
        </div>

        <div class="modal-actions">
          <button class="action-btn btn-ghost" id="close-note-bottom-btn">
            <i data-lucide="x"></i>
            <span>閉じる</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
