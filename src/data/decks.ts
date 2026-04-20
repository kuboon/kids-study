import { hiraganaDecks } from './hiragana';
import { katakanaDecks } from './katakana';
import { alphabetDecks } from './alphabet';
import { kanjiDecks } from './kanji-grade4';
import { englishDecks } from './english-basic';
import { emojiChoiceDecks } from './emoji-words';
import type { Deck } from './hiragana';

export type DeckCategory = {
  id: string;
  label: string;
  emoji: string;
  grade: 1 | 4;
  decks: Deck[];
};

export const CATEGORIES: DeckCategory[] = [
  { id: 'hira', label: 'ひらがな', emoji: '🌸', grade: 1, decks: hiraganaDecks },
  { id: 'kata', label: 'カタカナ', emoji: '🌟', grade: 1, decks: katakanaDecks },
  { id: 'alpha', label: 'アルファベット', emoji: '🦄', grade: 1, decks: alphabetDecks },
  { id: 'emoji', label: 'えらぼうゲーム', emoji: '🎮', grade: 1, decks: emojiChoiceDecks },
  { id: 'kanji', label: '漢字', emoji: '🈶', grade: 4, decks: kanjiDecks },
  { id: 'en', label: '英単語', emoji: '🌈', grade: 4, decks: englishDecks },
];

export function findDeck(deckId: string): { category: DeckCategory; deck: Deck } | null {
  for (const c of CATEGORIES) {
    const d = c.decks.find((x) => x.id === deckId);
    if (d) return { category: c, deck: d };
  }
  return null;
}
