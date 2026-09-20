/**
 * 共通の Article 型。
 * 3つの系統（AI日報・国内深掘り・国際深掘り）が、すべてこの形で書き出す。
 *
 *   AI日報     … pipeline/build.mjs（GitHub Actions・Gemini/Groq）が public/data/ai.json へ
 *   国内深掘り … クラウドの定期実行（Claude）が public/data/domestic.json へ
 *   国際深掘り … クラウドの定期実行（Claude）が public/data/intl.json へ
 *
 * 編集方針は editorial/ にある。
 *
 * @typedef {Object} Article
 * @property {string} id
 * @property {'ai'|'domestic'|'intl'} stream  どの系統の記事か
 * @property {'deep'|'brief'} depth   deep=深掘り（600〜800字）／brief=短信（150〜250字）。AI日報は全件 brief
 * @property {string|null} section    セクションID（editorial/ の各方針が定義）
 * @property {string} headline        日本語見出し（30字以内）
 * @property {string} originalTitle   元の見出し
 * @property {string} outlet          代表の出典媒体名（詳細は sources）
 * @property {string} url             代表の元記事URL
 * @property {'overseas'|'domestic'|null} region
 * @property {string|null} category   カテゴリーID
 * @property {number|null} score      重要度。**系統ごとに独立した尺度**（下記）
 * @property {'must'|'should'|'interest'|'spare'} tier 重要度の段階
 * @property {string} pubDate         ISO 8601
 * @property {BodySection[]|null} body  深掘りの本文。短信は null
 * @property {string|null} summary     短信の本文／AI日報の要約。深掘りは null
 * @property {Source[]} sources        出典（複数）
 * @property {Continuity|null} continuity 継続ストーリーの情報
 * @property {boolean} bodyAvailable   元記事の本文を読んで書いたか
 * @property {string|null} discussionUrl  HN の議論ページなど
 * @property {string|null} summarizedBy   生成したモデル名
 */

/**
 * 深掘りの本文。ラベル付きの節を順番に並べる。
 * @typedef {Object} BodySection
 * @property {string} label  '概要兼背景' / '今後の影響' / '日本・アジアへの含意' / '視点の差' など
 * @property {string} text   段落は空行（\n\n）区切り
 */

/**
 * 出典。1記事が複数持つ。
 * @typedef {Object} Source
 * @property {string} outlet   媒体名（アグリゲータ名ではなく一次発信元）
 * @property {string|null} url
 * @property {string} date     配信日 'YYYY-MM-DD'
 * @property {'body'|'excerpt'|'headline'} access  本文確認／抜粋確認／見出しのみ
 * @property {string|null} via 転載先で本文を読んだ場合の経路（例：'中日新聞Web'）
 * @property {string|null} note 確認できた内容の要点
 */

/**
 * 継続ストーリー（前回からの差分として扱う記事）。
 * @typedef {Object} Continuity
 * @property {string} previousDate   前回扱った日 'YYYY-MM-DD'
 * @property {number|null} previousScore 前回の最高スコア（＝初期点数）
 * @property {string} note           軌道が変わったと判断した理由。変わっていなければ短信に落とす
 */

/**
 * 1日1系統分のまとまり。public/data/{stream}.json の中身。
 * @typedef {Object} Edition
 * @property {string} date            JST の日付 'YYYY-MM-DD'
 * @property {'ai'|'domestic'|'intl'} stream
 * @property {string} title           'AI日報' / '国内深掘り' / '国際深掘り'
 * @property {string} generatedAt     ISO 8601
 * @property {string} model           生成したモデル名
 * @property {number} editorialVersion
 * @property {Article[]} articles
 * @property {Essay[]} essays         今日の教養
 * @property {ProductionNote} productionNote 制作記録。**読む画面には出さない**
 */

/**
 * 今日の教養。
 * @typedef {Object} Essay
 * @property {string} id
 * @property {string} title            テーマ
 * @property {string} text             解説。段落は空行区切り
 * @property {string[]} relatedArticleIds
 */

/**
 * 制作記録。品質の点検用に機械で読める形で残す。紙面には出さない。
 * @typedef {Object} ProductionNote
 * @property {string[]} reachedOutlets    本文または抜粋で到達できた基本媒体
 * @property {string[]} unreachedOutlets  到達できなかった基本媒体
 * @property {{topic:string, reason:string}[]} excluded 除外した話題とその理由
 * @property {{deep:number, brief:number, essays:number, chars:number}} counts
 * @property {string} text                自由記述
 */

/** 系統の定義。画面のタブ順もこの順。 */
export const STREAMS = [
  { id: 'domestic', title: '国内深掘り', file: 'domestic.json' },
  { id: 'intl',     title: '国際深掘り', file: 'intl.json' },
  { id: 'ai',       title: 'AI日報',     file: 'ai.json' },
];

/**
 * セクション。editorial/ の各方針が定義する `section` の表示名と並び順。
 * 画面ではこの順に節を並べる。
 */
export const SECTIONS = {
  domestic: [
    { id: 'new', label: '今日の新展開' },
    { id: 'ongoing', label: '継続ストーリーの進展' },
    { id: 'world-on-japan', label: '英語圏は日本の何を報じているか' },
    { id: 'brief', label: '短信' },
  ],
  intl: [
    { id: 'unseen', label: '日本では見えにくい論点' },
    { id: 'structural', label: '構造的トレンドの進展' },
    { id: 'science', label: 'サイエンス&知の最前線' },
    { id: 'world', label: '世界の動き' },
  ],
  ai: [
    { id: 'ai', label: 'AI' },
    { id: 'it', label: 'IT' },
    { id: 'science', label: '科学' },
  ],
};

export function sectionLabel(stream, id) {
  return (SECTIONS[stream] || []).find(s => s.id === id)?.label || '';
}

/** 深掘り／短信の表示名 */
export const DEPTHS = [
  { id: 'all', label: 'すべて' },
  { id: 'deep', label: '深掘り' },
  { id: 'brief', label: '短信' },
];

/**
 * スコアの尺度は系統ごとに独立している。
 * 教科ごとの偏差値と同じで、系統をまたいで同じ点数を比べてはいけない。
 * 画面でも並べて比較させない。
 */
export const SCORE_BANDS = {
  domestic: [{ min: 80, mark: '◆◆◆' }, { min: 70, mark: '◆◆' }, { min: 60, mark: '◆' }],
  intl:     [{ min: 90, mark: '◆◆◆' }, { min: 80, mark: '◆◆' }, { min: 70, mark: '◆' }],
  ai:       [{ min: 80, mark: '◆◆◆' }, { min: 65, mark: '◆◆' }, { min: 50, mark: '◆' }],
};

export function scoreMark(stream, score) {
  if (typeof score !== 'number') return '';
  const bands = SCORE_BANDS[stream] || SCORE_BANDS.ai;
  return (bands.find(b => score >= b.min) || {}).mark || '';
}

export const TIERS = [
  { id: 'must', label: '必読' },
  { id: 'should', label: '読むべき' },
  { id: 'interest', label: '興味があれば' },
  { id: 'spare', label: '時間があれば' },
];

export function normalizeArticle(item, stream) {
  const s = item.stream || stream || 'ai';
  const body = Array.isArray(item.body) && item.body.length ? item.body : null;
  return {
    id: item.id,
    stream: s,
    depth: item.depth === 'deep' || body ? 'deep' : 'brief',
    section: item.section || null,
    url: item.url || item.link || (item.sources?.[0]?.url ?? ''),
    headline: item.headline || item.title,
    originalTitle: item.originalTitle || item.title || '',
    outlet: item.outlet || item.source || item.sources?.[0]?.outlet || '',
    region: item.region || (s === 'intl' ? 'overseas' : s === 'domestic' ? 'domestic' : null),
    category: item.category || null,
    score: typeof item.score === 'number' ? item.score : null,
    tier: TIERS.some(t => t.id === item.tier) ? item.tier : 'spare',
    pubDate: item.pubDate || new Date().toISOString(),
    body,
    summary: item.summary || null,
    sources: Array.isArray(item.sources) ? item.sources : [],
    continuity: item.continuity || null,
    bodyAvailable: item.bodyAvailable !== false,
    discussionUrl: item.discussionUrl || item.meta?.discussionUrl || null,
    summarizedBy: item.summarizedBy || null,
  };
}

export function normalizeEdition(data, stream) {
  return {
    date: data.date || (data.generatedAt || '').slice(0, 10),
    stream: data.stream || stream,
    title: data.title || (STREAMS.find(x => x.id === (data.stream || stream)) || {}).title || '',
    generatedAt: data.generatedAt || new Date().toISOString(),
    model: data.model || data.models?.summarizer || '',
    editorialVersion: data.editorialVersion ?? null,
    articles: (data.articles || []).map(a => normalizeArticle(a, data.stream || stream)),
    essays: data.essays || [],
    productionNote: data.productionNote || null,
  };
}
