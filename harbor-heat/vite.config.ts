import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { engineDedupe } from "../shared/viteEngineDedupe";

export default defineConfig({
  resolve: { dedupe: engineDedupe(new URL(".", import.meta.url)) },
  plugins: [react(), tailwindcss(), viteIdleExit()],
});
