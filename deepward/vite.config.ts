import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { engineDedupe } from "../shared/viteEngineDedupe";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteIdleExit()],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: { dedupe: engineDedupe(new URL(".", import.meta.url)) },
});
