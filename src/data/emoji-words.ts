import type { EmojiChoiceDeck, EmojiChoiceItem, EmojiChoiceScript } from './hiragana';

const animals: EmojiChoiceItem[] = [
  { emoji: '🐈', hira: 'ねこ', kata: 'ネコ', en: 'cat', EN: 'CAT' },
  { emoji: '🐕', hira: 'いぬ', kata: 'イヌ', en: 'dog', EN: 'DOG' },
  { emoji: '🐇', hira: 'うさぎ', kata: 'ウサギ', en: 'rabbit', EN: 'RABBIT' },
  { emoji: '🐻', hira: 'くま', kata: 'クマ', en: 'bear', EN: 'BEAR' },
  { emoji: '🐷', hira: 'ぶた', kata: 'ブタ', en: 'pig', EN: 'PIG' },
  { emoji: '🐴', hira: 'うま', kata: 'ウマ', en: 'horse', EN: 'HORSE' },
  { emoji: '🐮', hira: 'うし', kata: 'ウシ', en: 'cow', EN: 'COW' },
  { emoji: '🐟', hira: 'さかな', kata: 'サカナ', en: 'fish', EN: 'FISH' },
  { emoji: '🐦', hira: 'とり', kata: 'トリ', en: 'bird', EN: 'BIRD' },
  { emoji: '🦁', hira: 'らいおん', kata: 'ライオン', en: 'lion', EN: 'LION' },
];

const food: EmojiChoiceItem[] = [
  { emoji: '🍎', hira: 'りんご', kata: 'リンゴ', en: 'apple', EN: 'APPLE' },
  { emoji: '🍌', hira: 'ばなな', kata: 'バナナ', en: 'banana', EN: 'BANANA' },
  { emoji: '🍇', hira: 'ぶどう', kata: 'ブドウ', en: 'grape', EN: 'GRAPE' },
  { emoji: '🍓', hira: 'いちご', kata: 'イチゴ', en: 'strawberry', EN: 'STRAWBERRY' },
  { emoji: '🍰', hira: 'けーき', kata: 'ケーキ', en: 'cake', EN: 'CAKE' },
  { emoji: '🍞', hira: 'ぱん', kata: 'パン', en: 'bread', EN: 'BREAD' },
  { emoji: '🥛', hira: 'みるく', kata: 'ミルク', en: 'milk', EN: 'MILK' },
  { emoji: '🍙', hira: 'おにぎり', kata: 'オニギリ', en: 'rice ball', EN: 'RICE BALL' },
];

const nature: EmojiChoiceItem[] = [
  { emoji: '☀️', hira: 'たいよう', kata: 'タイヨウ', en: 'sun', EN: 'SUN' },
  { emoji: '🌙', hira: 'つき', kata: 'ツキ', en: 'moon', EN: 'MOON' },
  { emoji: '⭐', hira: 'ほし', kata: 'ホシ', en: 'star', EN: 'STAR' },
  { emoji: '🌸', hira: 'はな', kata: 'ハナ', en: 'flower', EN: 'FLOWER' },
  { emoji: '🌳', hira: 'き', kata: 'キ', en: 'tree', EN: 'TREE' },
  { emoji: '☔', hira: 'あめ', kata: 'アメ', en: 'rain', EN: 'RAIN' },
  { emoji: '⛄', hira: 'ゆき', kata: 'ユキ', en: 'snow', EN: 'SNOW' },
  { emoji: '🌈', hira: 'にじ', kata: 'ニジ', en: 'rainbow', EN: 'RAINBOW' },
];

const allItems: EmojiChoiceItem[] = [...animals, ...food, ...nature];

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
  items: allItems,
}));
