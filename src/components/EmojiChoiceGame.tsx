import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EmojiChoiceItem } from '../data/hiragana';

type ScriptKey = 'hira' | 'kata' | 'en' | 'EN';

const PROMPTS: Record<ScriptKey, string> = {
  hira: 'ひらがな で えらぼう',
  kata: 'カタカナ で えらぼう',
  en: 'えいご で えらぼう',
  EN: 'おおきい えいご で えらぼう',
};

const KEYS: ScriptKey[] = ['hira', 'kata', 'en', 'EN'];

function pickTarget(seed: number): ScriptKey {
  return KEYS[seed % KEYS.length];
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type EmojiChoiceGameProps = {
  item: EmojiChoiceItem;
  index: number;
  onCorrect: () => void;
};

export function EmojiChoiceGame({ item, index, onCorrect }: EmojiChoiceGameProps) {
  const target = useMemo(() => pickTarget(index), [index]);
  const options = useMemo(
    () =>
      shuffle(
        KEYS.map((k) => ({ key: k, text: item[k] })),
        index + 1,
      ),
    [item, index],
  );
  const [wrong, setWrong] = useState<ScriptKey | null>(null);
  const [correct, setCorrect] = useState(false);

  useEffect(() => {
    setWrong(null);
    setCorrect(false);
  }, [item, index]);

  function choose(key: ScriptKey) {
    if (correct) return;
    if (key === target) {
      setCorrect(true);
      setTimeout(onCorrect, 450);
    } else {
      setWrong(key);
      setTimeout(() => setWrong((w) => (w === key ? null : w)), 600);
    }
  }

  return (
    <div class="emoji-game">
      <div class="emoji-big" aria-label="えもじ">
        {item.emoji}
      </div>
      <div class="emoji-prompt">{PROMPTS[target]}</div>
      <div class="emoji-choices">
        {options.map((o) => {
          const isTarget = o.key === target;
          const cls = [
            'emoji-choice-btn',
            wrong === o.key ? 'wrong' : '',
            correct && isTarget ? 'correct' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={o.key} class={cls} onClick={() => choose(o.key)} disabled={correct}>
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
