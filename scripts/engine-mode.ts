/**
 * Point this workspace's installed `@jgengine/*` at a local engine checkout, or back
 * at the published catalog, so engine work is tested here without a release.
 *
 *   bun run engine:local [--dir <engine path>]   link every @jgengine/* to that checkout
 *   bun run engine:published                     restore the published install
 *   bun run engine:status [--json]               one line: mode, engine commit, staleness
 *
 * Local mode replaces each installed `@jgengine/*` entry — root, per-game and bun's
 * store copy — with a junction to the engine package, so every consumer and every
 * transitive import resolves to the checkout. The root catalog and bun.lock are never
 * edited, so both modes install with `--frozen-lockfile` and `git status` stays clean.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const root = join(import.meta.dir, "..");
const statePath = join(root, ".engine-mode");
const scope = "@jgengine/";
const skipDirs = new Set([".git", ".claude", ".engine-mode.baseline", ".scratch", "shots"]);

export type Mode = "local" | "published";

export interface EngineState {
  mode: Mode;
  /** Short engine commit, with `+N` when packages/ has N uncommitted files. */
  engine?: string;
  path?: string;
  /** Engine package versions at link time (local) or the catalog version (published). */
  versions?: Record<string, string>;
  switchedAt?: string;
}

export function readRootPackage(): Record<string, any> {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

export function catalogPackages(pkg = readRootPackage()): string[] {
  const catalog = (pkg.workspaces?.catalog ?? {}) as Record<string, string>;
  return Object.keys(catalog).filter((name) => name.startsWith(scope));
}

export function dirName(name: string): string {
  return name.slice(scope.length);
}

export function readState(): EngineState | null {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as EngineState;
  } catch {
    return null;
  }
}

function writeState(state: EngineState): void {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/** Short commit plus a dirty count for engine `packages/`, which is what a lane should report. */
export function engineCommit(enginePath: string): string {
  const head = git(enginePath, ["rev-parse", "--short", "HEAD"]);
  if (head === "") return "unknown";
  const dirty = git(enginePath, ["status", "--porcelain", "--", "packages"]).split("\n").filter((line) => line !== "").length;
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

export function linkChecks(enginePath: string): LinkCheck[] {
  return catalogPackages().map((name) => {
    const expected = realpathOrNull(enginePackagePath(enginePath, name)) ?? enginePackagePath(enginePath, name);
    const sites = installedEntries(name).map((path) => ({ path, resolved: realpathOrNull(path) }));
    const ok = sites.length > 0 && sites.every((site) => site.resolved !== null && samePath(site.resolved, expected));
    return { name, sites, expected, ok };
  });
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
  const enginePath = state?.path;
  const linked = checks.some((path) => {
    const resolved = realpathOrNull(path);
    return resolved !== null && enginePath !== undefined && resolved.replaceAll("\\", "/").toLowerCase().startsWith(enginePath.replaceAll("\\", "/").toLowerCase());
  });
  return linked ? "local" : "published";
}

/** One line naming the mode, the engine, and whether the linked dist answers the current source. */
export function statusLine(): { line: string; ok: boolean; state: unknown } {
  const pkg = readRootPackage();
  const catalogVersions = Object.fromEntries(
    Object.entries((pkg.workspaces?.catalog ?? {}) as Record<string, string>).filter(([name]) => name.startsWith(scope)),
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
        ? `engine published ${catalogVersions[catalogPackages()[0]!] ?? "?"} — installed matches the catalog`
        : `engine published — MISMATCH: ${mismatched.map((entry) => `${entry.name} ${entry.installed} != catalog ${entry.catalog}`).join(", ")} (run bun run engine:published)`,
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
  const commit = state?.engine ?? (existsSync(enginePath) ? engineCommit(enginePath) : "unknown");
  const links = linkChecks(enginePath);
  const broken = links.filter((check) => !check.ok);
  if (broken.length > 0) {
    const first = broken[0]!;
    const site = first.sites.find((entry) => entry.resolved === null || !samePath(entry.resolved, first.expected));
    return {
      line: `engine local ${commit} ${enginePath} — BROKEN: ${first.name} at ${site?.path ?? "?"} resolves to ${site?.resolved ?? "nothing"} (run bun run engine:local)`,
      ok: false,
      state: { mode, engine: commit, path: enginePath, broken },
    };
  }
  const stale = staleness(enginePath).filter((report) => report.stale);
  if (stale.length > 0) {
    const named = stale.slice(0, 4).map((report) => `${dirName(report.name)}(${report.reason === "no dist" ? "no dist" : `+${age(report.behindSeconds)}`})`);
    const more = stale.length > 4 ? ` +${stale.length - 4} more` : "";
    return {
      line: `engine local ${commit} ${enginePath} — STALE: ${named.join(", ")}${more} (run bun run engine:watch)`,
      ok: false,
      state: { mode, engine: commit, path: enginePath, stale },
    };
  }
  return {
    line: `engine local ${commit} ${enginePath} — fresh, ${links.length} packages linked across ${links.reduce((total, check) => total + check.sites.length, 0)} install sites`,
    ok: true,
    state: { mode, engine: commit, path: enginePath, links: links.map((check) => ({ name: check.name, sites: check.sites.length })) },
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
  let linked = 0;
  for (const name of names) {
    const enginePackage = enginePackagePath(enginePath, name);
    versions[name] = JSON.parse(readFileSync(join(enginePackage, "package.json"), "utf8")).version;
    for (const path of installedEntries(name)) {
      const resolved = realpathOrNull(path);
      if (resolved !== null && samePath(resolved, enginePackage)) {
        linked += 1;
        continue;
      }
      dropEntry(path);
      symlinkSync(enginePackage, path, "junction");
      linked += 1;
    }
  }

  const broken = linkChecks(enginePath).filter((check) => !check.ok);
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

function publish(): number {
  const state = readState();
  const started = Date.now();
  const names = catalogPackages();
  let removed = 0;
  for (const name of names) {
    const enginePackage = state?.path === undefined ? null : enginePackagePath(state.path, name);
    for (const path of installedEntries(name)) {
      const resolved = realpathOrNull(path);
      if (resolved !== null && enginePackage !== null && samePath(resolved, enginePackage)) {
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
    Object.entries((readRootPackage().workspaces?.catalog ?? {}) as Record<string, string>).filter(([name]) => name.startsWith(scope)),
  );
  const wrong = catalogPackages().filter((name) =>
    installedEntries(name).some((path) => {
      const installed = JSON.parse(readFileSync(join(path, "package.json"), "utf8")).version;
      const resolved = realpathOrNull(path);
      const stillLinked = state?.path !== undefined && resolved !== null && samePath(resolved, enginePackagePath(state.path, name));
      return installed !== catalogVersions[name] || stillLinked;
    }),
  );
  if (wrong.length > 0) {
    console.error(`engine:published: ${wrong.join(", ")} did not come back from the registry`);
    return 1;
  }

  const diff = spawnSync("git", ["diff", "--stat", "--", "package.json", "bun.lock"], { cwd: root, encoding: "utf8" });
  const dirty = (diff.stdout ?? "").trim();
  if (dirty !== "") {
    console.error(`engine:published: package.json / bun.lock differ from the committed bytes:\n${dirty}`);
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
    console.log("bun run engine:local [--dir <engine path>] | bun run engine:published | bun run engine:status [--json]");
    return command === undefined ? 2 : 0;
  }
  if (command === "local") return linkLocal(args);
  if (command === "published") return publish();
  if (command === "status") {
    const report = statusLine();
    console.log(args.includes("--json") ? JSON.stringify(report.state) : report.line);
    return report.ok ? 0 : 1;
  }
  console.error("engine-mode: pass local, published or status");
  return 2;
}

if (import.meta.main) process.exit(main());
