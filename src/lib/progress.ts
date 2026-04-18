import type { Account, DeckId, DeckProgress } from './storage';
import { todayISO } from './storage';

export function getDeckProgress(account: Account, deckId: DeckId): DeckProgress {
  return (
    account.progress[deckId] ?? {
      level: 1,
      dailyCount: 0,
      lastPlayedDate: '',
      totalPlays: 0,
    }
  );
}

const PLAYS_PER_LEVEL_UP = 5;
const MAX_LEVEL = 4;

export function recordPlay(account: Account, deckId: DeckId): { leveledUp: boolean } {
  const today = todayISO();
  const current = getDeckProgress(account, deckId);
  const isNewDay = current.lastPlayedDate !== today;

  const next: DeckProgress = {
    level: current.level,
    dailyCount: isNewDay ? 1 : current.dailyCount + 1,
    lastPlayedDate: today,
    totalPlays: current.totalPlays + 1,
  };

  let leveledUp = false;
  if (next.totalPlays >= current.level * PLAYS_PER_LEVEL_UP && current.level < MAX_LEVEL) {
    next.level = (current.level + 1) as DeckProgress['level'];
    leveledUp = true;
  }

  account.progress[deckId] = next;
  updateStreak(account, today);
  return { leveledUp };
}

function updateStreak(account: Account, today: string): void {
  const last = account.streak.lastDate;
  if (last === today) return;
  if (!last) {
    account.streak = { count: 1, lastDate: today };
    return;
  }
  const prevDate = new Date(last);
  const todayDate = new Date(today);
  const diffDays = Math.round((todayDate.getTime() - prevDate.getTime()) / 86_400_000);
  if (diffDays === 1) {
    account.streak = { count: account.streak.count + 1, lastDate: today };
  } else {
    account.streak = { count: 1, lastDate: today };
  }
}

export function isPlayedToday(account: Account, deckId: DeckId): boolean {
  const p = account.progress[deckId];
  return !!p && p.lastPlayedDate === todayISO();
}
