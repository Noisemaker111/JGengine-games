/**
 * Fail a games PR when a game's capability declaration is incomplete, a decline
 * has no real reason, or `capabilities.json` is behind the installed packages.
 *
 * This is the adoption half of "build it once in the engine". `check:framework`
 * stops new handrolled systems; this notices a shipped capability that no game
 * adopted or declined, and a game that never said which engine systems it runs.
 *
 * Usage: bun run check:capabilities [--no-ledger]
 * `capabilities:probe` proves the adopted systems actually run; this check only
 * reads declarations.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DECLINE_MIN,
  LEDGER_FILE,
  checkDeclarations,
  declarationPath,
  deriveLedger,
  gameDirs,
  ledgerDrift,
  readDeclaration,
  type GameDeclaration,
  type Ledger,
} from "./capabilities";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipLedger = process.argv.includes("--no-ledger");

let committed: Ledger;
try {
  committed = JSON.parse(readFileSync(`${root}/${LEDGER_FILE}`, "utf8")) as Ledger;
} catch {
  console.error(`capability check: FAIL - ${LEDGER_FILE} is missing; run bun run capabilities:sync`);
  process.exit(1);
}

let failed = false;

if (!skipLedger) {
  const installed = deriveLedger(root);
  const drift = ledgerDrift(committed, installed);
  if (drift.length > 0) {
    failed = true;
    console.error(`capability check: FAIL - ${LEDGER_FILE} is behind the installed @jgengine/* packages:`);
    for (const line of drift) console.error(`  ${line}`);
    console.error("");
    console.error("Run bun run capabilities:sync, then declare each new capability in every game.");
  }
}

const games = gameDirs(root);
const declarations: GameDeclaration[] = games.map((game) => ({
  game,
  declaration: existsSync(declarationPath(root, game)) ? readDeclaration(root, game) : null,
}));

const report = checkDeclarations(committed, declarations);

if (report.problems.length > 0) {
  failed = true;
  console.error(`capability check: FAIL - ${report.problems.length} problem(s):`);
  for (const problem of report.problems) console.error(`  ${problem.message}`);
  console.error("");
  console.error(`Every game declares each game-facing capability once: adopt it, or decline it with ${DECLINE_MIN}+ characters of why.`);
  console.error("Ledger: capabilities.json   Declarations: <game>/capabilities.json   Rule: AGENTS.md -> Capability adoption");
}

if (report.declarationLevel.length > 0) {
  const byCapability = new Map<string, string[]>();
  for (const entry of report.declarationLevel) {
    const games = byCapability.get(entry.capability) ?? [];
    games.push(entry.game);
    byCapability.set(entry.capability, games);
  }
  console.log("Capabilities still at declaration level (no boot probe declared):");
  for (const [capability, adopters] of [...byCapability].sort()) {
    const entry = committed.capabilities.find((item) => item.id === capability);
    console.log(`  ${capability} (${entry?.module ?? "?"}): ${adopters.join(", ")}`);
  }
}

if (failed) process.exit(1);

console.log(
  `capability check: OK - ${games.length} games, ${committed.capabilities.filter((entry) => entry.gameFacing).length} game-facing capabilities, ${report.adopted} adopted, ${report.declined} declined`,
);
