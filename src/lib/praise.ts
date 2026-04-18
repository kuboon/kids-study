const PRAISES_GRADE1 = [
  'すごい！',
  'じょうず！',
  'はなまる！',
  'てんさい！',
  'きれい！',
  'かんぺき！',
  'やったね！',
  'すばらしい！',
  'ばっちり！',
  'かっこいい！',
  'だいすき！',
  'にじいろ！',
];

const PRAISES_GRADE4 = [
  'よくできました！',
  'すばらしい！',
  'かんぺき！',
  'はなまる！',
  'ナイス！',
  'グレート！',
  'エクセレント！',
  'もう一問いけるね！',
  'その調子！',
];

export function pickPraise(grade: 1 | 4): string {
  const pool = grade === 1 ? PRAISES_GRADE1 : PRAISES_GRADE4;
  return pool[Math.floor(Math.random() * pool.length)];
}
