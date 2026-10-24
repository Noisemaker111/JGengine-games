/**
 * This branch's change, checked by the gates and the games it reaches, in seconds.
 *
 *   bun run verify:fast                # the loop while iterating
 *   bun run verify:fast --full         # every gate CI runs plus every game's types and tests
 *   bun run verify:fast --plan         # the steps and their commands, nothing run
 *   bun run verify:fast --base <ref>   # diff against another ref (default: origin/beta)
 *
 * The engine's `verify:fast` maps its diff to its own packages; this repository has no
 * packages, so the map is a game directory: a change under `<game>/` runs that game's
 * `check-types` and `test`, a change under `scripts/` runs the scripts' tests, and the
 * static gates run when they can reach the change. Assets are provisioned first, as CI
 * does: a worktree with its packs takes under a second, a first pull about 30 s. A changed
 * runtime file that no step reaches is reported and fails (exit 2) rather than passing silently.
 *
 * Exit: 0 verified, 1 a step failed, 2 a changed runtime file reached no step.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BASE = "origin/beta";
export const EXIT_VERIFIED = 0;
export const EXIT_FAILED = 1;
export const EXIT_UNATTRIBUTED = 2;

const root = join(import.meta.dir, "..");

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
/** Files a gate never reads: prose, manifests and media. A docs-only change verifies nothing. */
const NOT_SOURCE = /\.(md|mdx|txt|json|jsonc|ya?ml|lock|css|html|png|jpe?g|webp|svg|gif|glb|gltf|mp3|ogg|wav|woff2?)$/i;
const ROOT_SCRIPTS = /^scripts\/[^/]+\.[cm]?ts$/;

export interface Workspace {
  dir: string;
  checkTypes: boolean;
  test: boolean;
}

export interface Step {
  name: string;
  command: string[];
}

export interface Plan {
  changed: string[];
  steps: Step[];
  /** Changed runtime files no selected step reaches. */
  unattributed: string[];
}

const posix = (path: string): string => path.replaceAll("\\", "/");

function names(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Everything this branch changed against `base`: committed, staged, unstaged and untracked. */
export function changedFiles(repo: string, base: string = BASE): string[] {
  const out = new Set<string>();
  const add = (args: string[]): void => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${(result.stderr ?? "").trim()}`);
    for (const path of names(result.stdout ?? "")) out.add(path);
  };
  add(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
  add(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]);
  add(["diff", "--name-only", "--diff-filter=ACMR"]);
  add(["ls-files", "--others", "--exclude-standard"]);
  return [...out].sort();
}

/** Every workspace the root manifest globs in, with the scripts it has to run. */
export function workspaces(repo: string = root): Workspace[] {
  const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
  };
  const globs = Array.isArray(manifest.workspaces) ? manifest.workspaces : (manifest.workspaces?.packages ?? []);
  const dirs: string[] = [];
  for (const glob of globs) {
    // `*` and `<parent>/*` name every child directory; anything else is a literal path.
    const parent = glob === "*" ? "" : glob.endsWith("/*") ? glob.slice(0, -2) : null;
    if (parent === null) {
      dirs.push(glob);
      continue;
    }
    const base = parent.length === 0 ? repo : join(repo, parent);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      dirs.push(parent.length === 0 ? entry.name : `${parent}/${entry.name}`);
    }
  }
  return dirs
    .filter((dir) => existsSync(join(repo, dir, "package.json")))
    .map((dir) => {
      const pkg = JSON.parse(readFileSync(join(repo, dir, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      return {
        dir: posix(dir),
        checkTypes: typeof pkg.scripts?.["check-types"] === "string",
        test: typeof pkg.scripts?.["test"] === "string",
      };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/** The workspace that owns a path: the longest `dir/` prefix, or null for a root file. */
export function workspaceOf(path: string, all: readonly Workspace[]): Workspace | null {
  let found: Workspace | null = null;
  for (const workspace of all) {
    if (path === workspace.dir || path.startsWith(`${workspace.dir}/`)) {
      if (found === null || workspace.dir.length > found.dir.length) found = workspace;
    }
  }
  return found;
}

/** A file whose behavior a step is expected to reach: source, not a test, declaration or asset. */
export function isRuntimeSource(path: string): boolean {
  return SOURCE_FILE.test(path) && !TEST_FILE.test(path) && !NOT_SOURCE.test(path) && !/\.d\.[cm]?ts$/.test(path);
}

function gate(name: string, ...args: string[]): Step {
  return { name, command: ["bun", ...args] };
}

/** `bun --cwd <dir>` prints usage and exits 0 without running anything; only `--cwd=<dir>` runs. */
function workspaceGate(name: string, dir: string, script: string): Step {
  return gate(name, `--cwd=${dir}`, "run", script);
}

/**
 * The steps that reach `changed`. Gates run only where a change can reach them: the
 * framework gates read game source, the capability gate reads a ledger or the installed
 * packages, and a game's own scripts read its files.
 */
export function buildPlan(changed: readonly string[], all: readonly Workspace[], base: string = BASE): Plan {
  const files = [...changed];
  const gameSource = files.filter((path) => isRuntimeSource(path) && workspaceOf(path, all) !== null);
  const scriptsSource = files.filter((path) => ROOT_SCRIPTS.test(path) || (path.startsWith("scripts/") && isRuntimeSource(path)));
  const affected = new Set<string>();
  for (const path of files) {
    if (NOT_SOURCE.test(path)) continue;
    const workspace = workspaceOf(path, all);
    if (workspace !== null) affected.add(workspace.dir);
  }
  const ledgers = files.some(
    (path) => path === "package.json" || path === "bun.lock" || path.endsWith("capabilities.json"),
  );
  // The catalog lives in the root manifest and lockfile: a change there changes the SDK every
  // game compiles against, so every game's types are checked.
  const catalog = files.some((path) => path === "package.json" || path === "bun.lock");
  if (catalog) for (const workspace of all) affected.add(workspace.dir);

  const steps: Step[] = [];
  if (affected.size > 0) steps.push(gate("provision", "run", "provision"));
  if (gameSource.length > 0) {
    steps.push(gate("check:framework", "run", "check:framework", "--", "--base", base));
    steps.push(gate("check:module-globals", "run", "check:module-globals"));
  }
  if (ledgers) steps.push(gate("check:capabilities", "run", "check:capabilities"));
  if (scriptsSource.length > 0) steps.push(gate("scripts test", "test", "scripts"));
  const reached = new Set<string>();
  for (const dir of [...affected].sort()) {
    const workspace = all.find((candidate) => candidate.dir === dir);
    if (workspace === undefined) continue;
    if (workspace.checkTypes) {
      steps.push(workspaceGate(`${dir} check-types`, dir, "check-types"));
      reached.add(dir);
    }
    if (workspace.test) {
      steps.push(workspaceGate(`${dir} test`, dir, "test"));
      reached.add(dir);
    }
  }

  const unattributed = gameSource.filter((path) => {
    const workspace = workspaceOf(path, all);
    return workspace === null || !reached.has(workspace.dir);
  });
  return { changed: files, steps, unattributed };
}

/** What CI runs, plus every game's types and tests: the run before a release, not the loop. */
export function fullPlan(all: readonly Workspace[], base: string = BASE): Plan {
  const steps: Step[] = [
    gate("provision", "run", "provision"),
    gate("check:framework", "run", "check:framework", "--", "--base", base),
    gate("check:seam-line", "run", "check:seam-line"),
    gate("check:module-globals", "run", "check:module-globals"),
    gate("check:capabilities", "run", "check:capabilities"),
    gate("scripts test", "test", "scripts"),
  ];
  for (const workspace of all) {
    if (workspace.checkTypes) steps.push(workspaceGate(`${workspace.dir} check-types`, workspace.dir, "check-types"));
    if (workspace.test) steps.push(workspaceGate(`${workspace.dir} test`, workspace.dir, "test"));
  }
  return { changed: [], steps, unattributed: [] };
}

function run(step: Step): { ok: boolean; ms: number; output: string } {
  const started = Date.now();
  const result = spawnSync(step.command[0]!, step.command.slice(1), {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { ok: result.status === 0, ms: Date.now() - started, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function main(argv: readonly string[]): number {
  const baseIndex = argv.indexOf("--base");
  const base = baseIndex >= 0 ? (argv[baseIndex + 1] ?? BASE) : BASE;
  const planOnly = argv.includes("--plan");
  const full = argv.includes("--full");
  const started = Date.now();

  let all: Workspace[];
  let plan: Plan;
  try {
    all = workspaces();
    plan = full
      ? fullPlan(all, base)
      : buildPlan(changedFiles(root, base), all, base);
  } catch (error) {
    console.error(`verify:fast: ${(error as Error).message}`);
    return EXIT_FAILED;
  }

  if (planOnly) {
    for (const path of plan.changed) console.log(`  changed  ${path}`);
    for (const step of plan.steps) console.log(`  step     ${step.name}  (${step.command.join(" ")})`);
    for (const path of plan.unattributed) console.log(`  no step reaches  ${path}`);
    return plan.unattributed.length === 0 ? EXIT_VERIFIED : EXIT_UNATTRIBUTED;
  }

  if (plan.steps.length === 0) {
    console.log(`verify:fast against ${base}: nothing changed that a gate or a game reaches.`);
    return EXIT_VERIFIED;
  }
  console.log(`verify:fast against ${base}: ${plan.changed.length} changed file(s), ${plan.steps.length} step(s)`);

  const failures: string[] = [];
  for (const step of plan.steps) {
    const result = run(step);
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${step.name}  ${(result.ms / 1000).toFixed(1)}s`);
    if (!result.ok) {
      failures.push(step.name);
      if (result.output.length > 0) console.log(result.output);
    }
  }
  const seconds = (Date.now() - started) / 1000;
  console.log(`\ntotal ${seconds.toFixed(1)}s — ${plan.steps.length - failures.length} passed, ${failures.length} failed`);

  if (failures.length > 0) {
    console.log("failed: " + failures.join(", "));
    return EXIT_FAILED;
  }
  if (plan.unattributed.length > 0) {
    console.error(`verify:fast cannot reach ${plan.unattributed.length} changed file(s):`);
    for (const path of plan.unattributed) console.error(`  ${path}`);
    return EXIT_UNATTRIBUTED;
  }
  return EXIT_VERIFIED;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
