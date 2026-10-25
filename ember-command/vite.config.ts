import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { engineDedupe } from "../shared/viteEngineDedupe";

// The standalone harness consumes the published SDK, like the integrated host.
export default defineConfig({
  resolve: { dedupe: engineDedupe(new URL(".", import.meta.url)) },
  plugins: [react(), tailwindcss(), viteIdleExit()],
  clearScreen: false,
  build: { target: "es2022" },
  server: { host: "127.0.0.1", port: 4601, strictPort: true },
});
