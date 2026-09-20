/**
 * ニュースの取得元。追加・削除はこの一覧を編集する。
 * type: 'rss'（RSS/Atom/RDF）または 'hackernews'（HN API）
 * region: 画面の「海外／国内」の絞り込みに使う
 *
 * 採用の条件：記事ページから本文を最後まで取得できること（本文が取れない媒体は要約の質が落ちるため採用しない）。
 * 不採用にした媒体：NHK（同意画面で本文が取れない）、東洋経済（本文が取れない）、ダイヤモンド（続きが会員限定）、
 *                   朝日新聞（有料部分で切れる）、時事通信（本文が取れない）
 *
 * AI日報の守備範囲は AI・IT・科学技術に限る（editorial/README.md の役割分担）。
 * 2026-09-20 に経済・ビジネス系の7媒体を外した。これらが扱う領域は国内深掘り／国際深掘りが担当する。
 *   外した媒体：CNBC、CNBC Finance、BBC Business、The Guardian Business、
 *               ITmedia ビジネスオンライン、Yahoo!ニュース 経済、Business Insider Japan
 */

export const SOURCES = [
  // 海外
  { id: 'hn', name: 'Hacker News', type: 'hackernews', region: 'overseas' },
  { id: 'techcrunch', name: 'TechCrunch', type: 'rss', region: 'overseas', url: 'https://techcrunch.com/feed/' },
  { id: 'verge', name: 'The Verge', type: 'rss', region: 'overseas', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'ars', name: 'Ars Technica', type: 'rss', region: 'overseas', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'mittr', name: 'MIT Technology Review', type: 'rss', region: 'overseas', url: 'https://www.technologyreview.com/feed/' },
  { id: 'openai', name: 'OpenAI', type: 'rss', region: 'overseas', url: 'https://openai.com/news/rss.xml' },
  { id: 'googleai', name: 'Google AI Blog', type: 'rss', region: 'overseas', url: 'https://blog.google/technology/ai/rss/' },

  // 国内
  { id: 'itmedia', name: 'ITmedia NEWS', type: 'rss', region: 'domestic', url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml' },
  { id: 'itmedia-ai', name: 'ITmedia AI+', type: 'rss', region: 'domestic', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml' },
  { id: 'publickey', name: 'Publickey', type: 'rss', region: 'domestic', url: 'https://www.publickey1.jp/atom.xml' },
  { id: 'impress', name: 'Impress Watch', type: 'rss', region: 'domestic', url: 'https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf' },
  { id: 'gigazine', name: 'GIGAZINE', type: 'rss', region: 'domestic', url: 'https://gigazine.net/news/rss_2.0/' },
];
