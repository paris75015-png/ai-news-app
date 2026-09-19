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

/**
 * 要約を段落に分ける。空行があればそれで分け、無い長文は3文ごとに区切る
 * （以前の生成データには段落の区切りが無いものがあるため）
 */
export function splitParagraphs(text) {
  const blocks = String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (blocks.length !== 1 || blocks[0].length < 160) return blocks;

  const sentences = blocks[0].match(/[^。！？]+[。！？」』）]*/g) || [blocks[0]];
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join('').trim());
  }
  return paragraphs.filter(Boolean);
}
