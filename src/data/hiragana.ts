export type CharItem = { char: string; reading: string };

export type EmojiChoiceItem = {
  emoji: string;
  hira: string;
  kata: string;
  en: string;
  EN: string;
};

export type TraceDeck = {
  kind?: 'trace';
  id: string;
  label: string;
  emoji: string;
  items: CharItem[];
};

export type EmojiChoiceScript = 'hira' | 'kata' | 'EN';

export type EmojiChoiceDeck = {
  kind: 'emoji-choice';
  id: string;
  label: string;
  emoji: string;
  script: EmojiChoiceScript;
  items: EmojiChoiceItem[];
};

export type Deck = TraceDeck | EmojiChoiceDeck;

export const hiraganaDecks: TraceDeck[] = [
  {
    id: 'hira-a',
    label: 'あぎょう',
    emoji: '🌸',
    items: [
      { char: 'あ', reading: 'a' },
      { char: 'い', reading: 'i' },
      { char: 'う', reading: 'u' },
      { char: 'え', reading: 'e' },
      { char: 'お', reading: 'o' },
    ],
  },
  {
    id: 'hira-ka',
    label: 'かぎょう',
    emoji: '🐰',
    items: [
      { char: 'か', reading: 'ka' },
      { char: 'き', reading: 'ki' },
      { char: 'く', reading: 'ku' },
      { char: 'け', reading: 'ke' },
      { char: 'こ', reading: 'ko' },
    ],
  },
  {
    id: 'hira-sa',
    label: 'さぎょう',
    emoji: '🌟',
    items: [
      { char: 'さ', reading: 'sa' },
      { char: 'し', reading: 'shi' },
      { char: 'す', reading: 'su' },
      { char: 'せ', reading: 'se' },
      { char: 'そ', reading: 'so' },
    ],
  },
  {
    id: 'hira-ta',
    label: 'たぎょう',
    emoji: '🍓',
    items: [
      { char: 'た', reading: 'ta' },
      { char: 'ち', reading: 'chi' },
      { char: 'つ', reading: 'tsu' },
      { char: 'て', reading: 'te' },
      { char: 'と', reading: 'to' },
    ],
  },
  {
    id: 'hira-na',
    label: 'なぎょう',
    emoji: '🦋',
    items: [
      { char: 'な', reading: 'na' },
      { char: 'に', reading: 'ni' },
      { char: 'ぬ', reading: 'nu' },
      { char: 'ね', reading: 'ne' },
      { char: 'の', reading: 'no' },
    ],
  },
  {
    id: 'hira-ha',
    label: 'はぎょう',
    emoji: '🎀',
    items: [
      { char: 'は', reading: 'ha' },
      { char: 'ひ', reading: 'hi' },
      { char: 'ふ', reading: 'fu' },
      { char: 'へ', reading: 'he' },
      { char: 'ほ', reading: 'ho' },
    ],
  },
  {
    id: 'hira-ma',
    label: 'まぎょう',
    emoji: '🌷',
    items: [
      { char: 'ま', reading: 'ma' },
      { char: 'み', reading: 'mi' },
      { char: 'む', reading: 'mu' },
      { char: 'め', reading: 'me' },
      { char: 'も', reading: 'mo' },
    ],
  },
  {
    id: 'hira-ya',
    label: 'やぎょう',
    emoji: '🍰',
    items: [
      { char: 'や', reading: 'ya' },
      { char: 'ゆ', reading: 'yu' },
      { char: 'よ', reading: 'yo' },
    ],
  },
  {
    id: 'hira-ra',
    label: 'らぎょう',
    emoji: '🌈',
    items: [
      { char: 'ら', reading: 'ra' },
      { char: 'り', reading: 'ri' },
      { char: 'る', reading: 'ru' },
      { char: 'れ', reading: 're' },
      { char: 'ろ', reading: 'ro' },
    ],
  },
  {
    id: 'hira-wa',
    label: 'わぎょう',
    emoji: '💐',
    items: [
      { char: 'わ', reading: 'wa' },
      { char: 'を', reading: 'wo' },
      { char: 'ん', reading: 'n' },
    ],
  },
];
