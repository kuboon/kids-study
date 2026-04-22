import type { EmojiChoiceDeck, EmojiChoiceItem, EmojiChoiceScript } from './hiragana';

export const emojiWordPool: EmojiChoiceItem[] = [
  { emoji: '🐈', hira: 'ねこ', kata: 'ネコ', en: 'cat', EN: 'CAT' },
  { emoji: '🐕', hira: 'いぬ', kata: 'イヌ', en: 'dog', EN: 'DOG' },
  { emoji: '🐻', hira: 'くま', kata: 'クマ', en: 'bear', EN: 'BEAR' },
  { emoji: '🐷', hira: 'ぶた', kata: 'ブタ', en: 'pig', EN: 'PIG' },
  { emoji: '🐴', hira: 'うま', kata: 'ウマ', en: 'horse', EN: 'HORSE' },
  { emoji: '🐮', hira: 'うし', kata: 'ウシ', en: 'cow', EN: 'COW' },
  { emoji: '🐦', hira: 'とり', kata: 'トリ', en: 'bird', EN: 'BIRD' },
  { emoji: '🐘', hira: 'ぞう', kata: 'ゾウ', en: 'elephant', EN: 'ELEPHANT' },
  { emoji: '🐢', hira: 'かめ', kata: 'カメ', en: 'turtle', EN: 'TURTLE' },
  { emoji: '🦌', hira: 'しか', kata: 'シカ', en: 'deer', EN: 'DEER' },

  { emoji: '🐇', hira: 'うさぎ', kata: 'ウサギ', en: 'rabbit', EN: 'RABBIT' },
  { emoji: '🐟', hira: 'さかな', kata: 'サカナ', en: 'fish', EN: 'FISH' },
  { emoji: '🦒', hira: 'きりん', kata: 'キリン', en: 'giraffe', EN: 'GIRAFFE' },
  { emoji: '🐸', hira: 'かえる', kata: 'カエル', en: 'frog', EN: 'FROG' },
  { emoji: '🐨', hira: 'こあら', kata: 'コアラ', en: 'koala', EN: 'KOALA' },
  { emoji: '🐼', hira: 'ぱんだ', kata: 'パンダ', en: 'panda', EN: 'PANDA' },
  { emoji: '🦊', hira: 'きつね', kata: 'キツネ', en: 'fox', EN: 'FOX' },
  { emoji: '🐬', hira: 'いるか', kata: 'イルカ', en: 'dolphin', EN: 'DOLPHIN' },
  { emoji: '🦁', hira: 'らいおん', kata: 'ライオン', en: 'lion', EN: 'LION' },

  { emoji: '🍎', hira: 'りんご', kata: 'リンゴ', en: 'apple', EN: 'APPLE' },
  { emoji: '🍌', hira: 'ばなな', kata: 'バナナ', en: 'banana', EN: 'BANANA' },
  { emoji: '🍇', hira: 'ぶどう', kata: 'ブドウ', en: 'grape', EN: 'GRAPE' },
  { emoji: '🍓', hira: 'いちご', kata: 'イチゴ', en: 'strawberry', EN: 'STRAWBERRY' },
  { emoji: '🍰', hira: 'けーき', kata: 'ケーキ', en: 'cake', EN: 'CAKE' },
  { emoji: '🥛', hira: 'みるく', kata: 'ミルク', en: 'milk', EN: 'MILK' },
  { emoji: '🍉', hira: 'すいか', kata: 'スイカ', en: 'watermelon', EN: 'WATERMELON' },
  { emoji: '🍊', hira: 'みかん', kata: 'ミカン', en: 'orange', EN: 'ORANGE' },
  { emoji: '🍋', hira: 'れもん', kata: 'レモン', en: 'lemon', EN: 'LEMON' },
  { emoji: '🍅', hira: 'とまと', kata: 'トマト', en: 'tomato', EN: 'TOMATO' },

  { emoji: '🍞', hira: 'ぱん', kata: 'パン', en: 'bread', EN: 'BREAD' },
  { emoji: '🍑', hira: 'もも', kata: 'モモ', en: 'peach', EN: 'PEACH' },
  { emoji: '🍙', hira: 'おにぎり', kata: 'オニギリ', en: 'rice ball', EN: 'RICE BALL' },
  { emoji: '🥕', hira: 'にんじん', kata: 'ニンジン', en: 'carrot', EN: 'CARROT' },

  { emoji: '🌙', hira: 'つき', kata: 'ツキ', en: 'moon', EN: 'MOON' },
  { emoji: '⭐', hira: 'ほし', kata: 'ホシ', en: 'star', EN: 'STAR' },
  { emoji: '🌸', hira: 'はな', kata: 'ハナ', en: 'flower', EN: 'FLOWER' },
  { emoji: '☔', hira: 'あめ', kata: 'アメ', en: 'rain', EN: 'RAIN' },
  { emoji: '⛄', hira: 'ゆき', kata: 'ユキ', en: 'snow', EN: 'SNOW' },
  { emoji: '🌈', hira: 'にじ', kata: 'ニジ', en: 'rainbow', EN: 'RAINBOW' },
  { emoji: '🌊', hira: 'うみ', kata: 'ウミ', en: 'sea', EN: 'SEA' },
  { emoji: '⛰️', hira: 'やま', kata: 'ヤマ', en: 'mountain', EN: 'MOUNTAIN' },
  { emoji: '☁️', hira: 'くも', kata: 'クモ', en: 'cloud', EN: 'CLOUD' },

  { emoji: '☀️', hira: 'たいよう', kata: 'タイヨウ', en: 'sun', EN: 'SUN' },
  { emoji: '⚡', hira: 'かみなり', kata: 'カミナリ', en: 'thunder', EN: 'THUNDER' },
];

const scripts: { id: string; label: string; emoji: string; script: EmojiChoiceScript }[] = [
  { id: 'emoji-hira', label: 'ひらがな', emoji: '🌸', script: 'hira' },
  { id: 'emoji-kata', label: 'カタカナ', emoji: '🌟', script: 'kata' },
  { id: 'emoji-alpha', label: 'アルファベット', emoji: '🦄', script: 'EN' },
];

export const emojiChoiceDecks: EmojiChoiceDeck[] = scripts.map((s) => ({
  kind: 'emoji-choice',
  id: s.id,
  label: s.label,
  emoji: s.emoji,
  script: s.script,
  items: emojiWordPool,
}));
