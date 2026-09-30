import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone probes consume published engine packages, never monorepo source aliases.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // All mounted art is native geometry; do not duplicate the host's optional asset library.
  build: { copyPublicDir: false },
});
