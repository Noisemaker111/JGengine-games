/**
 * Where do this repo's PR checks stand right now? One question, one answer.
 *
 *   bun run ci:status                    # this branch's open PR
 *   bun run ci:status --pr 164           # any PR by number
 *   bun run ci:status --branch agent/x   # another branch
 *   bun run ci:status --json             # for scripts
 *
 * The engine owns the logic (`scripts/ci-status.ts`); this only finds the checkout
 * and delegates. It asks gh once and exits — no wait, no watch, no poll.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveEngine, root } from "./engine-mode";

const argv = process.argv.slice(2);
const dirArg = argv.find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length) ?? argv[argv.indexOf("--dir") + 1];
const forwarded = argv.filter((arg, index) => !arg.startsWith("--dir") && argv[index - 1] !== "--dir");

let engine: string;
try {
  engine = resolveEngine(dirArg);
} catch (error) {
  console.error(`ci:status: ${(error as Error).message}`);
  process.exit(3);
}
const script = join(engine, "scripts", "ci-status.ts");
if (!existsSync(script)) {
  console.error(`ci:status: ${engine} has no scripts/ci-status.ts; update the engine checkout or pass --dir <engine path>`);
  process.exit(3);
}

const result = spawnSync("bun", [script, ...forwarded], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 3);
