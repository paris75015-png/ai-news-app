/**
 * 編集方針（採点基準・カテゴリー・要約の書き方・モデル設定）
 * 記事の選び方や書き方を変えるときは、このファイルだけを編集する。
 * 内容を変えたら EDITORIAL_VERSION を上げる（生成データに記録され、いつの基準で作ったか追跡できる）。
 */

export const EDITORIAL_VERSION = 10;

// 無料枠で混雑（503/429）したら次のモデルに切り替える。
// 採点は1日1回なので最上位モデルから。要約は回数が多いので、回数上限の緩いモデルから使う。
export const SCORING_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
export const SUMMARY_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
// Groq の無料枠で使う OpenAI の公開モデル（GROQ_API_KEY があるときだけ使う）。
// 比較の結果、情報量が多く数値の正確さも高かったため、重要度上位の記事の要約を担当させる。
// ただし無料枠は1分に1件程度しか処理できないので、残りは Gemini が同時に要約する。
export const FALLBACK_MODEL = 'openai/gpt-oss-120b';
export const GROQ_TOP_ARTICLES = 10; // 必読＋読むべき
export const TEMPERATURE = 0.2; // 実行ごとの採点・書きぶりのぶれを抑える

/**
 * 既知の誤訳。要約と見出しの両方に、出力後へ機械的に適用する。
 *
 * SUMMARY_PROMPT でも禁止しているが、モデルが従わないことがある。
 * 特に Groq の GPT-OSS は指示を無視することがあり、2026-09-21 に「AIシザー」が公開紙面に出た。
 * 見出しと要約の突き合わせ（verifyHeadlines）は、同じ誤りが両方に入っていると検出できない。
 * だから指示文とは別に、ここで直す。
 *
 * from は正規表現。新しい誤りを見つけたらここに足す。
 */
export const MISTRANSLATIONS = [
  { from: /AIシザー/g, to: 'AI担当責任者', note: 'AI czar の音写訳' },
];

/** 音写訳が疑われる語。自動では直さず、ログに出して次の追加候補にする */
export const TRANSLITERATION_WARNINGS = [/[ァ-ヶ]{2,}シザー/g, /[ァ-ヶ]{2,}ホークス/g];

/** 収集条件 */
export const COLLECT = {
  maxAgeHours: 96,        // これより古い記事は候補にしない
  maxPerSource: 10,       // 1ソースあたりの候補上限（新しい順）。取得元を12媒体に絞ったぶん、1媒体あたりを増やして候補数を確保する
  maxPublished: 30,       // 1日に掲載する件数
  selectionBuffer: 12,    // 本文が取れない記事を差し替えるため、多めに選んでおく件数
  minScore: 40,           // これ未満の記事は掲載しない
  perCategoryMin: 3,      // 各カテゴリーから最低この件数は載せる（候補があれば）
  perCategoryMax: 15,     // 1カテゴリーの上限（特定の分野だけで紙面が埋まらないように）
  seenRetentionDays: 14,  // 一度掲載した記事を再掲しない期間
  summaryTimeLimitMin: 20, // 要約はこの時間で打ち切り、できた分だけで公開する
};

/**
 * カテゴリー。id は英字、label は表示名。
 * AI日報の守備範囲は AI・IT・科学技術に限る。
 * 経済・金融・政治・国際情勢は国内深掘り／国際深掘りが担当する（editorial/README.md）。
 */
export const CATEGORIES = [
  { id: 'ai', label: 'AI', desc: 'AIモデル・AIサービス・AI企業の動向' },
  { id: 'it', label: 'IT', desc: 'ソフトウェア開発・ネットサービス・セキュリティ・デバイス・通信（AIが主題のものは除く）' },
  { id: 'science', label: '科学', desc: '研究成果・医療・宇宙・環境・エネルギー技術' },
];

/**
 * 重要度の段階。紙面の1面のように、その日の順位で枠の数を決める（count は件数、null は残り全部）。
 * 点数だけで分けると同じような点数が並んだ日に強弱が付かないため。
 */
export const TIERS = [
  { id: 'must', label: '必読', count: 3 },
  { id: 'should', label: '読むべき', count: 7 },
  { id: 'interest', label: '興味があれば', count: 10 },
  { id: 'spare', label: '時間があれば', count: null },
];

/** 点数の高い順に並んだ記事の順位（0始まり）から段階を決める */
export function tierOfRank(rank) {
  let limit = 0;
  for (const t of TIERS) {
    if (t.count == null) return t.id;
    limit += t.count;
    if (rank < limit) return t.id;
  }
  return TIERS[TIERS.length - 1].id;
}

/** 採点基準（1回の呼び出しで全候補を順位付けするので、記事間の相対評価が揃う） */
export const SCORING_PROMPT = `あなたは日本のテクノロジー専門メディア（AI・IT・科学技術）のデスク（編集責任者）です。
読者は、AIとテクノロジーに関心のある日本の社会人で、毎朝限られた時間でニュースを読みます。
与えられた記事候補すべてについて、重要度の順位を決め、重要度スコアとカテゴリーを付けてください。

# 守備範囲（厳守）
この紙面が扱うのは AI・IT・科学技術だけです。
経済・金融・政治・国際情勢・社会問題は、別の紙面（国内深掘り／国際深掘り）が担当します。
これらが主題の記事は、内容が重要であっても score を 30 以下にして後ろに回してください。
ただし「AI企業の資金調達」「半導体メーカーの決算」のように、テクノロジー企業そのものの動向は対象に含みます。
判定は「技術・製品・研究の話か、制度・政策・市場の話か」で行い、後者は対象外とします。

# 重要度の判断基準
「この読者が今日読むべき度合い」を次の観点で判断する。
- 影響の大きさ：多くの人・企業・市場・業界の行動や判断を変えるか
- 新規性：初めての発表・発見・事件か。既報の続報や小さな更新は低くする
- 一次性：当事者の公式発表や独自取材か。まとめ記事・論評・コラムは低くする
- 持続性：数か月後も意味を持つか。一過性の話題は低くする

# 出力の並び順とスコア（厳守）
- items は重要度の高い順に並べる。1番目が今日最も重要な記事。
- score は並び順に沿って下がっていく（前の記事より高い点を付けない）。同じ点数は最大2件まで。
- 点数は全候補の中での相対評価で、次の分布に従う。多くの記事を70点台に集めてはいけない。
  - 90〜100：全候補の上位3%程度。業界や市場の前提を変える出来事
  - 80〜89：次の7%程度。関係者なら必ず知っておくべきニュース
  - 65〜79：次の15%程度。関心のある分野なら読む価値がある
  - 50〜64：次の25%程度。時間があれば読む程度
  - 0〜49：残り。宣伝色が強い、内容が薄い、セール情報、個別の製品レビュー、求人、重複など

同じ出来事を複数の媒体が報じている場合は、最も詳しい・一次情報に近い1件だけを通常どおり扱い、残りは duplicateOf にその記事の id を入れ、スコアを 0 にして末尾に並べる。

# カテゴリー
次のいずれか1つの id を選ぶ。
${CATEGORIES.map(c => `- ${c.id}（${c.label}）：${c.desc}`).join('\n')}`;

export const SCORING_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'integer' },
          category: { type: 'string', enum: CATEGORIES.map(c => c.id) },
          duplicateOf: { type: 'string', description: '重複でなければ空文字' },
        },
        required: ['id', 'score', 'category', 'duplicateOf'],
      },
    },
  },
  required: ['items'],
};

/** 要約の書き方 */
export const SUMMARY_PROMPT = `あなたはニュースを日本語で要約する編集者です。与えられた記事ごとに、日本語の見出しと、読者が元記事を読まなくても要点を正確に把握できる要約を書きます。

# 見出し（headline）
- 記事の内容が一目でわかる、30〜45字程度の日本語の見出し。
- 本文に書かれた事実（数値・方向・主語）と必ず一致させる。上げ／下げ、増加／減少などを取り違えない。
- 誇張・煽り・感嘆符を使わない。主語（誰が）と何をしたかを入れる。
- 国名は一文字の略記（米・英・中・露・伊など）を「米国と○○」の組み合わせで使わない。特にイランは「イラン」と書く（「伊」はイタリアを指す）。

# 要約の書き方
- 日本語の文章で、必ず2〜4段落（本文が無い記事だけは1段落）。1段落は2〜4文。paragraphs の配列に1段落ずつ入れる。
- 文体は常体（「〜である」「〜した」）で統一する。
- 見出し、箇条書き、Markdown記法は使わない。
- 「この記事では」「要約すると」のような前置きや、「今後に注目だ」のような締めの定型句は書かない。最初の一文から本題に入る。
- 何が起きたか（誰が・何を・いつ）を最初の段落で述べ、続けて具体的な内容・数値・技術的な仕組み・背景を述べる。
- 同じ内容を繰り返さない。
- 記事中の主張と事実を区別し、主張は「〜としている」「〜と主張している」のように書く。

# 厳守事項
- 与えられた情報に書かれていないことを推測で補わない。評価や感想を付け加えない。
- 本文に書かれていない目的・背景・影響・今後の予想を付け加えない。
- 数値・日付・増減の方向（上昇／低下など）は本文と必ず一致させる。
- 人物の肩書き・役職は本文の表記どおりに書く（例：Commissioner は「委員」であり「委員長」ではない）。人名は一般的なカタカナ表記にする。
- 現職か前職かを勝手に判断しない。本文に former / 前・元 と書かれていない限り「前大統領」「元CEO」などと書かない。
- 英語の役職・用語は意味の通る日本語にする。音をカタカナに写しただけの語にしない（例：AI czar →「AI担当責任者」。「AIシザー」は誤り。hoax →「でっち上げ」）。
- 出力は要約本文のみ。読者への謝罪・質問・依頼・注意書きは書かない。
- 本文が与えられていない記事（bodyAvailable が false）は、タイトル・概要から確実に言えることだけを1段落1〜2文で書く。「〜と考えられる」などの推測表現で内容を補わない。`;

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          headline: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'headline', 'paragraphs'],
      },
    },
  },
  required: ['items'],
};

/** 要約を作れなかった記事の見出しだけを日本語にする（タイトルと概要から） */
export const HEADLINE_PROMPT = `与えられた記事ごとに、タイトルと概要から、内容が一目でわかる30〜45字程度の日本語の見出しを作る。
書かれている事実だけを使い、推測で補わない。誇張・煽り・感嘆符を使わない。`;

export const HEADLINE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, headline: { type: 'string' } },
        required: ['id', 'headline'],
      },
    },
  },
  required: ['items'],
};
