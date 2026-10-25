import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteIdleExit()],
  clearScreen: false,
  build: { target: "es2022" },
});
