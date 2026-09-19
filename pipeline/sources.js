/**
 * ニュースの取得元。追加・削除はこの一覧を編集する。
 * type: 'rss'（RSS/Atom/RDF）または 'hackernews'（HN API）
 * region: 画面の「海外／国内」の絞り込みに使う
 * fetchBody: false … 記事ページから本文を取れない媒体（同意画面などで別の文章が混ざる）。RSS の概要だけで要約する
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
  { id: 'cnbc', name: 'CNBC', type: 'rss', region: 'overseas', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'cnbc-finance', name: 'CNBC Finance', type: 'rss', region: 'overseas', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { id: 'bbc-business', name: 'BBC Business', type: 'rss', region: 'overseas', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'guardian-business', name: 'The Guardian Business', type: 'rss', region: 'overseas', url: 'https://www.theguardian.com/business/rss' },

  // 国内
  { id: 'itmedia', name: 'ITmedia NEWS', type: 'rss', region: 'domestic', url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml' },
  { id: 'itmedia-ai', name: 'ITmedia AI+', type: 'rss', region: 'domestic', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml' },
  { id: 'publickey', name: 'Publickey', type: 'rss', region: 'domestic', url: 'https://www.publickey1.jp/atom.xml' },
  { id: 'impress', name: 'Impress Watch', type: 'rss', region: 'domestic', url: 'https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf' },
  { id: 'gigazine', name: 'GIGAZINE', type: 'rss', region: 'domestic', url: 'https://gigazine.net/news/rss_2.0/' },
  { id: 'nhk-economy', name: 'NHK 経済', type: 'rss', region: 'domestic', fetchBody: false, url: 'https://news.web.nhk/n-data/conf/na/rss/cat5.xml' },
  { id: 'itmedia-business', name: 'ITmedia ビジネスオンライン', type: 'rss', region: 'domestic', url: 'https://rss.itmedia.co.jp/rss/2.0/business.xml' },
  { id: 'bi-japan', name: 'Business Insider Japan', type: 'rss', region: 'domestic', url: 'https://www.businessinsider.jp/feed/index.xml' },
  { id: 'toyokeizai', name: '東洋経済オンライン', type: 'rss', region: 'domestic', url: 'https://toyokeizai.net/list/feed/rss' },
  { id: 'diamond', name: 'ダイヤモンド・オンライン', type: 'rss', region: 'domestic', url: 'https://diamond.jp/list/feed/rss/dol' },
];
