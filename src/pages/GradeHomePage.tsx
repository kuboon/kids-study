import type { Account } from '../lib/storage';
import { CATEGORIES } from '../data/decks';
import { getDeckProgress, isPlayedToday } from '../lib/progress';
import { navigate } from '../lib/router';

type Props = {
  account: Account;
  grade: 1 | 4;
};

export function GradeHomePage({ account, grade }: Props) {
  const cats = CATEGORIES.filter((c) => c.grade === grade);

  return (
    <div class="app-page">
      <div class="topbar">
        <button class="btn ghost" onClick={() => navigate('/')}>
          ← おうち
        </button>
        <div class="title">
          {account.icon} {account.name}
        </div>
        <button class="btn ghost" onClick={() => navigate('/stamps')}>
          ⭐ スタンプ
        </button>
      </div>

      {account.streak.count > 0 && (
        <div class="streak-banner">
          🔥 れんぞく {account.streak.count} 日！すごいね！
        </div>
      )}

      {cats.map((cat) => (
        <div key={cat.id} class="category-section">
          <h2 class="category-title">
            {cat.emoji} {cat.label}
          </h2>
          <div class="deck-grid">
            {cat.decks.map((d) => {
              const p = getDeckProgress(account, d.id);
              const doneToday = isPlayedToday(account, d.id);
              return (
                <button
                  key={d.id}
                  class={`deck-card ${doneToday ? 'done' : ''}`}
                  onClick={() => navigate(`/play/${d.id}`)}
                >
                  <div class="deck-emoji">{d.emoji}</div>
                  <div class="deck-label">{d.label}</div>
                  <div class="deck-level">
                    {'⭐'.repeat(p.level)}
                    {'☆'.repeat(4 - p.level)}
                  </div>
                  {doneToday && <div class="deck-done">✅ きょう</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
