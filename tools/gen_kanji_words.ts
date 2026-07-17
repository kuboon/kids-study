/**
 * One-off generator: build the per-grade kanji-writing prompt list
 * (`quiz/stroke/words.ts`) covering ALL kanji of the 学年別漢字配当表
 * (grade-level kyōiku kanji, grades 1–6). Run locally (needs network); the
 * generated file is committed so CI never fetches.
 *
 *   deno task gen:words     # fetch dataset → write quiz/stroke/words.ts
 *
 * After regenerating words, regenerate the stroke paths for any newly added
 * kanji with `deno task gen:strokes`.
 *
 * Data source: `davidluzgouveia/kanji-data` (a KANJIDIC2-derived JSON on GitHub
 * raw; kanjiapi.dev is blocked by the sandbox egress policy). Each entry has a
 * `grade` (1–6 = kyōiku by school year, 8 = other jōyō) plus kun/on readings.
 *
 * Prompt generation: a prompt is a reading with the kanji's part bracketed,
 * e.g. `[およ]ぐ`. We prefer the first kun reading (splitting on "." into the
 * on-kanji part and the okurigana), else the first on reading. `OVERRIDES`
 * (tools/kanji_word_overrides.ts) replaces the auto prompt where a bare reading
 * would be ambiguous or obscure.
 *
 * Grades: the dataset reflects the pre-2020 配当表 (1006 kanji). The 2020
 * revision added 20 都道府県 kanji to grade 4 (→ 1026 total); we place those
 * explicitly (PREFECTURE_GRADE4). The 2020 revision also shuffled ~18 kanji
 * between grades 4–6 without changing the overall set — those keep their
 * dataset grade here, so a handful of grade-5/6 kanji appear in the grade-4
 * pool. Coverage (every 配当表 kanji is quizzed) is exact; the per-grade split
 * for grades 4–6 follows the dataset.
 */

import { OVERRIDES, PREFECTURE_GRADE4 } from "./kanji_word_overrides.ts";
import type { WriteWord } from "../quiz/stroke/word_types.ts";

const CACHE = new URL("./.cache/kanji-data.json", import.meta.url);
const OUT = new URL("../quiz/stroke/words.ts", import.meta.url);
const SRC =
  "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json";
const UA = "kids-study word generator (github.com/kuboon/kids-study)";

export type Entry = {
  grade: number | null;
  readings_on: string[];
  readings_kun: string[];
};

const fetchData = async (): Promise<Record<string, Entry>> => {
  try {
    return JSON.parse(await Deno.readTextFile(CACHE));
  } catch { /* not cached yet */ }
  const res = await fetch(SRC, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching kanji data`);
  const text = await res.text();
  await Deno.mkdir(new URL("./.cache/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(CACHE, text);
  return JSON.parse(text);
};

/** "-" marks prefix/suffix use; drop it. Keeps the reading kana. */
const strip = (s: string) => s.replace(/-/g, "");

/** Pick a bracketed-reading prompt for a kanji from its dataset readings. */
export const autoPrompt = (kanji: string, e: Entry): WriteWord | null => {
  for (const k of e.readings_kun ?? []) {
    const dot = k.indexOf(".");
    const read = strip(dot >= 0 ? k.slice(0, dot) : k);
    const post = dot >= 0 ? strip(k.slice(dot + 1)) : "";
    if (read) return post ? { kanji, read, post } : { kanji, read };
  }
  const on = (e.readings_on ?? [])[0];
  if (on && strip(on)) return { kanji, read: strip(on) };
  return null;
};

const main = async () => {
  const data = await fetchData();

  // Grade -> Set of kanji. Base grades 1-6 from the dataset.
  const grades: Set<string>[] = Array.from({ length: 6 }, () => new Set());
  for (const [ch, e] of Object.entries(data)) {
    if (e.grade && e.grade >= 1 && e.grade <= 6) grades[e.grade - 1].add(ch);
  }
  // 2020 revision: the 20 都道府県 kanji join grade 4.
  for (const ch of PREFECTURE_GRADE4) grades[3].add(ch);

  const missing: string[] = [];
  const gradeWords: WriteWord[][] = grades.map((set, gi) => {
    const chars = [...set].sort((a, b) =>
      a.codePointAt(0)! - b.codePointAt(0)!
    );
    const words: WriteWord[] = [];
    for (const ch of chars) {
      const override = OVERRIDES[ch];
      if (override) {
        words.push(override);
        continue;
      }
      const e = data[ch];
      const w = e && autoPrompt(ch, e);
      if (w) words.push(w);
      else missing.push(`${ch}(grade${gi + 1})`);
    }
    return words;
  });

  if (missing.length) {
    console.warn(
      `%c${missing.length} kanji had no usable reading, skipped: ${
        missing.join(" ")
      }`,
      "color:orange",
    );
  }

  const fmtWord = (w: WriteWord): string => {
    const parts = [`kanji: ${JSON.stringify(w.kanji)}`];
    if (w.pre !== undefined) parts.push(`pre: ${JSON.stringify(w.pre)}`);
    parts.push(`read: ${JSON.stringify(w.read)}`);
    if (w.post !== undefined) parts.push(`post: ${JSON.stringify(w.post)}`);
    return `{ ${parts.join(", ")} }`;
  };

  const blocks = gradeWords.map((words, i) => {
    const body = words.map((w) => `  ${fmtWord(w)},`).join("\n");
    return `const grade${i + 1}: WriteWord[] = [\n${body}\n];`;
  });

  const total = gradeWords.reduce((n, w) => n + w.length, 0);
  await Deno.writeTextFile(
    OUT,
    `// AUTO-GENERATED by tools/gen_kanji_words.ts. DO NOT EDIT.
// Kanji-writing prompts for every kanji of the 学年別漢字配当表 (grade-level
// kyōiku kanji, grades 1–6). Each prompt shows a reading with the kanji's part
// bracketed, e.g. \`[およ]ぐ\`. Regenerate with \`deno task gen:words\`, then
// \`deno task gen:strokes\`. Hand-tune prompts in tools/kanji_word_overrides.ts.
//
// Coverage: ${total} kanji (grades ${
      gradeWords.map((w) => w.length).join("/")
    }).

import type { WriteWord } from "./word_types.ts";

export { displayWord, type WriteWord } from "./word_types.ts";

${blocks.join("\n\n")}

export const GRADE_WORDS: readonly (readonly WriteWord[])[] = [
  grade1,
  grade2,
  grade3,
  grade4,
  grade5,
  grade6,
];
`,
  );
  console.log(
    `wrote ${total} kanji → words.ts (grades ${
      gradeWords.map((w) => w.length).join("/")
    })`,
  );
};

if (import.meta.main) await main();
