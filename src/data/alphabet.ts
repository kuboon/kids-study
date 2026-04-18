import type { Deck } from './hiragana';

function letters(start: string, end: string): string[] {
  const out: string[] = [];
  for (let c = start.charCodeAt(0); c <= end.charCodeAt(0); c++) out.push(String.fromCharCode(c));
  return out;
}

const UPPER = letters('A', 'Z');
const LOWER = letters('a', 'z');

function makeDeck(id: string, label: string, emoji: string, chars: string[]): Deck {
  return {
    id,
    label,
    emoji,
    items: chars.map((c) => ({ char: c, reading: c.toLowerCase() })),
  };
}

export const alphabetDecks: Deck[] = [
  makeDeck('alpha-upper-1', 'A–M（おおきい）', '🐶', UPPER.slice(0, 13)),
  makeDeck('alpha-upper-2', 'N–Z（おおきい）', '🐱', UPPER.slice(13)),
  makeDeck('alpha-lower-1', 'a–m（ちいさい）', '🌸', LOWER.slice(0, 13)),
  makeDeck('alpha-lower-2', 'n–z（ちいさい）', '🌼', LOWER.slice(13)),
];
