import { Document } from "./layout/document.tsx";
import { Counter } from "../client/counter.tsx";

export default (
  <Document>
    <main class="mx-auto w-full max-w-3xl p-8 space-y-6">
      <Counter initialCount={3} label="test" />
    </main>
  </Document>
);
