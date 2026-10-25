/**
 * The one engine these games build, test and run against: the engine `beta` commit named
 * in `engine-ref.txt`. Locally and in CI every `@jgengine/*` resolves to a build of that
 * commit's source, so a games change never waits on an npm release.
 *
 *   bun run engine:sync [--dir <engine path>]     build and link the commit in engine-ref.txt
 *   bun run engine:bump [--ref <sha>] [--dir ...]  move engine-ref.txt to engine beta's tip (or <sha>), then sync
 *   bun run check:engine-ref                       the ref is a full sha on engine beta (CI; uses gh)
 *
 * A change that needs newer engine code moves the ref in the same PR. CI's `engine-bump`
 * workflow moves it on its own when engine beta moves.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveEngine, root } from "./engine-mode";

export const REF_FILE = join(root, "engine-ref.txt");
export const ENGINE_REPO = "Noisemaker111/jgengine";
export const ENGINE_URL = `https://github.com/${ENGINE_REPO}.git`;
const FULL_SHA = /^[0-9a-f]{40}$/;

/** The sha in the ref file's text, or why the text is not one. */
export function parseEngineRef(text: string): { sha: string | null; problem: string | null } {
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry !== "" && !entry.startsWith("#"));
  if (line === undefined) return { sha: null, problem: "engine-ref.txt names no commit" };
  const sha = line.toLowerCase();
  if (!FULL_SHA.test(sha)) return { sha: null, problem: `engine-ref.txt holds "${line}", not a full 40-character engine commit sha` };
  return { sha, problem: null };
}

export function readEngineRef(path = REF_FILE): string {
  if (!existsSync(path)) throw new Error(`${path} is missing; run bun run engine:bump`);
  const parsed = parseEngineRef(readFileSync(path, "utf8"));
  if (parsed.sha === null) throw new Error(parsed.problem!);
  return parsed.sha;
}

export function writeEngineRef(sha: string, path = REF_FILE): void {
  const parsed = parseEngineRef(sha);
  if (parsed.sha === null) throw new Error(parsed.problem!);
  writeFileSync(path, `${parsed.sha}\n`);
}

/**
 * GitHub's compare status from the ref to engine beta: `identical` or `ahead` means beta
 * contains the ref; anything else means the ref is off beta (an unmerged branch, a typo).
 */
export function onBetaVerdict(sha: string, status: string | null): { ok: boolean; line: string } {
  if (status === "identical" || status === "ahead") {
    return { ok: true, line: `engine-ref: OK - ${sha.slice(0, 12)} is on engine beta (${status})` };
  }
  return {
    ok: false,
    line:
      status === null
        ? `engine-ref: FAIL - could not compare ${sha.slice(0, 12)} with engine beta on ${ENGINE_REPO}`
        : `engine-ref: FAIL - ${sha.slice(0, 12)} is not on engine beta (compare says ${status}); merge the engine change first, then point engine-ref.txt at a beta commit`,
  };
}

function run(command: string, args: string[], cwd: string, inherit = false): { status: number; stdout: string } {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
  return { status: result.status ?? 1, stdout: (result.stdout ?? "").trim() };
}

function option(args: string[], name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function betaTip(): string {
  const listed = run("git", ["ls-remote", ENGINE_URL, "refs/heads/beta"], root);
  const sha = listed.stdout.split(/\s+/)[0] ?? "";
  if (listed.status !== 0 || !FULL_SHA.test(sha)) throw new Error(`could not read engine beta from ${ENGINE_URL}`);
  return sha;
}

/** Make sure the engine checkout has the commit, fetching just that commit when it does not. */
function ensureCommit(enginePath: string, sha: string): boolean {
  if (run("git", ["cat-file", "-e", `${sha}^{commit}`], enginePath).status === 0) return true;
  console.log(`[engine:sync] fetching ${sha.slice(0, 12)} into ${enginePath}`);
  if (run("git", ["fetch", "--quiet", ENGINE_URL, sha], enginePath, true).status !== 0) return false;
  return run("git", ["cat-file", "-e", `${sha}^{commit}`], enginePath).status === 0;
}

export function sync(args: string[]): number {
  let sha: string;
  let enginePath: string;
  try {
    sha = readEngineRef();
    enginePath = resolveEngine(option(args, "--dir"));
  } catch (error) {
    console.error(`engine:sync: ${(error as Error).message}`);
    return 3;
  }
  if (!ensureCommit(enginePath, sha)) {
    console.error(`engine:sync: ${enginePath} cannot fetch engine commit ${sha}`);
    return 1;
  }
  return run("bun", [join(import.meta.dir, "engine-pin.ts"), "pin", "--ref", sha, "--dir", enginePath], root, true).status;
}

function bump(args: string[]): number {
  let sha: string;
  try {
    const asked = option(args, "--ref");
    sha = asked === undefined ? betaTip() : asked.toLowerCase();
    writeEngineRef(sha);
  } catch (error) {
    console.error(`engine:bump: ${(error as Error).message}`);
    return 3;
  }
  console.log(`engine:bump: engine-ref.txt -> ${sha}`);
  if (args.includes("--no-sync")) return 0;
  return sync(args.filter((arg, index) => arg !== "--ref" && args[index - 1] !== "--ref"));
}

function check(): number {
  let sha: string;
  try {
    sha = readEngineRef();
  } catch (error) {
    console.error(`engine-ref: FAIL - ${(error as Error).message}`);
    return 1;
  }
  const compared = run("gh", ["api", `repos/${ENGINE_REPO}/compare/${sha}...beta`, "--jq", ".status"], root);
  const verdict = onBetaVerdict(sha, compared.status === 0 ? compared.stdout : null);
  console.log(verdict.line);
  return verdict.ok ? 0 : 1;
}

function main(): number {
  const [command, ...args] = process.argv.slice(2);
  if (command === "sync") return sync(args);
  if (command === "bump") return bump(args);
  if (command === "check") return check();
  if (command === "show") {
    console.log(readEngineRef());
    return 0;
  }
  console.error("engine-ref: pass sync, bump, check or show");
  return 2;
}

if (import.meta.main) process.exit(main());
