import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const registryUi = fileURLToPath(new URL("../registry/jgengine", import.meta.url));
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` }] },
});
