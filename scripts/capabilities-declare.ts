/**
 * Seed each game's `capabilities.json` from its source with `capabilities:declare`.
 *
 * The generated file is the starting point, not a verdict: adoption comes from
 * a real import of the capability's module (or a barrel-exported API name), and
 * every decline gets a reason. A game owner edits the reasons and drops
 * over-broad adoptions; the gate then enforces that the file stays complete.
 *
 * Usage: bun run capabilities:declare [game...] [--force]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  declarationPath,
  deriveLedger,
  gameDirs,
  readDeclaration,
  renderDeclaration,
  seedDeclaration,
} from "./capabilities";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const force = args.includes("--force");
const wanted = args.filter((arg) => !arg.startsWith("--"));
const games = gameDirs(root).filter((game) => wanted.length === 0 || wanted.includes(game));
const ledger = deriveLedger(root);

if (games.length === 0) {
  console.error(`capabilities:declare FAIL - no games matched ${wanted.join(", ") || "(all)"}`);
  process.exit(1);
}

let failures = 0;
for (const game of games) {
  const path = declarationPath(root, game);
  if (existsSync(path) && !force) {
    console.log(`capabilities:declare SKIP ${game} - ${path} already exists (use --force to reseed)`);
    continue;
  }
  const declaration = seedDeclaration(root, game, ledger);
  writeFileSync(path, renderDeclaration(declaration));
  const adopted = declaration.adopts.length;
  const declined = Object.keys(declaration.declines).length;
  const probes = Object.keys(declaration.probes ?? {}).length;
  console.log(`capabilities:declare OK ${game} - ${adopted} adopted, ${declined} declined, ${probes} probed`);
}

if (failures > 0) process.exit(1);

// Keep a failed reseed visible rather than silently leaving an old file.
for (const game of games) {
  const path = declarationPath(root, game);
  if (!existsSync(path)) {
    console.error(`capabilities:declare FAIL - ${game} has no ${path} after seeding`);
    failures += 1;
    continue;
  }
  try {
    JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`capabilities:declare FAIL - ${path} is not valid JSON`);
    failures += 1;
  }
}
if (failures > 0) process.exit(1);
