/**
 * Link this workspace's installed `@jgengine/*` to engine source.
 *
 *   bun run engine:sync                          link the build of engine-ref.txt (the one engine games use; scripts/engine-ref.ts)
 *   bun run engine:local [--dir <engine path>]   link a live checkout while editing the engine (never lands: check:engine-mode refuses it)
 *   bun run engine:status [--json]               one line: mode, engine commit, staleness
 *
 * Each installed `@jgengine/*` entry (root, per-game and bun's store copy) is replaced
 * with a junction to the engine package, so every consumer and every transitive import
 * resolves to engine source. The catalog in package.json only gives `bun install`
 * entries to replace; its npm version is never what a game runs. The catalog and
 * bun.lock are never edited, so installs stay `--frozen-lockfile` and git stays clean.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const root = join(import.meta.dir, "..");
const statePath = join(root, ".engine-mode");
const scope = "@jgengine/";
const skipDirs = new Set([".git", ".claude", ".engine-mode.baseline", ".scratch", "shots"]);

export type Mode = "local" | "published" | "pinned";

export interface EngineState {
  mode: Mode;
  /** Short engine commit, with `+N` when packages/ has N uncommitted files. */
  engine?: string;
  /** The engine checkout this workspace was switched from, in every mode. */
  path?: string;
  /** Pinned mode: the ref asked for and the cached snapshot directory. */
  ref?: string;
  snapshot?: string;
  /** Engine package versions at link time (local, pinned) or the catalog version (published). */
  versions?: Record<string, string>;
  switchedAt?: string;
}

export function readRootPackage(): Record<string, any> {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

/**
 * The engine's unscoped CLI package. Its subpath modules (`jgengine/templates/captureArgs`,
 * `jgengine/gameShape`) own the rules this repo's checks read, so it links like the scoped ones.
 */
const CLI_PACKAGE = "jgengine";

/** An engine package this workspace links to engine source: every `@jgengine/*` plus the CLI. */
export function isEnginePackage(name: string): boolean {
  return name.startsWith(scope) || name === CLI_PACKAGE;
}

export function catalogPackages(pkg = readRootPackage()): string[] {
  const catalog = (pkg.workspaces?.catalog ?? {}) as Record<string, string>;
  return Object.keys(catalog).filter(isEnginePackage);
}

/** The engine `packages/<dir>` a package is built from. */
export function dirName(name: string): string {
  return name === CLI_PACKAGE ? CLI_PACKAGE : name.slice(scope.length);
}

export function readState(): EngineState | null {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as EngineState;
  } catch {
    return null;
  }
}

export function writeState(state: EngineState): void {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/** Uncommitted files under engine `packages/`, which a live link sees immediately. */
export function engineDirtyFiles(enginePath: string): string[] {
  return git(enginePath, ["status", "--porcelain", "--", "packages"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Short commit plus a dirty count for engine `packages/`, which is what a lane should report. */
export function engineCommit(enginePath: string): string {
  const head = git(enginePath, ["rev-parse", "--short", "HEAD"]);
  if (head === "") return "unknown";
  const dirty = engineDirtyFiles(enginePath).length;
  return dirty === 0 ? head : `${head}+${dirty}`;
}

export function resolveEngine(explicit?: string): string {
  const candidates = [explicit, process.env.JGENGINE_DIR, join(root, "..", "jgengine"), "C:/Users/Jk101/Projects/jgengine"];
  const commonDir = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (commonDir !== "") candidates.push(join(commonDir, "..", "..", "jgengine"));
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === "" || candidate === "undefined") continue;
    const path = resolve(candidate);
    if (existsSync(join(path, "packages", "core", "package.json"))) return path;
  }
  throw new Error(`no engine checkout found; pass --dir <path> (tried ${candidates.filter(Boolean).join(", ")})`);
}

export function enginePackagePath(enginePath: string, name: string): string {
  return join(enginePath, "packages", dirName(name));
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function samePath(a: string, b: string): boolean {
  const normal = (path: string) => path.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
  return normal(a) === normal(b);
}

export function isInside(path: string, dir: string): boolean {
  const normal = (value: string) => value.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
  const child = normal(path);
  const parent = normal(dir);
  return child === parent || child.startsWith(`${parent}/`);
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Every installed copy of `name` that bun can resolve from: root, each game and the store. */
export function installedEntries(name: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.name === "node_modules") {
        const candidate = join(path, ...name.split("/"));
        if (isLink(candidate) && existsSync(join(candidate, "package.json"))) found.push(candidate);
        else if (dir !== root && existsSync(join(candidate, "package.json"))) found.push(candidate);
        walk(path);
        continue;
      }
      walk(path);
    }
  };
  walk(root);
  return found;
}

export interface LinkCheck {
  name: string;
  /** Each installed copy and where it really resolves. */
  sites: { path: string; resolved: string | null }[];
  expected: string;
  ok: boolean;
}

export function linkChecks(packagesRoot: string): LinkCheck[] {
  return catalogPackages().map((name) => {
    const expected = realpathOrNull(join(packagesRoot, dirName(name))) ?? join(packagesRoot, dirName(name));
    const sites = installedEntries(name).map((path) => ({ path, resolved: realpathOrNull(path) }));
    const ok = sites.length > 0 && sites.every((site) => site.resolved !== null && samePath(site.resolved, expected));
    return { name, sites, expected, ok };
  });
}

/**
 * Replace every installed copy of each catalog package — root, per-game and bun's
 * store copy — with a junction to `targetOf(name)`, and count the sites touched.
 */
export function linkCatalog(targetOf: (name: string) => string): number {
  let linked = 0;
  for (const name of catalogPackages()) {
    const target = targetOf(name);
    for (const path of installedEntries(name)) {
      const resolved = realpathOrNull(path);
      if (resolved !== null && samePath(resolved, target)) {
        linked += 1;
        continue;
      }
      dropEntry(path);
      symlinkSync(target, path, "junction");
      linked += 1;
    }
  }
  return linked;
}

function newestMtime(dir: string, extensions: RegExp): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(path, extensions));
    else if (extensions.test(entry.name)) newest = Math.max(newest, statMtime(path));
  }
  return newest;
}

function statMtime(path: string): number {
  try {
    return lstatSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

export interface StaleReport {
  name: string;
  stale: boolean;
  reason: string;
  /** Seconds by which source is newer than the newest built file. */
  behindSeconds: number;
}

/** Per package: is any source newer than the newest file the build wrote? */
export function staleness(enginePath: string): StaleReport[] {
  return catalogPackages().map((name) => {
    const pkg = enginePackagePath(enginePath, name);
    const source = Math.max(newestMtime(join(pkg, "src"), /\.(ts|tsx)$/), statMtime(join(pkg, "package.json")));
    const built = newestMtime(join(pkg, "dist"), /\.(js|d\.ts)$/);
    if (built === 0) return { name, stale: true, reason: "no dist", behindSeconds: 0 };
    const behind = Math.round((source - built) / 1000);
    return { name, stale: behind > 1, reason: behind > 1 ? "source newer than dist" : "fresh", behindSeconds: Math.max(0, behind) };
  });
}

function age(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function currentMode(): Mode {
  const checks = catalogPackages().flatMap((name) => installedEntries(name));
  if (checks.length === 0) return "published";
  const state = readState();
  const resolved = checks.map(realpathOrNull).filter((path): path is string => path !== null);
  if (state?.snapshot !== undefined && resolved.some((path) => isInside(path, join(state.snapshot!, "packages")))) return "pinned";
  if (state?.path !== undefined && resolved.some((path) => isInside(path, join(state.path!, "packages")))) return "local";
  return "published";
}

/** One line naming the mode, the engine, and what that mode can see. */
export function statusLine(): { line: string; ok: boolean; state: unknown } {
  const pkg = readRootPackage();
  const catalogVersions = Object.fromEntries(
    Object.entries((pkg.workspaces?.catalog ?? {}) as Record<string, string>).filter(([name]) => isEnginePackage(name)),
  );
  const state = readState();
  const mode = currentMode();

  if (mode === "published") {
    const versions = catalogPackages().map((name) => {
      const site = installedEntries(name)[0];
      const installed = site === undefined ? null : JSON.parse(readFileSync(join(site, "package.json"), "utf8")).version;
      return { name, installed, catalog: catalogVersions[name] };
    });
    const mismatched = versions.filter((entry) => entry.installed !== entry.catalog);
    const ok = mismatched.length === 0;
    return {
      line: ok
        ? `engine published ${catalogVersions[catalogPackages()[0]!] ?? "?"} — from the registry; no live or uncommitted engine code can reach this lane`
        : `engine published — MISMATCH: ${mismatched.map((entry) => `${entry.name} ${entry.installed} != catalog ${entry.catalog}`).join(", ")} (run bun run engine:sync)`,
      ok,
      state: { mode, catalogVersions, versions },
    };
  }

  const enginePath = state?.path ?? (() => {
    try {
      return resolveEngine();
    } catch {
      return "(unknown)";
    }
  })();
  const dirty = existsSync(join(enginePath, "packages")) ? engineDirtyFiles(enginePath) : [];

  if (mode === "pinned") {
    const snapshot = state?.snapshot ?? "(unknown)";
    const links = existsSync(join(snapshot, "packages")) ? linkChecks(join(snapshot, "packages")) : [];
    const broken = links.filter((check) => !check.ok);
    const ignored = dirty.length === 0 ? "" : `; ${dirty.length} uncommitted live file${dirty.length === 1 ? "" : "s"} ignored`;
    if (!existsSync(join(snapshot, "packages")) || broken.length > 0) {
      const first = broken[0];
      return {
        line: `engine pinned ${state?.engine ?? "?"} — BROKEN: ${first === undefined ? `${snapshot} is gone` : `${first.name} resolves to ${first.sites.find((site) => !site.ok)?.resolved ?? "nothing"}`} (run bun run engine:sync)`,
        ok: false,
        state: { mode, engine: state?.engine, ref: state?.ref, snapshot, path: enginePath, dirty: dirty.length, broken },
      };
    }
    return {
      line: `engine pinned ${state?.engine ?? "?"} (immutable snapshot ${snapshot}) — live checkout ${enginePath} is not linked${ignored}`,
      ok: true,
      state: {
        mode,
        engine: state?.engine,
        ref: state?.ref,
        snapshot,
        path: enginePath,
        dirty: dirty.length,
        links: links.map((check) => ({ name: check.name, sites: check.sites.length })),
      },
    };
  }

  // Live mode changes with the checkout, so the commit is read now, never from link time.
  const commit = existsSync(join(enginePath, "packages")) ? engineCommit(enginePath) : (state?.engine ?? "unknown");
  const links = linkChecks(join(enginePath, "packages"));
  const broken = links.filter((check) => !check.ok);
  if (broken.length > 0) {
    const first = broken[0]!;
    const site = first.sites.find((entry) => entry.resolved === null || !samePath(entry.resolved, first.expected));
    return {
      line: `engine local (live, sees uncommitted edits) ${commit} ${enginePath} — BROKEN: ${first.name} at ${site?.path ?? "?"} resolves to ${site?.resolved ?? "nothing"} (run bun run engine:local)`,
      ok: false,
      state: { mode, engine: commit, path: enginePath, dirty: dirty.length, broken },
    };
  }
  const stale = staleness(enginePath).filter((report) => report.stale);
  const dirtyNote =
    dirty.length === 0
      ? ""
      : ` — WARNING: ${dirty.length} uncommitted file${dirty.length === 1 ? "" : "s"} under packages/ ${dirty.length === 1 ? "is" : "are"} live in this lane, so a failing check may not match any commit`;
  if (stale.length > 0) {
    const named = stale.slice(0, 4).map((report) => `${dirName(report.name)}(${report.reason === "no dist" ? "no dist" : `+${age(report.behindSeconds)}`})`);
    const more = stale.length > 4 ? ` +${stale.length - 4} more` : "";
    return {
      line: `engine local (live, sees uncommitted edits) ${commit} ${enginePath} — STALE: ${named.join(", ")}${more} (run bun run engine:watch)${dirtyNote}`,
      ok: false,
      state: { mode, engine: commit, path: enginePath, dirty: dirty.length, stale },
    };
  }
  return {
    line: `engine local (live, sees uncommitted edits) ${commit} ${enginePath} — fresh, ${links.length} packages linked across ${links.reduce((total, check) => total + check.sites.length, 0)} install sites${dirtyNote}`,
    ok: true,
    state: { mode, engine: commit, path: enginePath, dirty: dirty.length, links: links.map((check) => ({ name: check.name, sites: check.sites.length })) },
  };
}

function run(command: string, args: string[], cwd: string): number {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
}

function dropEntry(path: string): void {
  if (isLink(path)) {
    rmSync(path);
    return;
  }
  // A real store directory: move it aside rather than delete it, so publish can restore it.
  renameSync(path, `${path}.published`);
}

/** Store directories parked by local mode, restored by `bun install` on the way back. */
function parkedStoreCopies(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      if (entry.name.endsWith(".published")) found.push(path);
      else walk(path);
    }
  };
  if (existsSync(join(root, "node_modules"))) walk(join(root, "node_modules"));
  return found;
}

function linkLocal(args: string[]): number {
  const dirArg = args.find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length) ?? args[args.indexOf("--dir") + 1];
  const enginePath = resolveEngine(args.includes("--dir") || dirArg !== undefined ? dirArg : undefined);
  const names = catalogPackages();

  const missing = names.filter((name) => !existsSync(join(enginePackagePath(enginePath, name), "package.json")));
  if (missing.length > 0) {
    console.error(`engine:local: ${enginePath} has no ${missing.join(", ")}; is that the engine repo?`);
    return 1;
  }
  const unbuilt = names.filter((name) => {
    const dist = join(enginePackagePath(enginePath, name), "dist");
    return !existsSync(dist) || readdirSync(dist).length === 0;
  });
  if (unbuilt.length > 0) {
    console.error(`engine:local: ${enginePath} has no dist for ${unbuilt.join(", ")}; build it first (cd ${enginePath} && bun install && bun run build)`);
    return 1;
  }
  if (names.some((name) => installedEntries(name).length === 0)) {
    console.log("engine:local: installing the published packages first");
    if (run("bun", ["install", "--frozen-lockfile"], root) !== 0) return 1;
  }

  const started = Date.now();
  const versions: Record<string, string> = {};
  for (const name of names) {
    versions[name] = JSON.parse(readFileSync(join(enginePackagePath(enginePath, name), "package.json"), "utf8")).version;
  }
  const linked = linkCatalog((name) => enginePackagePath(enginePath, name));

  const broken = linkChecks(join(enginePath, "packages")).filter((check) => !check.ok);
  if (broken.length > 0) {
    for (const check of broken) console.error(`engine:local: ${check.name} -> ${check.sites.map((site) => site.resolved).join(", ")} (expected ${check.expected})`);
    return 1;
  }

  const commit = engineCommit(enginePath);
  writeState({ mode: "local", engine: commit, path: enginePath, versions, switchedAt: new Date().toISOString() });
  const stale = staleness(enginePath).filter((report) => report.stale);
  console.log(
    `engine local ${commit} <- ${enginePath}: ${linked} install sites linked in ${((Date.now() - started) / 1000).toFixed(1)}s` +
      (stale.length > 0 ? ` (stale dist: ${stale.map((report) => dirName(report.name)).join(", ")} — run bun run engine:watch)` : " (dist fresh)"),
  );
  return 0;
}

/**
 * The part of the root manifest an install can change: the catalog and every dependency
 * field. A lane that adds a script or edits prose keeps the same surface, so `engine:published`
 * does not mistake its own worktree for leftover link state.
 */
export function installSurface(manifest: Record<string, any>): string {
  const workspaces = (manifest.workspaces ?? {}) as Record<string, any>;
  const picked = {
    catalog: workspaces.catalog ?? {},
    dependencies: manifest.dependencies ?? {},
    devDependencies: manifest.devDependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
    optionalDependencies: manifest.optionalDependencies ?? {},
    overrides: manifest.overrides ?? {},
    resolutions: manifest.resolutions ?? {},
  };
  return JSON.stringify(picked);
}

export function publish(): number {
  const state = readState();
  const started = Date.now();
  const names = catalogPackages();
  /** Where local or pinned mode linked from, so each link comes out again. */
  const linkedRoots = [state?.snapshot === undefined ? null : join(state.snapshot, "packages"), state?.path === undefined ? null : join(state.path, "packages")].filter(
    (value): value is string => value !== null,
  );
  let removed = 0;
  for (const name of names) {
    for (const path of installedEntries(name)) {
      const resolved = realpathOrNull(path);
      if (resolved !== null && linkedRoots.some((linkedRoot) => isInside(resolved, linkedRoot))) {
        dropEntry(path);
        removed += 1;
      }
    }
  }
  for (const path of parkedStoreCopies()) {
    rmSync(path, { recursive: true, force: true });
  }
  if (run("bun", ["install", "--frozen-lockfile"], root) !== 0) {
    console.error("engine:published: bun install --frozen-lockfile failed");
    return 1;
  }

  const catalogVersions = Object.fromEntries(
    Object.entries((readRootPackage().workspaces?.catalog ?? {}) as Record<string, string>).filter(([name]) => isEnginePackage(name)),
  );
  const wrong = catalogPackages().filter((name) =>
    installedEntries(name).some((path) => {
      const installed = JSON.parse(readFileSync(join(path, "package.json"), "utf8")).version;
      const resolved = realpathOrNull(path);
      const stillLinked = resolved !== null && linkedRoots.some((linkedRoot) => isInside(resolved, linkedRoot));
      return installed !== catalogVersions[name] || stillLinked;
    }),
  );
  if (wrong.length > 0) {
    console.error(`engine:published: ${wrong.join(", ")} did not come back from the registry`);
    return 1;
  }

  const lockDiff = spawnSync("git", ["diff", "--stat", "--", "bun.lock"], { cwd: root, encoding: "utf8" });
  const dirtyLock = (lockDiff.stdout ?? "").trim();
  const head = spawnSync("git", ["show", "HEAD:package.json"], { cwd: root, encoding: "utf8" });
  let catalogDrift = "";
  try {
    const committed = JSON.parse((head.stdout ?? "").trim()) as Record<string, any>;
    if (installSurface(committed) !== installSurface(readRootPackage())) catalogDrift = "package.json catalog or dependencies";
  } catch {
    // A root manifest git cannot answer for is not evidence of a leftover link.
  }
  if (dirtyLock !== "" || catalogDrift !== "") {
    console.error(
      `engine:published: ${[catalogDrift, dirtyLock === "" ? "" : "bun.lock"].filter((part) => part !== "").join(" and ")} differ from the committed bytes:\n${[catalogDrift === "" ? "" : "package.json", dirtyLock].filter((part) => part !== "").join("\n")}`,
    );
    return 1;
  }
  writeState({ mode: "published", versions: catalogVersions, switchedAt: new Date().toISOString() });
  const version = catalogVersions[catalogPackages()[0]!] ?? "?";
  console.log(
    `engine published ${version}: ${removed} links removed and reinstalled from the registry in ${((Date.now() - started) / 1000).toFixed(1)}s; package.json and bun.lock match the committed bytes`,
  );
  return 0;
}

function main(): number {
  const [command, ...args] = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || command === undefined) {
    console.log(
      "bun run engine:sync [--dir <engine path>] | bun run engine:bump [--ref <sha>] | bun run engine:local [--dir <engine path>] | bun run engine:snapshots [--prune <sha|all>] | bun run engine:status [--json]",
    );
    return command === undefined ? 2 : 0;
  }
  if (command === "local") return linkLocal(args);
  if (command === "published") return publish();
  if (command === "status") {
    const report = statusLine();
    console.log(args.includes("--json") ? JSON.stringify(report.state) : report.line);
    return report.ok ? 0 : 1;
  }
  if (command === "pin" || command === "snapshots") {
    console.error(`engine-mode: ${command} lives in scripts/engine-pin.ts — run bun run engine:${command}`);
    return 2;
  }
  console.error("engine-mode: pass local, published or status");
  return 2;
}

if (import.meta.main) process.exit(main());
