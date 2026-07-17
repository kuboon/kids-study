import { assertEquals } from "@std/assert";
import { autoPrompt, type Entry } from "./gen_kanji_words.ts";

const entry = (kun: string[], on: string[] = []): Entry => ({
  grade: 1,
  readings_kun: kun,
  readings_on: on,
});

Deno.test("autoPrompt: splits kun okurigana on the dot", () => {
  assertEquals(autoPrompt("泳", entry(["およ.ぐ"])), {
    kanji: "泳",
    read: "およ",
    post: "ぐ",
  });
});

Deno.test("autoPrompt: no dot means no okurigana", () => {
  assertEquals(autoPrompt("右", entry(["みぎ"])), {
    kanji: "右",
    read: "みぎ",
  });
});

Deno.test("autoPrompt: strips prefix/suffix hyphens", () => {
  assertEquals(autoPrompt("生", entry(["なま-", "い.きる"])), {
    kanji: "生",
    read: "なま",
  });
});

Deno.test("autoPrompt: falls back to the first on reading", () => {
  assertEquals(autoPrompt("校", entry([], ["こう", "きょう"])), {
    kanji: "校",
    read: "こう",
  });
});

Deno.test("autoPrompt: null when there is no usable reading", () => {
  assertEquals(autoPrompt("々", entry([], [])), null);
});
