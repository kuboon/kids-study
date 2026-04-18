const EMOJI_POOL = [
  '🌸', '🌷', '🌹', '🌺', '🌻', '🌼', '💐', '🌿', '🍀', '🌱',
  '⭐', '🌟', '✨', '💫', '🌙', '☀️', '🌈', '🌠', '❄️', '🔥',
  '🐰', '🐱', '🐶', '🐭', '🐻', '🐼', '🦊', '🦄', '🐨', '🐹',
  '🦋', '🐞', '🐝', '🐟', '🐬', '🐢', '🦩', '🦜', '🐣', '🐥',
  '🍓', '🍎', '🍊', '🍋', '🍑', '🍒', '🍇', '🍉', '🍍', '🥝',
  '🍰', '🧁', '🍪', '🍩', '🍭', '🍬', '🍫', '🍡', '🍨', '🍦',
  '🎀', '🎁', '🎈', '🎉', '🎊', '👑', '💎', '💖', '💕', '💝',
  '🌵', '🌾', '🌴', '🌳', '🍄', '🪄', '🪅', '🪆', '🧸', '🎠',
];

export function pickRandomStamp(): string {
  return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
}

export function pickRandomStamps(count: number): string[] {
  return Array.from({ length: count }, () => pickRandomStamp());
}
