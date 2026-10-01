/**
 * 注目度の測定に使う取得元（試作）。
 * 並び順を重要度の目安にするため、「トップ記事」「世界ニュース」の見出しフィードを選ぶ。
 * kind: 'rank'  … 編集部が重要度順に並べているとみなす（上位ほど重い）
 *       'time'  … 新着順。重み付けを弱める（取り上げたかどうかだけを主に見る）
 * region: 'world'（海外）| 'jp'（国内）
 */
export const FEEDS = [
  // 海外（直接フィード）
  { id: 'bbc', name: 'BBC', region: 'world', kind: 'rank', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'guardian', name: 'The Guardian', region: 'world', kind: 'rank', url: 'https://www.theguardian.com/world/rss' },
  { id: 'aljazeera', name: 'Al Jazeera', region: 'world', kind: 'time', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'nyt', name: 'New York Times', region: 'world', kind: 'rank', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { id: 'dw', name: 'Deutsche Welle', region: 'world', kind: 'time', url: 'https://rss.dw.com/rdf/rss-en-world' },
  { id: 'france24', name: 'France 24', region: 'world', kind: 'time', url: 'https://www.france24.com/en/rss' },
  { id: 'euronews', name: 'Euronews', region: 'world', kind: 'time', url: 'https://www.euronews.com/rss?format=mrss' },
  { id: 'npr', name: 'NPR', region: 'world', kind: 'rank', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'scmp', name: 'South China Morning Post', region: 'world', kind: 'time', url: 'https://www.scmp.com/rss/91/feed' },
  { id: 'sky', name: 'Sky News', region: 'world', kind: 'rank', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { id: 'abc-au', name: 'ABC Australia', region: 'world', kind: 'rank', url: 'https://www.abc.net.au/news/feed/51120/rss.xml' },
  { id: 'cbs', name: 'CBS News', region: 'world', kind: 'time', url: 'https://www.cbsnews.com/latest/rss/world' },
  { id: 'toi', name: 'Times of India', region: 'world', kind: 'time', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
  { id: 'straits', name: 'The Straits Times', region: 'world', kind: 'time', url: 'https://www.straitstimes.com/news/world/rss.xml' },

  // 海外（直接取れない通信社は、Google ニュースの媒体指定検索で見出しだけ拾う）
  { id: 'reuters', name: 'Reuters', region: 'world', kind: 'time', via: 'googlenews', url: gnews('reuters.com') },
  { id: 'ap', name: 'Associated Press', region: 'world', kind: 'time', via: 'googlenews', url: gnews('apnews.com') },
  { id: 'bloomberg', name: 'Bloomberg', region: 'world', kind: 'time', via: 'googlenews', url: gnews('bloomberg.com') },
  { id: 'ft', name: 'Financial Times', region: 'world', kind: 'time', via: 'googlenews', url: gnews('ft.com') },

  // 国内
  { id: 'asahi', name: '朝日新聞', region: 'jp', kind: 'rank', url: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf' },
  { id: 'mainichi', name: '毎日新聞', region: 'jp', kind: 'time', url: 'https://mainichi.jp/rss/etc/mainichi-flash.rss' },
  { id: 'jiji', name: '時事通信', region: 'jp', kind: 'time', url: 'https://www.jiji.com/rss/ranking.rdf' },
  { id: 'yahoo', name: 'Yahoo!ニュース主要', region: 'jp', kind: 'rank', url: 'https://news.yahoo.co.jp/rss/topics/top-picks.xml' },
  { id: 'nikkei', name: '日本経済新聞', region: 'jp', kind: 'time', via: 'googlenews', url: gnews('nikkei.com', 'ja') },
];

function gnews(site, lang = 'en') {
  const q = encodeURIComponent(`site:${site} when:1d`);
  return lang === 'ja'
    ? `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`
    : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}
