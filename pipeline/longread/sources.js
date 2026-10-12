/**
 * 読み物（日替わりテーマの深掘り）の材料にする媒体。試験運用中。
 *
 * 選んだ条件：Actions から記事本文まで取れること（2026-10-12 に手元で実測）。
 * 不採用：Le Monde（有料）、Chatham House・IMF・East Asia Forum（403）、Crisis Group（本文が 403）、
 *         Bruegel（フィードが古い）、Lowy Interpreter（本文が500字ほどで切れる）、Brookings・Carnegie（フィードが空）
 *
 * kind:   'analysis' … 論考・解説が中心。読み物の芯になる
 *         'report'   … 報道。事実関係の確認に使う
 * themes: その媒体を、どのテーマの日に読むか
 */

/** 曜日（JST、1=月〜5=金）ごとのテーマ。金曜はテーマを決めず、その週に残った大きい話題を拾う */
export const THEMES = {
  1: { id: 'politics', label: '政治' },
  2: { id: 'economy', label: '経済' },
  3: { id: 'society', label: '社会' },
  4: { id: 'conflict', label: '紛争・安全保障' },
  5: { id: 'any', label: '自由（その週に残った話題）' },
};

const ALL = ['politics', 'economy', 'society', 'conflict'];

export const LONGREAD_FEEDS = [
  // 論考・解説
  { name: 'The Conversation', kind: 'analysis', themes: ['politics', 'economy', 'society'], url: 'https://theconversation.com/global/articles.atom' },
  { name: 'The Conversation（政治）', outlet: 'The Conversation', kind: 'analysis', themes: ['politics'], url: 'https://theconversation.com/us/politics/articles.atom' },
  { name: 'VoxEU (CEPR)', kind: 'analysis', themes: ['economy'], url: 'https://cepr.org/rss/vox-content' },
  { name: 'Foreign Policy', kind: 'analysis', themes: ['politics', 'conflict'], url: 'https://foreignpolicy.com/feed/' },
  { name: 'War on the Rocks', kind: 'analysis', themes: ['conflict'], url: 'https://warontherocks.com/feed/' },
  { name: 'The Diplomat', kind: 'analysis', themes: ['politics', 'conflict'], url: 'https://thediplomat.com/feed/' },
  { name: 'The Guardian（長文読み物）', outlet: 'The Guardian', kind: 'analysis', themes: ['politics', 'economy', 'society'], url: 'https://www.theguardian.com/news/series/the-long-read/rss' },

  // 報道（テーマ別）
  { name: 'The Guardian（政治）', outlet: 'The Guardian', kind: 'report', themes: ['politics'], url: 'https://www.theguardian.com/politics/rss' },
  { name: 'The Guardian（経済）', outlet: 'The Guardian', kind: 'report', themes: ['economy'], url: 'https://www.theguardian.com/business/economics/rss' },
  { name: 'The Guardian（社会）', outlet: 'The Guardian', kind: 'report', themes: ['society'], url: 'https://www.theguardian.com/society/rss' },
  { name: 'Meduza', kind: 'report', themes: ['politics', 'conflict'], url: 'https://meduza.io/rss/en/all' },
  { name: 'Spiegel International', kind: 'report', themes: ['politics', 'society'], url: 'https://www.spiegel.de/international/index.rss' },

  // 報道（総合。どのテーマの日も読む）
  { name: 'BBC', kind: 'report', themes: ALL, url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Deutsche Welle', kind: 'report', themes: ALL, url: 'https://rss.dw.com/rdf/rss-en-world' },
  { name: 'Al Jazeera', kind: 'report', themes: ALL, url: 'https://www.aljazeera.com/xml/rss/all.xml' },
];

/** 日本語での扱いの量を測る検索（Google ニュース日本語版。直近 days 日） */
export const jpNewsSearchUrl = (query, days = 7) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&hl=ja&gl=JP&ceid=JP:ja`;
