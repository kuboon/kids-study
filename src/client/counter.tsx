/**
 * Counter — a @remix-run/ui `clientEntry`.
 */

import {
  clientEntry,
  type Handle,
  on,
  type SerializableValue,
} from "@remix-run/ui";

// Render props must satisfy `SerializableProps`, which is an index signature.
// Declaring the index signature here keeps `label` strongly typed while
// satisfying the constraint.
export interface CounterProps {
  initialCount: number;
  label: string;
  [key: string]: SerializableValue;
}

export const Counter = clientEntry(
  "/counter.js#Counter",
  function Counter(handle: Handle<CounterProps>) {
    // Setup phase — runs once per instance (server + client). Read the
    // initial value from props; subsequent prop changes do not reset count.
    let count = handle.props.initialCount;

    // Render phase — runs on first render and every `handle.update()`.
    return () => (
      <div class="inline-flex items-center gap-3 rounded-box border border-base-300 px-4 py-2">
        <button
          type="button"
          aria-label="decrement"
          class="btn btn-sm btn-circle btn-outline"
          mix={[
            on("click", () => {
              count--;
              handle.update();
            }),
          ]}
        >
          −
        </button>
        <output class="min-w-[3ch] text-center font-semibold text-xl tabular-nums">
          {count}
        </output>
        <button
          type="button"
          aria-label="increment"
          class="btn btn-sm btn-circle btn-primary"
          mix={[
            on("click", () => {
              count++;
              handle.update();
            }),
          ]}
        >
          +
        </button>
        <span class="text-sm text-base-content/60">
          {handle.props.label}
        </span>
      </div>
    );
  },
);
