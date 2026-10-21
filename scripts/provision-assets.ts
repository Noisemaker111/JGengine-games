/**
 * Pull every asset pack a game references into its `public/`, so a fresh clone (or CI) can run,
 * test and capture without hand-pulling packs.
 *
 *   bun run provision                 every game
 *   bun run provision ember-command   one game
 *
 * A pack counts as referenced when its source id appears as a string literal in the game's `src/`.
 * Packs already on disk are skipped, so re-running is cheap.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dir, "..");

function gameDirs(only: string[]): string[] {
  return readdirSync(root)
    .filter((name) => existsSync(join(root, name, "src")) && existsSync(join(root, name, "package.json")))
    .filter((name) => only.length === 0 || only.includes(name));
}

function sourceText(dir: string): string {
  let text = "";
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) text += sourceText(path);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) text += readFileSync(path, "utf8");
  }
  return text;
}

function isPopulated(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

const only = process.argv.slice(2);
let failed = false;
for (const game of gameDirs(only)) {
  const gameDir = join(root, game);
  const require = createRequire(join(gameDir, "package.json"));
  let assetsDir: string;
  try {
    assetsDir = dirname(require.resolve("@jgengine/assets/package.json"));
  } catch {
    continue;
  }
  const { sources } = (await import(join(assetsDir, "dist/index.js"))) as {
    sources: readonly { id: string; kind?: string }[];
  };
  const text = sourceText(join(gameDir, "src"));
  const referenced = sources.filter((source) => text.includes(`"${source.id}"`) || text.includes(`'${source.id}'`));
  for (const source of referenced) {
    const subdir = source.kind === "material" ? "materials" : source.kind === "sprite" ? "sprites" : "models";
    if (isPopulated(join(gameDir, "public", subdir, source.id))) continue;
    console.log(`${game}: pulling ${source.id}`);
    const result = spawnSync("bun", [join(assetsDir, "dist/cli/pull.js"), "pull", source.id, "--dir", join(gameDir, "public")], {
      cwd: gameDir,
      stdio: "inherit",
    });
    if (result.status !== 0) failed = true;
  }
}
process.exit(failed ? 1 : 0);
