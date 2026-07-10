import { assertEquals } from "@std/assert";
import { createSession } from "./session.ts";

// A trivial generator whose "quiz" is just the seed, so we can observe exactly
// which seeds next() hands out.
const idGen = { title: "id", fn: (seed: number) => seed };

Deno.test("createSession hands out increasing seeds", () => {
  const s = createSession(idGen, 100);
  assertEquals(s.next(), 100);
  assertEquals(s.next(), 101);
  assertEquals(s.next(), 102);
});

Deno.test("markWrong re-queues the current seed at next-but-one", () => {
  const s = createSession(idGen, 0);
  assertEquals(s.next(), 0); // question A (seed 0)
  s.markWrong(); // A was wrong → reappears at the next-but-one
  assertEquals(s.next(), 1); // question B (fresh)
  assertEquals(s.next(), 0); // A again, same seed
  assertEquals(s.next(), 2); // then continue fresh
});

Deno.test("createSession is generic over the quiz type", () => {
  // Works with an object-shaped quiz, not just numbers.
  const gen = { title: "t", fn: (seed: number) => ({ label: `#${seed}` }) };
  const s = createSession(gen, 5);
  assertEquals(s.next(), { label: "#5" });
});
