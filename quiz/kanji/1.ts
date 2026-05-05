import type { QuizGenerator } from "../types.ts";
import { type KanjiEntry, makeKanjiQuiz } from "./common.ts";

const KanjiList = [
  // 大/小
  { q: "大", qPost: "きい", a: "おお", wrongs: ["ちい", "つよ", "なが"] },
  { q: "小", qPost: "さい", a: "ちい", wrongs: ["おお", "うす", "ひく"] },

  // 出: で(出る) / だ(出す)
  { q: "出", qPost: "る", a: "で", wrongs: ["き", "ひ", "の"] },
  { q: "出", qPost: "す", a: "だ", wrongs: ["け", "た", "わ"] },

  // 入: い(入れる)
  { q: "入", qPost: "れる", a: "い", wrongs: ["はい", "き", "つ"] },

  // 上: あ(上がる/上げる) / のぼ(上る)
  { q: "上", qPost: "がる", a: "あ", wrongs: ["の", "き", "ま"] },
  { q: "上", qPost: "げる", a: "あ", wrongs: ["な", "つ", "に"] },
  { q: "上", qPost: "る", a: "のぼ", wrongs: ["あが", "あ", "う"] },

  // 下: さ(下がる/下げる) / くだ(下る) / お(下りる/下ろす)
  { q: "下", qPost: "がる", a: "さ", wrongs: ["お", "ふ", "あ"] },
  { q: "下", qPost: "げる", a: "さ", wrongs: ["お", "つ", "な"] },
  { q: "下", qPost: "る", a: "くだ", wrongs: ["さが", "お", "のぼ"] },
  { q: "下", qPost: "りる", a: "お", wrongs: ["くだ", "ふ", "さ"] },
  { q: "下", qPost: "ろす", a: "お", wrongs: ["さ", "た", "ひ"] },

  // 立つ / 立てる
  { q: "立", qPost: "つ", a: "た", wrongs: ["ま", "う", "か"] },
  { q: "立", qPost: "てる", a: "た", wrongs: ["あ", "そ", "は"] },

  // 見る / 見える / 見せる
  { q: "見", qPost: "る", a: "み", wrongs: ["き", "と", "や"] },
  { q: "見", qPost: "える", a: "み", wrongs: ["こ", "き", "あ"] },
  { q: "見", qPost: "せる", a: "み", wrongs: ["の", "き", "ま"] },

  // 休む
  { q: "休", qPost: "む", a: "やす", wrongs: ["の", "ふ", "つつ"] },

  // 早い / 早める
  { q: "早", qPost: "い", a: "はや", wrongs: ["おそ", "ちか", "あさ"] },
  { q: "早", qPost: "める", a: "はや", wrongs: ["はじ", "もと", "あた"] },

  // 正しい
  { q: "正", qPost: "しい", a: "ただ", wrongs: ["うつく", "やさ", "あたら"] },

  // 生: い(生きる) / う(生まれる) / は(生える)
  { q: "生", qPost: "きる", a: "い", wrongs: ["う", "は", "お"] },
  { q: "生", qPost: "まれる", a: "う", wrongs: ["い", "は", "あ"] },
  { q: "生", qPost: "える", a: "は", wrongs: ["う", "い", "の"] },

  // 学ぶ
  { q: "学", qPost: "ぶ", a: "まな", wrongs: ["むす", "あそ", "よ"] },

  // 青い / 赤い / 白い
  { q: "青", qPost: "い", a: "あお", wrongs: ["あか", "しろ", "くろ"] },
  { q: "赤", qPost: "い", a: "あか", wrongs: ["あお", "しろ", "くろ"] },
  { q: "白", qPost: "い", a: "しろ", wrongs: ["あか", "あお", "くろ"] },
] satisfies KanjiEntry[];

export default [
  { title: "1年生の漢字", fn: makeKanjiQuiz(KanjiList) },
] satisfies QuizGenerator[];
