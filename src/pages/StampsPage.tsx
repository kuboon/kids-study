import type { Account } from '../lib/storage';
import { navigate } from '../lib/router';

export function StampsPage({ account }: { account: Account }) {
  const stamps = [...account.stamps].sort((a, b) => b.gainedAt - a.gainedAt);

  return (
    <div class="app-page">
      <div class="topbar">
        <button
          class="btn ghost"
          onClick={() => navigate(account.grade === 1 ? '/g1' : '/g4')}
        >
          ← もどる
        </button>
        <div class="title">⭐ {account.name} の スタンプ帳</div>
        <div style="width:72px" />
      </div>

      <div class="card stamp-summary">
        <div>
          あつめたスタンプ：<strong>{stamps.length}</strong>こ
        </div>
        <div>
          🔥 れんぞく：<strong>{account.streak.count}</strong>日
        </div>
      </div>

      {stamps.length === 0 ? (
        <div class="card empty">
          まだ スタンプは ありません。<br />
          もじを かいて ゲットしよう！
        </div>
      ) : (
        <div class="stamp-grid">
          {stamps.map((s, i) => (
            <div key={i} class="stamp-cell" title={new Date(s.gainedAt).toLocaleDateString()}>
              {s.emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
