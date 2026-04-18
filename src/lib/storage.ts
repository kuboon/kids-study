export type DeckId = string;

export type DeckProgress = {
  level: 1 | 2 | 3 | 4;
  dailyCount: number;
  lastPlayedDate: string;
  totalPlays: number;
};

export type Stamp = {
  emoji: string;
  gainedAt: number;
  deckId?: DeckId;
};

export type Account = {
  id: string;
  name: string;
  icon: string;
  createdAt: number;
  grade: 1 | 4;
  progress: Record<DeckId, DeckProgress>;
  stamps: Stamp[];
  streak: { count: number; lastDate: string };
};

export type Store = {
  version: 1;
  accounts: Account[];
  activeAccountId: string | null;
};

const KEY = 'kidsStudy:v1';

const empty: Store = { version: 1, accounts: [], activeAccountId: null };

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(empty);
    const parsed = JSON.parse(raw) as Store;
    if (parsed.version !== 1) return structuredClone(empty);
    return parsed;
  } catch {
    return structuredClone(empty);
  }
}

export function saveStore(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getActiveAccount(store: Store): Account | null {
  return store.accounts.find((a) => a.id === store.activeAccountId) ?? null;
}

export function addAccount(store: Store, name: string, icon: string, grade: 1 | 4): Account {
  const account: Account = {
    id: uuid(),
    name,
    icon,
    grade,
    createdAt: Date.now(),
    progress: {},
    stamps: [],
    streak: { count: 0, lastDate: '' },
  };
  store.accounts.push(account);
  store.activeAccountId = account.id;
  saveStore(store);
  return account;
}

export function removeAccount(store: Store, id: string): void {
  store.accounts = store.accounts.filter((a) => a.id !== id);
  if (store.activeAccountId === id) {
    store.activeAccountId = store.accounts[0]?.id ?? null;
  }
  saveStore(store);
}

export function setActiveAccount(store: Store, id: string): void {
  store.activeAccountId = id;
  saveStore(store);
}

export function updateAccount(store: Store, id: string, patch: (a: Account) => void): void {
  const account = store.accounts.find((a) => a.id === id);
  if (!account) return;
  patch(account);
  saveStore(store);
}
