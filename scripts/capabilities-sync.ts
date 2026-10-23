/**
 * Regenerate `capabilities.json` from the installed `@jgengine/*` packages.
 *
 * A release that adds a game-facing capability changes this file, so the diff
 * a reviewer reads names exactly what arrived. `--check` fails when the checked
 * ledger is behind the installed packages; CI runs it.
 *
 * Usage: bun run capabilities:sync [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LEDGER_FILE, deriveLedger, ledgerDrift, renderLedger, type Ledger } from "./capabilities";

const root = fileURLToPath(new URL("..", import.meta.url));
const check = process.argv.includes("--check");
const installed = deriveLedger(root);

if (!check) {
  writeFileSync(`${root}/${LEDGER_FILE}`, renderLedger(installed));
  console.log(
    `capabilities:sync OK - ${installed.capabilities.filter((entry) => entry.gameFacing).length} game-facing of ${installed.capabilities.length} capabilities from @jgengine/* ${installed.engineVersion}`,
  );
  process.exit(0);
}

let committed: Ledger;
try {
  committed = JSON.parse(readFileSync(`${root}/${LEDGER_FILE}`, "utf8")) as Ledger;
} catch {
  console.error(`capabilities:sync FAIL - ${LEDGER_FILE} is missing or unreadable; run bun run capabilities:sync`);
  process.exit(1);
}

const drift = ledgerDrift(committed, installed);
if (drift.length === 0) {
  console.log(`capabilities:sync OK - ${LEDGER_FILE} matches @jgengine/* ${installed.engineVersion}`);
  process.exit(0);
}

console.error(`capabilities:sync FAIL - ${LEDGER_FILE} is behind the installed packages:`);
for (const line of drift) console.error(`  ${line}`);
console.error("");
console.error("Run: bun run capabilities:sync");
console.error("Then declare each new capability in every game's capabilities.json (adopt or decline).");
process.exit(1);
