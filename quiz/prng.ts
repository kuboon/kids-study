import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";

export class PRNG {
  private rng: ReturnType<typeof xoroshiro128plus>;

  constructor(seed: number) {
    this.rng = xoroshiro128plus(seed);
  }

  uniformInt(min: number, max: number): number {
    return uniformInt(this.rng, min, max);
  }
}
