import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { engineDedupe } from "../shared/viteEngineDedupe";
const registryUi = fileURLToPath(new URL("../registry/jgengine", import.meta.url));
export default defineConfig({
  resolve: { dedupe: engineDedupe(new URL(".", import.meta.url)) },
  plugins: [react(), tailwindcss(), viteIdleExit()],
  resolve: { alias: [{ find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` }] },
});
