import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone probes always consume the published engine.
export default defineConfig({ plugins: [react(), tailwindcss()] });
