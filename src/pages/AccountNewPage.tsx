import { useState } from 'preact/hooks';
import type { Store } from '../lib/storage';
import { addAccount } from '../lib/storage';
import { navigate } from '../lib/router';

const ICONS = ['🌸', '🦄', '🐱', '🐶', '🐰', '🦋', '⭐', '🌈', '🍓', '🍰', '🐻', '🐼'];

export function AccountNewPage({ store, onChange }: { store: Store; onChange: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [grade, setGrade] = useState<1 | 4>(1);

  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    addAccount(store, name.trim(), icon, grade);
    onChange();
    navigate(grade === 1 ? '/g1' : '/g4');
  }

  return (
    <div class="app-page">
      <div class="topbar">
        <button class="btn ghost" onClick={() => navigate('/')}>
          ← もどる
        </button>
        <div class="title">あたらしい おなまえ</div>
        <div style="width:88px" />
      </div>

      <div class="card form">
        <label class="form-row">
          <span>なまえ</span>
          <input
            class="text-input"
            value={name}
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            maxLength={12}
            placeholder="さくら"
          />
        </label>

        <div class="form-row">
          <span>アイコン</span>
          <div class="icon-grid">
            {ICONS.map((i) => (
              <button
                key={i}
                class={`icon-choice ${icon === i ? 'selected' : ''}`}
                onClick={() => setIcon(i)}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div class="form-row">
          <span>がくねん</span>
          <div class="grade-choice">
            <button
              class={`btn big ${grade === 1 ? 'primary' : ''}`}
              onClick={() => setGrade(1)}
            >
              1ねんせい
            </button>
            <button
              class={`btn big ${grade === 4 ? 'primary' : ''}`}
              onClick={() => setGrade(4)}
            >
              4年生
            </button>
          </div>
        </div>

        <button class="btn primary big" disabled={!canSave} onClick={save}>
          できた！
        </button>
      </div>
    </div>
  );
}
