/**
 * Which open PRs are armed for auto-merge but red, asked once.
 *
 *   bun run pr:sweep                 # this repo's armed PRs
 *   bun run pr:sweep --json          # for scripts
 *   bun run pr:sweep --dir ../jgengine
 *
 * The engine owns the logic (`scripts/pr-sweep.ts`); this only finds the checkout and
 * delegates. `gh` reads the repository from the directory it runs in, so running here
 * sweeps this repo's PRs, never the engine's.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveEngine, root } from "./engine-mode";

const argv = process.argv.slice(2);
const dirArg = argv.find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length) ?? argv[argv.indexOf("--dir") + 1];
const forwarded = argv.filter((arg, index) => !arg.startsWith("--dir") && argv[index - 1] !== "--dir");

let engine: string;
try {
  engine = resolveEngine(dirArg);
} catch (error) {
  console.error(`pr:sweep: ${(error as Error).message}`);
  process.exit(3);
}
if (dirArg !== undefined && resolve(dirArg) !== engine && !engine.toLowerCase().startsWith(resolve(dirArg).toLowerCase())) {
  console.error(`pr:sweep: --dir ${dirArg} is not an engine checkout; resolved ${engine} instead`);
  process.exit(3);
}
const script = join(engine, "scripts", "pr-sweep.ts");
if (!existsSync(script)) {
  console.error(`pr:sweep: ${engine} has no scripts/pr-sweep.ts; update the engine checkout or pass --dir <engine path>`);
  process.exit(3);
}

const result = spawnSync("bun", [script, ...forwarded], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 3);
