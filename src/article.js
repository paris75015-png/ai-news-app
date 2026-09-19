/**
 * 共通の Article 型。
 * 毎朝の処理（pipeline/build.mjs）が public/data/news.json にこの形で書き出す。
 * 将来ほかのソース（ダイジェストアーカイブ等）を読む場合も、この形に変換してから UI に渡す。
 *
 * @typedef {Object} Article
 * @property {string} id
 * @property {string} url            元記事のURL
 * @property {string} headline       日本語見出し
 * @property {string} originalTitle  元の見出し
 * @property {string} outlet         出典媒体名
 * @property {'overseas'|'domestic'|null} region
 * @property {string|null} category  カテゴリーID（pipeline/editorial.js の CATEGORIES）
 * @property {number|null} score     重要度（0〜100）。ダイジェスト統合時はダイジェスト側のスコアをそのまま入れる
 * @property {'must'|'should'|'interest'|'spare'} tier 重要度の段階
 * @property {string} pubDate        ISO 8601
 * @property {string|null} summary   日本語要約（段落は空行区切り）
 * @property {boolean} bodyAvailable 元記事の本文を読んで要約したか
 * @property {string|null} discussionUrl  HN の議論ページなど
 */

export const TIERS = [
  { id: 'must', label: '必読' },
  { id: 'should', label: '読むべき' },
  { id: 'interest', label: '興味があれば' },
  { id: 'spare', label: '時間があれば' },
];

export function normalizeArticle(item) {
  return {
    id: item.id,
    url: item.url || item.link,
    headline: item.headline || item.title,
    originalTitle: item.originalTitle || item.title || '',
    outlet: item.outlet || item.source || '',
    region: item.region || null,
    category: item.category || null,
    score: typeof item.score === 'number' && item.tier ? item.score : null,
    tier: TIERS.some(t => t.id === item.tier) ? item.tier : 'spare',
    pubDate: item.pubDate || new Date().toISOString(),
    summary: item.summary || null,
    bodyAvailable: item.bodyAvailable !== false,
    discussionUrl: item.discussionUrl || item.meta?.discussionUrl || null,
  };
}
