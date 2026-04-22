import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EmojiChoiceItem, EmojiChoiceScript } from '../data/hiragana';

const PROMPTS: Record<EmojiChoiceScript, string> = {
  hira: 'ひらがな で えらぼう',
  kata: 'カタカナ で えらぼう',
  EN: 'アルファベット で えらぼう',
};

function seededShuffle<T>(arr: T[], seed: number): T[] {
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
  items: EmojiChoiceItem[];
  pool: EmojiChoiceItem[];
  index: number;
  script: EmojiChoiceScript;
  onCorrect: () => void;
};

export function EmojiChoiceGame({ items, pool, index, script, onCorrect }: EmojiChoiceGameProps) {
  const item = items[index];
  const options = useMemo(() => {
    const answerText = item[script];
    const others = pool.filter((o) => o !== item);
    const matching =
      script === 'hira' || script === 'kata'
        ? others.filter((o) => [...o[script]].length === [...answerText].length)
        : others;
    const distractorPool = matching.length >= 3 ? matching : others;
    const distractors = seededShuffle(distractorPool, index + 1).slice(0, 3);
    return seededShuffle([item, ...distractors], index * 7 + 3);
  }, [item, pool, index, script]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [correct, setCorrect] = useState(false);

  useEffect(() => {
    setWrong(null);
    setCorrect(false);
  }, [items, index]);

  const answer = item[script];

  function choose(value: string) {
    if (correct) return;
    if (value === answer) {
      setCorrect(true);
      setTimeout(onCorrect, 450);
    } else {
      setWrong(value);
      setTimeout(() => setWrong((w) => (w === value ? null : w)), 600);
    }
  }

  return (
    <div class="emoji-game">
      <div class="emoji-big" aria-label="えもじ">
        {item.emoji}
      </div>
      <div class="emoji-prompt">{PROMPTS[script]}</div>
      <div class="emoji-choices">
        {options.map((o) => {
          const text = o[script];
          const isCorrect = text === answer;
          const cls = [
            'emoji-choice-btn',
            wrong === text ? 'wrong' : '',
            correct && isCorrect ? 'correct' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={text} class={cls} onClick={() => choose(text)} disabled={correct}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
