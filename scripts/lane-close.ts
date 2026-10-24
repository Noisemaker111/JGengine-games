/**
 * The last step of a lane in this repo, done as one command so it is not a paragraph of
 * remembered steps:
 *
 *   bun run lane:close -m "Odd Orbit: the coaster runs a real circuit" --seam "none - authored content only"
 *   bun run lane:close --dry-run        # what it would stage, commit and open; changes nothing
 *   bun run lane:close --allow bun.lock # keep a file the guards refuse
 *
 * It verifies with this repo's `verify:fast`, stages what the branch changed, prints the
 * files it will commit and refuses the ones a lane should not land (scratch artifacts, an
 * ignored path, a lockfile without its manifest), commits, pushes, opens or updates the PR
 * into `beta`, arms auto-merge and prints the URL and the one command that answers the
 * checks. The engine's `lane:close` closes an engine lane; this closes a games lane.
 *
 * A lane that proved a pinned engine build writes that commit into the body as one
 * `Engine pin: <sha>` line, read from the snapshot it installed: the PR is the only place
 * that answers "which engine did this prove?", and `bun run check:engine-mode` judges it.
 *
 * Exit: 0 closed, 1 verify or git/gh failed, 2 a guarded file was staged, 3 cannot answer.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkPrBody } from "./seam-line-check";
import { checkEngineMode, pinLine, readFacts, withPinLine, type EngineFacts } from "./engine-mode-check";

const root = join(import.meta.dir, "..");
/** The branch a games PR merges into, and the ref a lane's own change is measured against. */
export const TARGET = "beta";
export const DIFF = "origin/beta";

export const EXIT_CLOSED = 0;
export const EXIT_FAILED = 1;
export const EXIT_GUARDED = 2;
export const EXIT_CANNOT_ANSWER = 3;

export interface Args {
  message?: string;
  seam?: string;
  pin?: string;
  allow: string[];
  dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { allow: [], dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "-m" || arg === "--message") args.message = value(argv, (i += 1), arg);
    else if (arg === "--seam") args.seam = value(argv, (i += 1), arg);
    else if (arg === "--pin") args.pin = value(argv, (i += 1), arg);
    else if (arg === "--allow") args.allow.push(posix(value(argv, (i += 1), arg)));
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

const posix = (path: string): string => path.replaceAll("\\", "/");

/** A lane is a task branch: the base branches are never closed by this. */
export function branchRefusal(branch: string): string | null {
  if (branch.length === 0 || branch === "HEAD") return "could not read the current branch";
  if (branch === "beta" || branch === "main") return `refusing to close ${branch}: a lane is a task branch, not the base`;
  return null;
}

export interface Refusal {
  path: string;
  why: string;
}

/** Files a lane should not land even though git would take them. */
export function guardStaged(staged: readonly string[], allow: readonly string[]): Refusal[] {
  const kept = new Set(allow.map(posix));
  const refusals: Refusal[] = [];
  for (const path of staged.map(posix)) {
    if (kept.has(path)) continue;
    if (path.startsWith(".scratch/")) refusals.push({ path, why: "a scratch artifact; evidence does not land" });
    else if (path.includes("node_modules/")) refusals.push({ path, why: "an installed dependency" });
    else if (path.endsWith(".log")) refusals.push({ path, why: "a log, not a source file" });
  }
  if (staged.map(posix).includes("bun.lock") && !staged.map(posix).includes("package.json") && !kept.has("bun.lock")) {
    refusals.push({ path: "bun.lock", why: "a lockfile staged without its package.json manifest" });
  }
  return refusals;
}

/** The PR body the template asks for, with the seam line the games CI checks. */
export function prBody(message: string, seam: string, verified: string, pin?: string): string {
  return [
    "## What changed",
    "",
    message,
    "",
    "## Engine seam",
    `Engine seam: ${seam}`,
    ...(pin === undefined ? [] : ["", "## Engine pin", pinLine(pin)]),
    "",
    "## Checks",
    `- ${verified}`,
    "",
  ].join("\n");
}

/**
 * The commit a lane has to name: the pinned build it installed, or a refusal. A pinned
 * lane's evidence is the commit, and only the snapshot marker knows it, so it is read
 * rather than remembered. Published leaves nothing to name; local proves no commit.
 */
export function pinEvidence(facts: EngineFacts, explicit?: string): { sha: string | null; refusal: string | null } {
  if (explicit !== undefined) {
    const named = explicit.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(named)) return { sha: null, refusal: `--pin ${JSON.stringify(explicit)} is not a commit sha` };
    return { sha: named.toLowerCase(), refusal: null };
  }
  if (facts.installed === "local") {
    return {
      sha: null,
      refusal: "local mode links a live checkout and proves no commit; pin what you proved with bun run engine:pin --ref <sha>, then close the lane",
    };
  }
  if (facts.installed !== "pinned") return { sha: null, refusal: null };
  if (facts.pinned === null) {
    return { sha: null, refusal: "the pinned snapshot has no identity marker, so the commit cannot be named; run bun run engine:pin --ref <sha>" };
  }
  return { sha: facts.pinned.sha, refusal: null };
}

/**
 * Why `--seam` cannot open this PR, or null when the body says it. A shell that mangled the
 * line would otherwise open a PR whose own CI fails on it, so the body is checked here first.
 */
export function seamProblem(seam: string | undefined): string | null {
  if (seam === undefined || seam.trim().length === 0) {
    return 'opening a PR needs its seam line: --seam "none - <reason>" or --seam "packages/<pkg>/src/<file> (adopts #<n>)"';
  }
  const verdict = checkPrBody(prBody("what changed", seam.trim(), "verify:fast passed"));
  return verdict.ok ? null : `${verdict.message}. The --seam value reached this command as: ${JSON.stringify(seam)}`;
}

function git(args: string[], inherit = false): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function gh(args: string[], input?: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function openPr(branch: string): { number: number; url: string; title: string } | null {
  const listed = gh(["pr", "list", "--head", branch, "--state", "open", "--limit", "1", "--json", "number,url,title"]);
  if (listed.status !== 0) return null;
  try {
    const found = JSON.parse(listed.stdout) as { number: number; url: string; title: string }[];
    return found[0] ?? null;
  } catch {
    return null;
  }
}

function close(args: Args): number {
  const branch = lines(git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout)[0] ?? "";
  const refusal = branchRefusal(branch);
  if (refusal !== null) {
    console.error(`lane:close: ${refusal}`);
    return EXIT_CANNOT_ANSWER;
  }

  // Which engine did this prove? A pinned release-less lane has to say, before anything runs.
  let engine: EngineFacts;
  try {
    engine = readFacts();
  } catch (error) {
    console.error(`lane:close: cannot read the installed engine mode: ${(error as Error).message}`);
    return EXIT_CANNOT_ANSWER;
  }
  const evidence = pinEvidence(engine, args.pin);
  if (evidence.refusal !== null) {
    console.error(`lane:close: ${evidence.refusal}`);
    return EXIT_CANNOT_ANSWER;
  }
  const pin = evidence.sha;
  if (pin !== null) console.log(`lane:close: ${branch} — engine pinned ${pin.slice(0, 12)}, named in the PR body`);

  console.log(`lane:close: ${branch} — verify:fast`);
  const verified = spawnSync("bun", ["run", "verify:fast"], { cwd: root, stdio: "inherit" });
  if (verified.status !== 0) {
    console.error(`lane:close: verify:fast failed (exit ${verified.status ?? 1}); nothing landed`);
    return EXIT_FAILED;
  }

  const before = git(["status", "--porcelain", "--untracked-files=all"]).stdout;
  const changed = lines(git(["diff", "--name-only", `${DIFF}...HEAD`]).stdout);
  const pr = openPr(branch);

  if (args.dryRun) {
    console.log(`lane:close: dry run — ${changed.length} committed file(s) against ${DIFF}, ${lines(before).length} uncommitted`);
    for (const line of lines(before)) console.log(`  uncommitted  ${line}`);
    console.log(
      `lane:close: engine ${engine.installed}${pin === null ? " — published, so the body names no commit" : ` — the PR body will carry "Engine pin: ${pin.slice(0, 12)}"`}`,
    );
    console.log(`lane:close: would commit ${lines(before).length} path(s), push ${branch}, ${pr === null ? "open the PR into " + TARGET : `update PR #${pr.number}`} and arm auto-merge`);
    return EXIT_CLOSED;
  }

  const added = git(["add", "-A"]);
  if (added.status !== 0) {
    console.error(`lane:close: git add failed: ${added.stderr.trim()}`);
    return EXIT_FAILED;
  }
  const staged = lines(git(["diff", "--cached", "--name-only"]).stdout);
  const guarded = guardStaged(staged, args.allow);
  if (guarded.length > 0) {
    console.error("lane:close: these files would land and should not:");
    for (const item of guarded) console.error(`  ${item.path}  (${item.why})`);
    console.error("lane:close: remove them from the commit, or keep one on purpose with --allow <path>");
    git(["reset"]);
    return EXIT_GUARDED;
  }

  if (staged.length > 0) {
    const message = args.message ?? pr?.title;
    if (message === undefined) {
      console.error('lane:close: nothing named this change. Pass -m "<subject>" (or have the PR already open)');
      git(["reset"]);
      return EXIT_CANNOT_ANSWER;
    }
    const commit = git(["commit", "-m", message]);
    if (commit.status !== 0) {
      console.error(`lane:close: git commit failed: ${commit.stderr.trim()}`);
      return EXIT_FAILED;
    }
    console.log(`lane:close: committed ${staged.length} file(s)`);
  } else {
    console.log("lane:close: nothing uncommitted to add");
  }

  const pushed = git(["push", "-u", "origin", branch], true);
  if (pushed.status !== 0) {
    console.error(`lane:close: git push failed (exit ${pushed.status}); the lane is not closed`);
    return EXIT_FAILED;
  }

  let number = pr?.number ?? null;
  let url = pr?.url ?? "";
  if (number === null) {
    const problem = seamProblem(args.seam);
    if (problem !== null) {
      console.error(`lane:close: ${problem}`);
      return EXIT_CANNOT_ANSWER;
    }
    const title = args.message ?? branch;
    const dir = mkdtempSync(join(tmpdir(), "lane-close-"));
    const bodyFile = join(dir, "body.md");
    const body = prBody(title, args.seam!.trim(), `\`bun run verify:fast\` passed (${changed.length} committed file(s) against ${DIFF})`, pin ?? undefined);
    // The body this command is about to write is the evidence `check:engine-mode` reads:
    // judging it here means a lane cannot open a PR whose own gate rejects it.
    const verdict = checkEngineMode(engine, body);
    if (!verdict.ok) {
      console.error(`lane:close: ${verdict.message}`);
      rmSync(dir, { recursive: true, force: true });
      return EXIT_CANNOT_ANSWER;
    }
    writeFileSync(bodyFile, body);
    const created = gh(["pr", "create", "--base", TARGET, "--head", branch, "--title", title, "--body-file", bodyFile]);
    rmSync(dir, { recursive: true, force: true });
    if (created.status !== 0) {
      console.error(`lane:close: gh pr create failed: ${created.stderr.trim()}`);
      return EXIT_FAILED;
    }
    const opened = openPr(branch);
    if (opened === null) {
      console.error(`lane:close: pushed ${branch} but cannot read the PR it opened`);
      return EXIT_CANNOT_ANSWER;
    }
    number = opened.number;
    url = opened.url;
  }

  // A pinned lane updating an existing PR still owes the commit: an older body predates the pin.
  if (pin !== null) {
    const current = gh(["pr", "view", String(number), "--json", "body"]);
    if (current.status === 0) {
      try {
        const body = (JSON.parse(current.stdout) as { body?: string }).body ?? "";
        if (!checkEngineMode(engine, body).ok) {
          const dir = mkdtempSync(join(tmpdir(), "lane-close-pin-"));
          const file = join(dir, "body.md");
          writeFileSync(file, withPinLine(body, pin));
          const edited = gh(["pr", "edit", String(number), "--body-file", file]);
          rmSync(dir, { recursive: true, force: true });
          if (edited.status === 0) console.log(`lane:close: PR #${number} body now names pinned ${pin.slice(0, 12)}`);
          else console.error(`lane:close: could not add the Engine pin line to PR #${number}: ${edited.stderr.trim()}`);
        }
      } catch {
        // A body that is not JSON is left for the gate to name in CI.
      }
    }
  }

  const armed = gh(["pr", "merge", String(number), "--auto", "--merge"]);
  if (armed.status !== 0) {
    console.error(`lane:close: could not arm auto-merge on #${number}: ${armed.stderr.trim()}`);
    console.error(`lane:close: the PR is open at ${url}; arm it when its checks allow`);
    return EXIT_FAILED;
  }

  console.log(`lane:close: PR #${number} armed for auto-merge — ${url}`);
  console.log(`lane:close: checks: bun run ci:status --pr ${number}`);
  return EXIT_CLOSED;
}

if (import.meta.main) {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`lane:close: ${(error as Error).message}`);
    process.exit(EXIT_CANNOT_ANSWER);
  }
  if (!existsSync(join(root, "package.json"))) {
    console.error(`lane:close: ${root} is not this repository`);
    process.exit(EXIT_CANNOT_ANSWER);
  }
  process.exit(close(args));
}
