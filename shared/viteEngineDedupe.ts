import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Packages the engine's linked build also imports (shell, editor, assets, react). The engine
 * snapshot installs its own copies of these, so without `resolve.dedupe` a game loads two
 * three.js and two React Three Fiber instances: "Multiple instances of Three.js" and
 * "R3F: Hooks can only be used within the Canvas component", and the 3D view reads
 * "The game view couldn't load".
 */
export const ENGINE_SHARED_PACKAGES = ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"] as const;

/**
 * `resolve.dedupe` for a game's Vite config. Every shared package the game installs resolves
 * from the game's own node_modules for every importer, engine source included. Packages the
 * game does not install stay out of the list, so the engine keeps its single copy of them.
 */
export function engineDedupe(gameDir: URL | string): string[] {
  const dir = typeof gameDir === "string" ? gameDir : fileURLToPath(gameDir);
  return ENGINE_SHARED_PACKAGES.filter((pkg) => existsSync(join(dir, "node_modules", pkg, "package.json")));
}
