import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { ENGINE_SHARED_PACKAGES, engineDedupe } from "../shared/viteEngineDedupe";

/**
 * A game's dev server must load one copy of three.js, React and React Three Fiber. The engine
 * snapshot ships its own copies; if a game's Vite config stops deduplicating them, the 3D view
 * fails with "Multiple instances of Three.js" and "The game view couldn't load".
 *
 * These checks resolve the engine's own imports through each game's real Vite config and fail
 * when any of them lands in the snapshot instead of the game's node_modules.
 */

const repo = resolve(import.meta.dir, "..");
const LIVE_GAMES = ["brightway-park", "harbor-heat"] as const;
const TEMPLATE = join(repo, "scripts/new-game/template/common/vite.config.ts");

function gameViteConfigs(): string[] {
  const games = readdirSync(repo, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(repo, entry.name, "vite.config.ts"))
    .filter((file) => existsSync(file));
  return [...games, TEMPLATE];
}

/** Loads the Vite that this game installs, so the server and the game's config share one copy. */
async function loadVite(root: string): Promise<typeof import("vite")> {
  const viteDir = realpathSync(join(root, "node_modules/vite"));
  const entry = join(viteDir, "dist/node/index.js");
  if (!existsSync(entry)) throw new Error(`${root} has no Vite build at ${entry}; run bun install`);
  return (await import(pathToFileURL(entry).href)) as typeof import("vite");
}

describe("every Vite config dedupes the engine's shared packages", () => {
  test("the helper lists the shared packages a game installs", () => {
    const dir = join(repo, "harbor-heat");
    const listed = engineDedupe(dir);
    for (const pkg of ["react", "three", "@react-three/fiber"]) {
      expect(listed).toContain(pkg);
    }
    expect(listed.every((pkg) => (ENGINE_SHARED_PACKAGES as readonly string[]).includes(pkg))).toBe(true);
  });

  for (const file of gameViteConfigs()) {
    test(`${relative(repo, file)} passes engineDedupe to resolve.dedupe`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain('import { engineDedupe } from "../shared/viteEngineDedupe";');
      expect(src).toMatch(/resolve:\s*\{[^}]*dedupe: engineDedupe\(/s);
    });
  }
});

describe("a live dev server loads one copy of each shared package", () => {
  for (const game of LIVE_GAMES) {
    test(`${game}: engine imports resolve to the game's own three, React and R3F`, async () => {
      const root = join(repo, game);
      const packages = engineDedupe(root);
      expect(packages).toEqual(expect.arrayContaining(["react", "three", "@react-three/fiber"]));

      const vite = await loadVite(root);
      // The linked engine shell: its imports are the ones that used to load a second copy.
      const importer = realpathSync(join(root, "node_modules/@jgengine/shell/package.json"));
      const server = await vite.createServer({
        root,
        configFile: join(root, "vite.config.ts"),
        logLevel: "silent",
        clearScreen: false,
        appType: "custom",
        server: { middlewareMode: true, hmr: false },
        // Resolve straight from node_modules; a pre-bundled .vite/deps copy would hide the path.
        optimizeDeps: { disabled: true },
      });
      try {
        const escapes: string[] = [];
        for (const pkg of packages) {
          const own = realpathSync(join(root, "node_modules", pkg));
          const resolved = await server.pluginContainer.resolveId(pkg, importer, { ssr: false });
          if (resolved === null) {
            escapes.push(`${pkg}: not resolvable from the engine`);
            continue;
          }
          const file = realpathSync(resolved.id.split("?")[0]!);
          if (!file.startsWith(own + sep)) {
            escapes.push(`${pkg}: engine loads ${file}, the game installs ${own}`);
          }
        }
        expect(escapes).toEqual([]);
      } finally {
        await server.close();
      }
    }, 180_000);
  }
});
