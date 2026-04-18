import type { Store } from '../lib/storage';
import { navigate } from '../lib/router';
import { setActiveAccount } from '../lib/storage';

export function HomePage({ store, onChange }: { store: Store; onChange: () => void }) {
  if (store.accounts.length === 0) {
    return (
      <div class="app-page home-page">
        <div class="hero">
          <div class="hero-title">🌸 もじれんしゅう 🌸</div>
          <div class="hero-sub">まずは じぶんの なまえを とうろくしよう！</div>
        </div>
        <button class="btn primary big" onClick={() => navigate('/account/new')}>
          ➕ はじめる
        </button>
      </div>
    );
  }

  return (
    <div class="app-page home-page">
      <div class="hero">
        <div class="hero-title">🌸 だれが あそぶ？ 🌸</div>
      </div>
      <div class="account-list">
        {store.accounts.map((a) => (
          <button
            key={a.id}
            class="account-card"
            onClick={() => {
              setActiveAccount(store, a.id);
              onChange();
              navigate(a.grade === 1 ? '/g1' : '/g4');
            }}
          >
            <div class="account-icon">{a.icon}</div>
            <div class="account-name">{a.name}</div>
            <div class="account-grade">{a.grade === 1 ? '1ねんせい' : '4年生'}</div>
            <div class="account-streak">🔥 {a.streak.count}日</div>
            <div class="account-stamps">⭐ {a.stamps.length}こ</div>
          </button>
        ))}
        <button class="account-card add" onClick={() => navigate('/account/new')}>
          <div class="account-icon">➕</div>
          <div class="account-name">あたらしく</div>
        </button>
      </div>
    </div>
  );
}
