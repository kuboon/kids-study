import { Document } from "./layout/document.tsx";
import { Menu } from "../client/menu.tsx";

export default (
  <Document>
    <main class="relative w-full overflow-hidden h-[calc(100dvh-4rem)]">
      <Menu />
    </main>
  </Document>
);
