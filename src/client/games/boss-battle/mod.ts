/**
 * Boss Battle — DOM/CSS quiz battler, no Babylon. Answer to attack the
 * boss; chained correct answers build a combo that multiplies damage and
 * escalates the effects (flash → shake → stars → fever). A wrong answer
 * shatters the combo and costs a heart. Three bosses per run.
 * Subject-agnostic: consumes any QuizGenerator.
 */

import { createSession, type QuizSession } from "../../../../quiz/session.ts";
import type { GameModule, GameMount } from "../types.ts";

type Boss = { name: string; emoji: string; hp: number; rage?: boolean };

const BOSSES: Boss[] = [
  { name: "スライム", emoji: "🟢", hp: 100 },
  { name: "ゴーレム", emoji: "🗿", hp: 140 },
  { name: "ドラゴン", emoji: "🐲", hp: 180, rage: true },
];

const BASE_DAMAGE = 10;
// Every SPECIAL_COMBO-th correct answer charges the special attack; the
// next correct answer unleashes it.
const SPECIAL_COMBO = 5;
const SPECIAL_DAMAGE = BASE_DAMAGE * 5;
const QUESTION_SECONDS = 15;
const RAGE_SECONDS = 10; // dragon below RAGE_HP_RATIO shortens the timer
const RAGE_HP_RATIO = 0.3;
const DANGER_SECONDS = 5; // timer turns red for the last stretch
const MAX_HEARTS = 3;

// tier 0: plain hit / 1: flash / 2: shake + stars + glow / 3: fever
const comboTier = (combo: number): number =>
  combo >= 7 ? 3 : combo >= 5 ? 2 : combo >= 3 ? 1 : 0;

const comboMultiplier = (combo: number): number =>
  [1, 1.5, 2, 3][comboTier(combo)];

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");

const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---- sound: tiny WebAudio blips, no audio files ---------------------------

const createSfx = () => {
  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext => {
    // Lazily created inside a click handler so autoplay policy allows it.
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const tone = (
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      at?: number;
      gain?: number;
      slideTo?: number;
    } = {},
  ) => {
    const c = ensure();
    const t0 = c.currentTime + (opts.at ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.slideTo),
        t0 + dur,
      );
    }
    g.gain.setValueAtTime(opts.gain ?? 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  };
  return {
    hit(combo: number) {
      // Pitch climbs a semitone per combo so a streak is audible.
      const f = 440 * 2 ** (Math.min(combo, 24) / 12);
      tone(f, 0.12);
      if (combo >= 3) tone(f * 1.5, 0.1, { at: 0.08 });
    },
    breakCombo() {
      tone(300, 0.35, { type: "sawtooth", slideTo: 60, gain: 0.06 });
    },
    counter() {
      tone(90, 0.25, { type: "triangle", gain: 0.09 });
    },
    special() {
      tone(200, 0.5, { type: "sawtooth", slideTo: 1200, gain: 0.05 });
      for (const f of [523, 659, 784]) tone(f, 0.4, { at: 0.45, gain: 0.04 });
    },
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { at: i * 0.12 }));
      tone(1046, 0.6, { at: 0.55, gain: 0.05 });
    },
    dispose() {
      ctx?.close();
      ctx = null;
    },
  };
};

// ---- styles ----------------------------------------------------------------

const CSS = `
@keyframes bb-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.bb-idle{animation:bb-idle 1.6s ease-in-out infinite}
@keyframes bb-player-attack{0%{transform:translate(0,0)}45%{transform:translate(140px,-70px) rotate(16deg)}100%{transform:translate(0,0)}}
.bb-player-attack{animation:bb-player-attack .5s ease-in-out}
@keyframes bb-boss-hit{0%{filter:brightness(3)}25%{transform:translateX(-14px)}50%{transform:translateX(10px)}75%{transform:translateX(-6px)}100%{filter:none;transform:translateX(0)}}
.bb-boss-hit{animation:bb-boss-hit .45s ease-out}
@keyframes bb-boss-counter{0%{transform:translate(0,0)}45%{transform:translate(-150px,70px) rotate(-16deg)}100%{transform:translate(0,0)}}
.bb-boss-counter{animation:bb-boss-counter .6s ease-in-out}
@keyframes bb-shake{10%{transform:translate(-8px,4px)}30%{transform:translate(7px,-5px)}50%{transform:translate(-6px,3px)}70%{transform:translate(4px,-2px)}90%{transform:translate(-2px,1px)}}
.bb-shake{animation:bb-shake .4s}
@keyframes bb-flash{0%{opacity:.9}100%{opacity:0}}
.bb-flash{animation:bb-flash .3s ease-out forwards;background:#fff}
@keyframes bb-pop{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1;transform:scale(1.3)}100%{transform:translateY(-80px) scale(1);opacity:0}}
.bb-pop{animation:bb-pop 1s ease-out forwards}
@keyframes bb-combo-bounce{0%{transform:scale(1)}50%{transform:scale(1.5)}100%{transform:scale(1)}}
.bb-combo-bounce{animation:bb-combo-bounce .3s}
@keyframes bb-shard{to{transform:translateY(100px) rotate(var(--rot));opacity:0}}
.bb-shard{animation:bb-shard .8s ease-in forwards}
@keyframes bb-star{to{transform:translate(var(--dx),var(--dy)) scale(.4);opacity:0}}
.bb-star{animation:bb-star .7s ease-out forwards}
@keyframes bb-confetti{to{transform:translateY(260px) rotate(720deg);opacity:0}}
.bb-confetti{animation:bb-confetti 1.3s ease-in forwards;top:-12px;border-radius:2px}
@keyframes bb-fever{to{background-position:400% 0}}
.bb-fever{background:linear-gradient(90deg,#fca5a5,#fcd34d,#86efac,#93c5fd,#d8b4fe,#fca5a5);background-size:400% 100%;animation:bb-fever 2.5s linear infinite}
@keyframes bb-rage{50%{filter:brightness(1.4) drop-shadow(0 0 14px #ef4444)}}
.bb-rage{animation:bb-rage .7s ease-in-out infinite}
@keyframes bb-defeat{to{transform:rotate(110deg) translateY(70px);opacity:0}}
.bb-defeat{animation:bb-defeat 1.1s ease-in forwards}
@keyframes bb-banner{0%{transform:scale(.4);opacity:0}25%{transform:scale(1.1);opacity:1}80%{transform:scale(1);opacity:1}100%{opacity:0}}
.bb-banner{animation:bb-banner 1.2s ease-out forwards}
@keyframes bb-cutin-zoom{0%{transform:scale(.5)}100%{transform:scale(1.6)}}
.bb-cutin-zoom{animation:bb-cutin-zoom 1s ease-out forwards}
@keyframes bb-blink{50%{opacity:.4}}
.bb-timer-danger{background:#ef4444!important;animation:bb-blink .3s linear infinite}
.bb-glow{filter:drop-shadow(0 0 12px gold)}
`;

const SKELETON = `
  <style>${CSS}</style>
  <div data-bb="battle" class="relative flex-1 min-h-0 overflow-hidden bg-base-200">
    <!-- left-12 keeps clear of the launcher's back button overlay -->
    <div class="absolute top-2 left-12 right-3 flex items-center gap-3">
      <span data-bb="boss-name" class="font-bold text-lg whitespace-nowrap"></span>
      <div class="flex-1 h-4 bg-base-300 rounded-full overflow-hidden border border-base-content/20">
        <div data-bb="boss-hp" class="h-full bg-success" style="width:100%;transition:width .4s ease-out"></div>
      </div>
    </div>
    <div data-bb="hearts" class="absolute top-9 left-12 text-2xl"></div>
    <div class="absolute top-9 right-3 flex flex-col items-end gap-1">
      <span data-bb="combo" class="text-3xl font-black text-warning drop-shadow"></span>
      <span data-bb="special" class="badge badge-secondary badge-lg font-bold hidden">ひっさつ OK!</span>
    </div>
    <span data-bb="boss" class="absolute right-[10%] top-1/4 text-8xl bb-idle" style="line-height:1"></span>
    <span data-bb="player" class="absolute left-[8%] bottom-[6%] text-7xl" style="line-height:1">🐤</span>
    <div data-bb="fx" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
  </div>
  <div class="p-4 flex flex-col gap-3">
    <div class="h-2 bg-base-300 rounded-full overflow-hidden">
      <div data-bb="timer" class="h-full bg-info" style="width:100%"></div>
    </div>
    <div data-bb="question" class="text-3xl font-bold text-center min-h-[2.5rem]"></div>
    <div data-bb="answers" class="grid grid-cols-2 gap-3"></div>
  </div>
`;

// ---- game ------------------------------------------------------------------

export const mount: GameMount = (container, { quiz, onComplete }) => {
  const prevPosition = container.style.position;
  if (!prevPosition) container.style.position = "relative";

  const root = document.createElement("div");
  root.className =
    "absolute inset-0 flex flex-col bg-base-100 overflow-hidden select-none";
  container.appendChild(root);

  const el = <T extends HTMLElement = HTMLElement>(k: string): T =>
    root.querySelector(`[data-bb="${k}"]`) as T;

  const sfx = createSfx();

  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const unschedule = (id: ReturnType<typeof setTimeout>) => {
    clearTimeout(id);
    timers.delete(id);
  };

  let session: QuizSession = createSession(
    quiz,
    (Math.random() * 0x7fffffff) | 0,
  );
  let bossIdx = 0;
  let bossHp = 0;
  let hearts = MAX_HEARTS;
  let combo = 0;
  let specialCharged = false;
  let questionTimers: ReturnType<typeof setTimeout>[] = [];

  // ---- small visual helpers ----

  const renderHearts = () => {
    el("hearts").textContent = "❤️".repeat(hearts) +
      "🖤".repeat(MAX_HEARTS - hearts);
  };

  const renderCombo = () => {
    const c = el("combo");
    if (combo >= 2) {
      c.textContent = `🔥 ×${combo}`;
      c.classList.remove("bb-combo-bounce");
      void c.offsetWidth;
      c.classList.add("bb-combo-bounce");
    } else {
      c.textContent = "";
    }
    const tier = comboTier(combo);
    c.classList.toggle("text-error", tier >= 3);
    c.classList.toggle("text-warning", tier < 3);
    el("special").classList.toggle("hidden", !specialCharged);
    el("player").classList.toggle("bb-glow", tier >= 2);
    el("battle").classList.toggle("bb-fever", tier >= 3);
  };

  const updateHp = () => {
    const ratio = bossHp / BOSSES[bossIdx].hp;
    const bar = el("boss-hp");
    bar.style.width = `${ratio * 100}%`;
    bar.classList.toggle("bg-success", ratio > 0.5);
    bar.classList.toggle("bg-warning", ratio <= 0.5 && ratio > 0.25);
    bar.classList.toggle("bg-error", ratio <= 0.25);
  };

  const rageActive = () =>
    BOSSES[bossIdx].rage === true &&
    bossHp > 0 &&
    bossHp <= BOSSES[bossIdx].hp * RAGE_HP_RATIO;

  const shake = () => {
    const b = el("battle");
    b.classList.remove("bb-shake");
    void b.offsetWidth;
    b.classList.add("bb-shake");
  };

  const flash = () => {
    const f = document.createElement("div");
    f.className = "bb-flash absolute inset-0";
    el("fx").appendChild(f);
    schedule(() => f.remove(), 350);
  };

  const popDamage = (dmg: number, special: boolean) => {
    const p = document.createElement("div");
    p.textContent = `-${dmg}`;
    p.className = `bb-pop absolute font-black ${
      special ? "text-5xl text-secondary" : "text-4xl text-error"
    }`;
    p.style.right = "14%";
    p.style.top = "22%";
    el("fx").appendChild(p);
    schedule(() => p.remove(), 1100);
  };

  const stars = () => {
    const fx = el("fx");
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("span");
      s.textContent = "⭐";
      s.className = "bb-star absolute text-2xl";
      s.style.right = `${8 + Math.random() * 16}%`;
      s.style.top = `${18 + Math.random() * 22}%`;
      s.style.setProperty("--dx", `${(Math.random() - 0.5) * 160}px`);
      s.style.setProperty("--dy", `${-40 - Math.random() * 80}px`);
      fx.appendChild(s);
      schedule(() => s.remove(), 800);
    }
  };

  const confetti = () => {
    const fx = el("fx");
    const colors = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc"];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.className = "bb-confetti absolute";
      s.style.left = `${Math.random() * 100}%`;
      s.style.width = "8px";
      s.style.height = "12px";
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = `${Math.random() * 0.3}s`;
      fx.appendChild(s);
      schedule(() => s.remove(), 1700);
    }
  };

  // The combo badge splits into two halves that tumble away.
  const shatterCombo = () => {
    const c = el("combo");
    if (!c.textContent) return;
    const fx = el("fx");
    const rect = c.getBoundingClientRect();
    const base = fx.getBoundingClientRect();
    const halves: [string, string][] = [
      ["inset(0 0 50% 0)", "-40deg"],
      ["inset(50% 0 0 0)", "50deg"],
    ];
    for (const [clip, rot] of halves) {
      const s = document.createElement("span");
      s.textContent = c.textContent;
      s.className = "bb-shard absolute text-3xl font-black text-warning";
      s.style.left = `${rect.left - base.left}px`;
      s.style.top = `${rect.top - base.top}px`;
      s.style.clipPath = clip;
      s.style.setProperty("--rot", rot);
      fx.appendChild(s);
      schedule(() => s.remove(), 900);
    }
  };

  const banner = (text: string) => {
    const b = document.createElement("div");
    b.className =
      "bb-banner absolute inset-0 flex items-center justify-center text-4xl font-black drop-shadow";
    b.textContent = text;
    el("fx").appendChild(b);
    schedule(() => b.remove(), 1300);
  };

  // ---- question / timer ----

  const stopTimer = () => {
    for (const id of questionTimers) unschedule(id);
    questionTimers = [];
    const bar = el("timer");
    const w = getComputedStyle(bar).width;
    bar.style.transition = "none";
    bar.style.width = w; // freeze where it was
  };

  const startTimer = (correct: string) => {
    const secs = rageActive() ? RAGE_SECONDS : QUESTION_SECONDS;
    const bar = el("timer");
    bar.classList.remove("bb-timer-danger");
    bar.style.transition = "none";
    bar.style.width = "100%";
    void bar.offsetWidth;
    bar.style.transition = `width ${secs}s linear`;
    bar.style.width = "0%";
    questionTimers = [
      schedule(
        () => bar.classList.add("bb-timer-danger"),
        (secs - DANGER_SECONDS) * 1000,
      ),
      schedule(() => resolve(null, false, correct), secs * 1000),
    ];
  };

  const ask = () => {
    const q = session.next();
    const correct = stripHtml(q.a);
    const opts: string[] = [correct];
    let safety = 16;
    while (opts.length < 4 && safety-- > 0) {
      const w = stripHtml(q.wrong());
      if (!opts.includes(w)) opts.push(w);
    }
    while (opts.length < 4) opts.push(`?${opts.length}`);

    el("question").innerHTML = q.q;
    const grid = el("answers");
    grid.innerHTML = "";
    for (const v of shuffle(opts)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-lg btn-outline text-2xl";
      btn.dataset.v = v;
      btn.textContent = v;
      btn.addEventListener("click", () => resolve(btn, v === correct, correct));
      grid.appendChild(btn);
    }
    startTimer(correct);
  };

  const resolve = (
    btn: HTMLButtonElement | null,
    isCorrect: boolean,
    correct: string,
  ) => {
    stopTimer();
    const buttons = [...el("answers").querySelectorAll("button")];
    for (const b of buttons) b.disabled = true;
    if (btn) {
      btn.classList.remove("btn-outline");
      btn.classList.add(isCorrect ? "btn-success" : "btn-error");
    }
    if (!isCorrect) {
      for (const b of buttons) {
        if (b.dataset.v === correct) {
          b.classList.remove("btn-outline");
          b.classList.add("btn-success");
        }
      }
    }
    if (isCorrect) onCorrect();
    else onWrong();
  };

  // ---- battle flow ----

  const strike = (dmg: number, special: boolean) => {
    const player = el("player");
    player.classList.remove("bb-player-attack");
    void player.offsetWidth;
    player.classList.add("bb-player-attack");
    schedule(() => {
      sfx.hit(combo);
      const boss = el("boss");
      boss.classList.remove("bb-boss-hit");
      void boss.offsetWidth;
      boss.classList.add("bb-boss-hit");
      const tier = comboTier(combo);
      if (tier >= 1 || special) flash();
      if (tier >= 2 || special) {
        shake();
        stars();
      }
      if (tier >= 3) confetti();
      popDamage(dmg, special);
      bossHp = Math.max(0, bossHp - dmg);
      updateHp();
      el("boss").classList.toggle("bb-rage", rageActive());
      if (bossHp <= 0) schedule(defeatBoss, 500);
      else schedule(ask, 800);
    }, 250);
  };

  const specialCutIn = (after: () => void) => {
    sfx.special();
    const o = document.createElement("div");
    o.className =
      "absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70";
    o.innerHTML = `
      <span class="text-8xl bb-cutin-zoom" style="line-height:1.2">🐤</span>
      <span class="text-4xl font-black text-yellow-300">ひっさつわざ！</span>
    `;
    el("fx").appendChild(o);
    schedule(() => {
      o.remove();
      after();
    }, 1000);
  };

  const onCorrect = () => {
    combo++;
    const useSpecial = specialCharged;
    if (useSpecial) specialCharged = false;
    if (combo % SPECIAL_COMBO === 0) specialCharged = true;
    renderCombo();
    const dmg = useSpecial
      ? SPECIAL_DAMAGE
      : Math.round(BASE_DAMAGE * comboMultiplier(combo));
    if (useSpecial) specialCutIn(() => strike(dmg, true));
    else schedule(() => strike(dmg, false), 150);
  };

  const onWrong = () => {
    session.markWrong();
    sfx.breakCombo();
    shatterCombo();
    combo = 0;
    specialCharged = false;
    renderCombo();
    schedule(() => {
      const boss = el("boss");
      boss.classList.remove("bb-boss-counter");
      void boss.offsetWidth;
      boss.classList.add("bb-boss-counter");
      schedule(() => {
        sfx.counter();
        shake();
        hearts--;
        renderHearts();
        if (hearts <= 0) schedule(() => renderEnd(false), 900);
        else schedule(ask, 900);
      }, 250);
    }, 500);
  };

  const defeatBoss = () => {
    sfx.fanfare();
    const boss = el("boss");
    boss.classList.remove("bb-idle", "bb-rage");
    boss.classList.add("bb-defeat");
    banner(`${BOSSES[bossIdx].name} を たおした！`);
    bossIdx++;
    schedule(() => {
      if (bossIdx >= BOSSES.length) renderEnd(true);
      else startBattle();
    }, 1400);
  };

  const startBattle = () => {
    const b = BOSSES[bossIdx];
    bossHp = b.hp;
    const boss = el("boss");
    boss.textContent = b.emoji;
    boss.classList.remove("bb-defeat", "bb-rage");
    boss.classList.add("bb-idle");
    el("boss-name").textContent = b.name;
    el("question").innerHTML = "";
    el("answers").innerHTML = "";
    updateHp();
    banner(`${b.name} が あらわれた！`);
    schedule(ask, 1300);
  };

  const renderEnd = (cleared: boolean) => {
    const score = bossIdx; // bosses defeated
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-base-100">
        <div class="text-7xl">${cleared ? "🏆" : "💤"}</div>
        <h2 class="text-4xl font-bold">${
      cleared ? "ぜんぶクリア！" : "おしまい"
    }</h2>
        <p class="text-2xl">たおしたボス ${score} / ${BOSSES.length}</p>
      </div>
    `;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-lg";
    again.textContent = "もう一度";
    again.addEventListener("click", restart);
    root.lastElementChild!.appendChild(again);
    onComplete?.({ score, cleared });
  };

  const restart = () => {
    session = createSession(quiz, (Math.random() * 0x7fffffff) | 0);
    bossIdx = 0;
    hearts = MAX_HEARTS;
    combo = 0;
    specialCharged = false;
    renderGame();
  };

  const renderGame = () => {
    root.innerHTML = SKELETON;
    renderHearts();
    renderCombo();
    startBattle();
  };

  renderGame();

  return () => {
    disposed = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    sfx.dispose();
    root.remove();
    if (!prevPosition) container.style.position = prevPosition;
  };
};

const bossBattle: GameModule = { title: "ボスバトル", mount };
export default bossBattle;
