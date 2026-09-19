/**
 * 編集方針（採点基準・カテゴリー・要約の書き方・モデル設定）
 * 記事の選び方や書き方を変えるときは、このファイルだけを編集する。
 * 内容を変えたら EDITORIAL_VERSION を上げる（生成データに記録され、いつの基準で作ったか追跡できる）。
 */

export const EDITORIAL_VERSION = 1;

export const MODEL = 'gemini-3.8-flash';
export const TEMPERATURE = 0.2; // 実行ごとの採点・書きぶりのぶれを抑える

/** 収集条件 */
export const COLLECT = {
  maxAgeHours: 96,        // これより古い記事は候補にしない
  maxPerSource: 15,       // 1ソースあたりの候補上限（新しい順）
  maxPublished: 30,       // 1日に掲載する最大件数
  minScore: 40,           // これ未満の記事は掲載しない
  seenRetentionDays: 14,  // 一度掲載した記事を再掲しない期間
};

/** カテゴリー（アプリ上部のタブ）。id は英字、label は表示名 */
export const CATEGORIES = [
  { id: 'ai', label: 'AI' },
  { id: 'dev', label: '開発・エンジニアリング' },
  { id: 'business', label: 'ビジネス・業界' },
  { id: 'security', label: 'セキュリティ' },
  { id: 'device', label: 'ハード・デバイス' },
  { id: 'science', label: '科学・研究' },
  { id: 'policy', label: '社会・規制' },
];

/** 重要度の段階（点数から決まる）。紙面の大きさに対応する */
export const TIERS = [
  { id: 'must', label: '必読', min: 85 },
  { id: 'should', label: '読むべき', min: 70 },
  { id: 'interest', label: '興味があれば', min: 55 },
  { id: 'spare', label: '時間があれば', min: 0 },
];

export function tierOf(score) {
  return TIERS.find(t => score >= t.min).id;
}

/** 採点基準（1回の呼び出しで全候補に適用するので、記事間の相対評価が揃う） */
export const SCORING_PROMPT = `あなたは日本のテック系ニュースメディアのデスク（編集責任者）です。
読者は、テクノロジー全般に関心のある日本の社会人で、毎朝限られた時間でニュースを読みます。
与えられた記事候補の一覧それぞれに、日本語見出し・重要度スコア・カテゴリーを付けてください。

# 重要度スコア（0〜100の整数）
次の観点で「この読者が今日読むべき度合い」を採点する。
- 影響の大きさ：多くの人・企業・業界の行動や判断を変えるか
- 新規性：初めての発表・発見・事件か。既報の続報や小さな更新は低くする
- 一次性：当事者の公式発表や独自取材か。まとめ記事・論評は低くする
- 持続性：数か月後も意味を持つか。一過性の話題は低くする

目安：
- 90〜100：業界の前提を変える出来事（主要企業の画期的発表、大規模な事件・規制など）
- 75〜89：分野の関係者なら必ず知っておくべきニュース
- 55〜74：関心のある分野なら読む価値がある
- 40〜54：時間があれば読む程度
- 0〜39：宣伝色が強い、内容が薄い、セール情報、求人、同じ話題の重複など

同じ出来事を複数の媒体が報じている場合は、最も詳しい・一次情報に近い1件だけを通常どおり採点し、残りは duplicateOf にその記事の id を入れ、スコアを 0 にする。

# 日本語見出し
- 記事の内容が一目でわかる、30〜45字程度の日本語の見出し。
- 元の見出しが日本語でも、内容が伝わりにくければ書き直してよい。
- 誇張・煽り・感嘆符を使わない。主語（誰が）と何をしたかを入れる。

# カテゴリー
次のいずれか1つの id を選ぶ：${CATEGORIES.map(c => `${c.id}（${c.label}）`).join('、')}`;

export const SCORING_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          headline: { type: 'string' },
          score: { type: 'integer' },
          category: { type: 'string', enum: CATEGORIES.map(c => c.id) },
          duplicateOf: { type: 'string', description: '重複でなければ空文字' },
        },
        required: ['id', 'headline', 'score', 'category', 'duplicateOf'],
      },
    },
  },
  required: ['items'],
};

/** 要約の書き方 */
export const SUMMARY_PROMPT = `あなたは技術ニュースを日本語で要約する編集者です。与えられた記事ごとに、読者が元記事を読まなくても要点を正確に把握できる要約を書きます。

# 書き方
- 日本語の文章で、2〜4段落。段落の間は空行（\\n\\n）で区切る。
- 文体は常体（「〜である」「〜した」）で統一する。
- 見出し、箇条書き、Markdown記法は使わない。
- 「この記事では」「要約すると」のような前置きや、「今後に注目だ」のような締めの定型句は書かない。最初の一文から本題に入る。
- 何が起きたか（誰が・何を・いつ）を最初の段落で述べ、続けて具体的な内容・数値・技術的な仕組み・背景を述べる。
- 記事中の主張と事実を区別し、主張は「〜としている」「〜と主張している」のように書く。

# 厳守事項
- 与えられた情報に書かれていないことを推測で補わない。評価や感想を付け加えない。
- 出力は要約本文のみ。読者への謝罪・質問・依頼・注意書きは書かない。
- 本文が与えられていない記事（bodyAvailable が false）は、タイトル・概要から確実に言えることだけを1〜2文で書く。「〜と考えられる」などの推測表現で内容を補わない。`;

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['id', 'summary'],
      },
    },
  },
  required: ['items'],
};
