/**
 * 表示用ユーティリティ
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (!dateStr || isNaN(d.getTime())) return '';
  const diffHours = Math.floor((Date.now() - d) / (1000 * 60 * 60));
  if (diffHours < 1) return 'たった今';
  if (diffHours < 24) return `${diffHours}時間前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
