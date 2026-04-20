import { useMemo, useState } from 'preact/hooks';
import type { Account, Store } from '../lib/storage';
import { saveStore } from '../lib/storage';
import { findDeck } from '../data/decks';
import { getDeckProgress, recordPlay } from '../lib/progress';
import { pickPraise } from '../lib/praise';
import { pickRandomStamp } from '../lib/stamps';
import { WritingCanvas } from '../components/WritingCanvas';
import { EmojiChoiceGame } from '../components/EmojiChoiceGame';
import { navigate } from '../lib/router';

type Props = {
  store: Store;
  account: Account;
  deckId: string;
  onChange: () => void;
};

export function PlayPage({ store, account, deckId, onChange }: Props) {
  const found = useMemo(() => findDeck(deckId), [deckId]);
  const [idx, setIdx] = useState(0);
  const [praise, setPraise] = useState<string | null>(null);
  const [awarded, setAwarded] = useState<string | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  if (!found) {
    return (
      <div class="app-page">
        <div class="topbar">
          <button class="btn ghost" onClick={() => navigate('/')}>
            ← もどる
          </button>
        </div>
        <div class="card">このデッキは見つかりませんでした。</div>
      </div>
    );
  }

  const { category, deck } = found;
  const progress = getDeckProgress(account, deck.id);
  const level = progress.level;
  const isLast = idx === deck.items.length - 1;

  function advance() {
    setHasStroke(false);
    setPraise(pickPraise(account.grade));
    setTimeout(() => setPraise(null), 1200);
    if (isLast) {
      const { leveledUp } = recordPlay(account, deck.id);
      const stamp = pickRandomStamp();
      account.stamps.push({ emoji: stamp, gainedAt: Date.now(), deckId: deck.id });
      saveStore(store);
      onChange();
      setAwarded(leveledUp ? `${stamp}✨ レベルアップ！` : stamp);
    } else {
      setIdx(idx + 1);
    }
  }

  function finish() {
    setAwarded(null);
    navigate(account.grade === 1 ? '/g1' : '/g4');
  }

  return (
    <div class="app-page">
      <div class="topbar">
        <button class="btn ghost" onClick={() => navigate(account.grade === 1 ? '/g1' : '/g4')}>
          ← やめる
        </button>
        <div class="title">
          {category.emoji} {deck.label}
        </div>
        <div class="progress-pill">
          {idx + 1}/{deck.items.length}
        </div>
      </div>

      {deck.kind === 'emoji-choice' ? (
        <EmojiChoiceGame
          key={`${deck.id}-${idx}`}
          item={deck.items[idx]}
          index={idx}
          onCorrect={advance}
        />
      ) : (
        <>
          <div class="play-reading">
            よみかた：<strong>{deck.items[idx].reading}</strong>
          </div>
          <WritingCanvas
            key={`${deck.id}-${idx}`}
            guide={deck.items[idx].char}
            level={level}
            onAnyStroke={() => setHasStroke(true)}
          />
          <div class="play-footer">
            <button class="btn primary big" onClick={advance} disabled={!hasStroke}>
              {isLast ? '🎉 おわり！' : 'できた！ →'}
            </button>
          </div>
        </>
      )}

      {praise && <div class="praise-toast">{praise}</div>}

      {awarded && (
        <div class="stamp-overlay" onClick={finish}>
          <div class="stamp-card">
            <div class="stamp-emoji">{awarded}</div>
            <div class="stamp-text">スタンプゲット！</div>
            <button class="btn primary big" onClick={finish}>
              やったー！
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
