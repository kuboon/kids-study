/**
 * Example words for the kanji-writing game — INDEPENDENT of the 4-choice
 * `quiz/kanji/*` data. Each word shows a kanji's reading in brackets so the
 * player recalls which kanji to write, e.g. `[およ]ぐ` (泳ぐ) or `お[か]いもの`
 * (お買い物). Words are hand-picked so each prompt points to exactly one kanji
 * — no 同音異字 (homophone) ambiguity: where a bare reading would be ambiguous
 * (はやい 早/速, あける 開/明, なおる 治/直 …) a compound or clearer word is used.
 *
 * `display(w)` renders `${pre}[${read}]${post}`. The kanji written is `kanji`.
 */

export type WriteWord = {
  /** The single kanji the player writes. */
  kanji: string;
  /** Kana before the bracketed reading (optional). */
  pre?: string;
  /** The kanji's reading, shown bracketed. */
  read: string;
  /** Kana after the bracketed reading (optional). */
  post?: string;
};

export const displayWord = (w: WriteWord): string =>
  `${w.pre ?? ""}[${w.read}]${w.post ?? ""}`;

const grade1: WriteWord[] = [
  { kanji: "大", read: "おお", post: "きい" },
  { kanji: "小", read: "ちい", post: "さい" },
  { kanji: "上", read: "うえ" },
  { kanji: "下", read: "した" },
  { kanji: "出", read: "で", post: "ぐち" }, // 出口
  { kanji: "入", read: "はい", post: "る" },
  { kanji: "立", read: "た", post: "つ" },
  { kanji: "見", read: "み", post: "る" },
  { kanji: "休", read: "やす", post: "む" },
  { kanji: "早", read: "はや", post: "おき" }, // 早起き（速いと区別）
  { kanji: "正", read: "ただ", post: "しい" },
  { kanji: "生", read: "い", post: "きる" },
  { kanji: "学", read: "まな", post: "ぶ" },
  { kanji: "青", read: "あお", post: "い" },
  { kanji: "赤", read: "あか", post: "い" },
  { kanji: "白", read: "しろ", post: "い" },
];

const grade2: WriteWord[] = [
  { kanji: "歌", read: "うた" },
  { kanji: "回", read: "まわ", post: "る" },
  { kanji: "会", read: "かい", post: "しゃ" }, // 会社
  { kanji: "楽", read: "たの", post: "しい" },
  { kanji: "強", read: "つよ", post: "い" },
  { kanji: "教", read: "おし", post: "える" },
  { kanji: "近", read: "ちか", post: "い" },
  { kanji: "古", read: "ふる", post: "い" },
  { kanji: "広", read: "ひろ", post: "い" },
  { kanji: "光", read: "ひか", post: "る" },
  { kanji: "考", read: "かんが", post: "える" },
  { kanji: "高", read: "たか", post: "い" },
  { kanji: "黒", read: "くろ", post: "い" },
  { kanji: "細", read: "ほそ", post: "い" },
  { kanji: "作", read: "つく", post: "る" },
  { kanji: "思", read: "おも", post: "う" },
  { kanji: "弱", read: "よわ", post: "い" },
  { kanji: "書", read: "か", post: "きとり" }, // 書き取り
  { kanji: "食", read: "た", post: "べる" },
  { kanji: "新", read: "あたら", post: "しい" },
  { kanji: "走", read: "はし", post: "る" },
  { kanji: "長", read: "なが", post: "い" },
  { kanji: "読", read: "よ", post: "む" },
  { kanji: "買", pre: "お", read: "か", post: "いもの" }, // お買い物
  { kanji: "売", read: "う", post: "る" },
  { kanji: "話", read: "はなし" },
  { kanji: "歩", read: "ある", post: "く" },
  { kanji: "明", read: "あか", post: "るい" },
  { kanji: "帰", read: "かえ", post: "りみち" }, // 帰り道（返/変と区別）
];

const grade3: WriteWord[] = [
  { kanji: "悪", read: "わる", post: "い" },
  { kanji: "暗", read: "くら", post: "い" },
  { kanji: "育", read: "そだ", post: "てる" },
  { kanji: "飲", read: "の", post: "む" },
  { kanji: "泳", read: "およ", post: "ぐ" },
  { kanji: "寒", read: "さむ", post: "い" },
  { kanji: "急", read: "いそ", post: "ぐ" },
  { kanji: "苦", read: "くる", post: "しい" },
  { kanji: "軽", read: "かる", post: "い" },
  { kanji: "決", read: "き", post: "める" },
  { kanji: "幸", read: "しあわ", post: "せ" },
  { kanji: "死", read: "し", post: "ぬ" },
  { kanji: "使", read: "つか", post: "う" },
  { kanji: "始", read: "はじ", post: "める" },
  { kanji: "持", read: "も", post: "つ" },
  { kanji: "守", read: "まも", post: "る" },
  { kanji: "拾", read: "ひろ", post: "う" },
  { kanji: "終", read: "お", post: "わる" },
  { kanji: "習", read: "なら", post: "う" },
  { kanji: "集", read: "あつ", post: "める" },
  { kanji: "重", read: "おも", post: "い" },
  { kanji: "助", read: "たす", post: "ける" },
  { kanji: "勝", read: "か", post: "つ" },
  { kanji: "乗", read: "の", post: "る" },
  { kanji: "深", read: "ふか", post: "い" },
  { kanji: "進", read: "すす", post: "む" },
  { kanji: "待", read: "ま", post: "つ" },
  { kanji: "短", read: "みじか", post: "い" },
  { kanji: "登", read: "のぼ", post: "る" },
  { kanji: "動", read: "うご", post: "く" },
  { kanji: "配", read: "くば", post: "る" },
  { kanji: "悲", read: "かな", post: "しい" },
  { kanji: "美", read: "うつく", post: "しい" },
  { kanji: "遊", read: "あそ", post: "ぶ" },
  { kanji: "落", read: "お", post: "ちる" },
];

const grade4: WriteWord[] = [
  { kanji: "覚", read: "おぼ", post: "える" },
  { kanji: "省", read: "はぶ", post: "く" },
  { kanji: "連", read: "れん", post: "らく" }, // 連絡
  { kanji: "散", read: "ち", post: "る" },
  { kanji: "治", read: "なお", post: "る" },
  { kanji: "折", read: "お", post: "りがみ" }, // 折り紙
  { kanji: "焼", read: "や", post: "く" },
  { kanji: "積", read: "つ", post: "もる" },
  { kanji: "続", read: "つづ", post: "ける" },
  { kanji: "包", read: "つつ", post: "む" },
  { kanji: "浴", read: "あ", post: "びる" },
  { kanji: "結", read: "むす", post: "ぶ" },
  { kanji: "老", read: "お", post: "いる" },
  { kanji: "競", read: "きそ", post: "う" },
];

const grade5: WriteWord[] = [
  { kanji: "営", read: "いとな", post: "む" },
  { kanji: "喜", read: "よろこ", post: "ぶ" },
  { kanji: "許", read: "ゆる", post: "す" },
  { kanji: "経", read: "けい", post: "けん" }, // 経験
  { kanji: "険", read: "けわ", post: "しい" },
  { kanji: "限", read: "かぎ", post: "る" },
  { kanji: "耕", read: "たがや", post: "す" },
  { kanji: "構", read: "かま", post: "える" },
  { kanji: "混", read: "ま", post: "ぜる" },
  { kanji: "増", read: "ふ", post: "える" },
  { kanji: "述", read: "の", post: "べる" },
  { kanji: "招", read: "まね", post: "く" },
  { kanji: "設", read: "せっ", post: "けい" }, // 設計
  { kanji: "貸", read: "か", post: "す" },
  { kanji: "断", read: "ことわ", post: "る" },
  { kanji: "築", read: "きず", post: "く" },
  { kanji: "燃", read: "も", post: "える" },
  { kanji: "破", read: "やぶ", post: "る" },
  { kanji: "貧", read: "まず", post: "しい" },
  { kanji: "編", read: "あ", post: "む" },
  { kanji: "保", read: "たも", post: "つ" },
  { kanji: "豊", read: "ゆた", post: "か" },
  { kanji: "迷", read: "まよ", post: "う" },
  { kanji: "預", read: "あず", post: "ける" },
];

const grade6: WriteWord[] = [
  { kanji: "映", read: "えい", post: "が" }, // 映画
  { kanji: "延", read: "えん", post: "き" }, // 延期
  { kanji: "割", read: "わ", post: "る" },
  { kanji: "干", read: "ほ", post: "す" },
  { kanji: "危", read: "あぶ", post: "ない" },
  { kanji: "疑", read: "うたが", post: "う" },
  { kanji: "吸", read: "す", post: "う" },
  { kanji: "敬", read: "うやま", post: "う" },
  { kanji: "激", read: "はげ", post: "しい" },
  { kanji: "厳", read: "きび", post: "しい" },
  { kanji: "呼", read: "よ", post: "ぶ" },
  { kanji: "誤", read: "ご", post: "かい" }, // 誤解
  { kanji: "刻", read: "きざ", post: "む" },
  { kanji: "困", read: "こま", post: "る" },
  { kanji: "捨", read: "す", post: "てる" },
  { kanji: "若", read: "わか", post: "い" },
  { kanji: "縮", read: "ちぢ", post: "む" },
  { kanji: "洗", read: "あら", post: "う" },
  { kanji: "探", read: "さが", post: "す" },
  { kanji: "頂", read: "いただ", post: "く" },
  { kanji: "痛", read: "いた", post: "い" },
  { kanji: "届", read: "とど", post: "く" },
  { kanji: "難", read: "むずか", post: "しい" },
  { kanji: "認", read: "みと", post: "める" },
  { kanji: "拝", read: "おが", post: "む" },
  { kanji: "並", read: "なら", post: "ぶ" },
  { kanji: "補", read: "おぎな", post: "う" },
  { kanji: "忘", read: "わす", post: "れる" },
  { kanji: "優", read: "やさ", post: "しい" },
  { kanji: "幼", read: "おさな", post: "い" },
  { kanji: "欲", read: "ほ", post: "しい" },
];

export const GRADE_WORDS: readonly (readonly WriteWord[])[] = [
  grade1,
  grade2,
  grade3,
  grade4,
  grade5,
  grade6,
];
