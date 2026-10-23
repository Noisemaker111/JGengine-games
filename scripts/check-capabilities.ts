/**
 * Fail a games PR when a game's capability declaration is incomplete, a decline is
 * boilerplate, debt has no open owner, or `capabilities.json` is behind the installed
 * packages.
 *
 * This is the adoption half of "build it once in the engine". `check:framework`
 * stops new handrolled systems; this notices a shipped capability that no game
 * adopted or declined, and keeps "this game has no such domain" separate from
 * "we have not adopted it yet", which is the debt the ledger exists to surface.
 *
 * Usage: bun run check:capabilities [--summary] [--no-ledger] [--no-issues]
 * `--summary` also prints the per-game adopted / not-applicable / debt table, which
 * CI keeps in the job log. `--no-issues` skips reading the debt issues in this repo
 * (offline work only; the gate cannot prove an owner without them).
 * `capabilities:probe` proves the adopted systems actually run; this check only
 * reads declarations.
 */
import { execFileSync } from "node:child_process";
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
  renderSummary,
  type GameDeclaration,
  type IssueState,
  type Ledger,
} from "./capabilities";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipLedger = process.argv.includes("--no-ledger");
const summary = process.argv.includes("--summary");
const skipIssues = process.argv.includes("--no-issues");

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

/** The repo whose issues own the debt: the one this checkout pushes to. */
function repoSlug(): string {
  const configured = process.env.CAPABILITIES_ISSUE_REPO;
  if (configured !== undefined && configured !== "") return configured;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
    const match = /github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/.exec(url);
    if (match?.[1] !== undefined) return match[1];
  } catch {
    // Fall through to the explicit failure below.
  }
  return "";
}

/** One call for every issue, so a dozen debt entries do not cost a dozen requests. */
function readIssueStates(): Map<number, IssueState> {
  const repo = repoSlug();
  if (repo === "") throw new Error("cannot tell which repo owns the debt issues; set CAPABILITIES_ISSUE_REPO=owner/repo");
  const raw = execFileSync(
    "gh",
    ["issue", "list", "--repo", repo, "--state", "all", "--limit", "2000", "--json", "number,state"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const listed = JSON.parse(raw) as Array<{ number: number; state: string }>;
  const states = new Map<number, IssueState>();
  for (const issue of listed) {
    states.set(issue.number, { state: issue.state.toLowerCase() === "open" ? "open" : "closed" });
  }
  return states;
}

let issues: Map<number, IssueState> | undefined;
if (skipIssues) {
  console.error("capability check: WARNING - --no-issues skips reading debt owners; a closed issue can still hold debt.");
} else {
  try {
    issues = readIssueStates();
  } catch (error) {
    failed = true;
    console.error(`capability check: FAIL - cannot read the debt issues (${(error as Error).message}).`);
    console.error("Debt cannot outlive the issue that explains it; fix gh access or pass --no-issues for an offline read.");
  }
}

const report = checkDeclarations(committed, declarations, issues);

if (report.problems.length > 0) {
  failed = true;
  console.error(`capability check: FAIL - ${report.problems.length} problem(s):`);
  for (const problem of report.problems) console.error(`  ${problem.message}`);
  console.error("");
  console.error(`Every game declares each game-facing capability once: adopt it, or decline it as not-applicable (no such domain here) or debt (has the domain, no shared system yet) with ${DECLINE_MIN}+ characters that name the domain.`);
  console.error("A debt entry also needs the number of the open issue that tracks adopting it.");
  console.error("Ledger: capabilities.json   Declarations: <game>/capabilities.json   Rule: AGENTS.md -> Capability adoption");
}

if (summary || report.problems.length > 0) {
  console.log("");
  console.log(renderSummary(report, committed));
}

if (!summary) {
  const closed = report.debtEntries.filter((entry) => issues?.get(entry.issue)?.state !== "open");
  if (closed.length > 0) {
    console.error("");
    console.error("Debt without a live owner:");
    for (const entry of closed) console.error(`  ${entry.game} ${entry.capability} -> #${entry.issue}`);
  }
}

if (report.declarationLevel.length > 0 && !summary) {
  const byCapability = new Map<string, string[]>();
  for (const entry of report.declarationLevel) {
    const adopters = byCapability.get(entry.capability) ?? [];
    adopters.push(entry.game);
    byCapability.set(entry.capability, adopters);
  }
  console.log("Capabilities still at declaration level (no boot probe declared):");
  for (const [capability, adopters] of [...byCapability].sort()) {
    const entry = committed.capabilities.find((item) => item.id === capability);
    console.log(`  ${capability} (${entry?.module ?? "?"}): ${adopters.join(", ")}`);
  }
}

if (failed) process.exit(1);

console.log(
  `capability check: OK - ${games.length} games, ${committed.capabilities.filter((entry) => entry.gameFacing).length} game-facing capabilities, ${report.adopted} adopted, ${report.notApplicable} not-applicable, ${report.debt} debt`,
);
