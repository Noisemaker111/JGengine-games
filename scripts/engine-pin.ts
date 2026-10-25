/**
 * Build one committed engine ref into an immutable cached snapshot and link every
 * installed `@jgengine/*` to it. `bun run engine:sync` drives this with the commit in
 * engine-ref.txt; edits in the live engine checkout cannot reach the snapshot.
 *
 *   bun run engine:snapshots                  # what is cached, and what is linked
 *   bun run engine:snapshots --prune <sha>    # delete one commit's snapshots
 *   bun run engine:snapshots --prune all      # delete the whole cache
 *
 * The build comes from `git archive <commit>` extracted into a temporary tree, so only
 * committed bytes are compiled. The result is cached under the user's local app data
 * (or JGENGINE_SNAPSHOT_DIR), keyed by the commit and a hash of its build inputs, so
 * lanes on one commit pay one build.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  catalogPackages,
  currentMode,
  dirName,
  engineDirtyFiles,
  installedEntries,
  isEnginePackage,
  linkCatalog,
  linkChecks,
  type LinkCheck,
  publish,
  readRootPackage,
  readState,
  resolveEngine,
  root,
  statusLine,
  writeState,
} from "./engine-mode";

/** Bump when the snapshot layout or the build recipe changes; old caches stop matching. */
export const SCHEMA = 2;
const ENGINE_SCOPE = "@jgengine/";

interface SnapshotPackage {
  dir: string;
  name: string;
  version: string;
}

export interface SnapshotMarker {
  schema: number;
  sha: string;
  short: string;
  ref: string;
  inputs: string;
  engine: string;
  bun: string;
  builtAt: string;
  buildSeconds: number;
  packages: SnapshotPackage[];
}

function cacheRoot(): string {
  const override = process.env.JGENGINE_SNAPSHOT_DIR;
  if (override !== undefined && override !== "") return resolve(override);
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "jgengine-snapshots");
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "jgengine-snapshots");
}

function option(args: string[], name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function spawn(command: string, args: string[], cwd: string): { status: number; output: string } {
  // No shell: PowerShell/cmd would eat `^` in `rev-parse <ref>^{commit}` and split on `:` in `show <commit>:<path>`.
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function gitValue(enginePath: string, args: string[]): string {
  const result = spawn("git", args, enginePath);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${enginePath}: ${result.output.trim()}`);
  return result.output.trim();
}

function resolveCommit(enginePath: string, ref: string): string {
  const result = spawn("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], enginePath);
  if (result.status !== 0 || result.output.trim() === "") {
    throw new Error(`${enginePath} has no commit for "${ref}"; pass --ref <sha|branch|tag>`);
  }
  return result.output.trim();
}

function bunVersion(): string {
  const result = spawn("bun", ["--version"], root);
  return result.status === 0 ? result.output.trim() : "unknown";
}

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Commit plus the inputs that decide what a build produces. The commit's own tree
 * hash covers every byte the build reads; the bun version and the recipe cover the
 * toolchain, so a cache entry built another way is never silently reused.
 */
function inputsHash(enginePath: string, commit: string, packages: SnapshotPackage[]): string {
  const tree = gitValue(enginePath, ["rev-parse", `${commit}^{tree}`]);
  return sha(
    [
      `schema=${SCHEMA}`,
      `tree=${tree}`,
      `bun=${bunVersion()}`,
      `packages=${packages.map((entry) => `${entry.dir}@${entry.version}`).join(",")}`,
    ].join("\n"),
  );
}

export function snapshotId(commit: string, inputs: string): string {
  return `${commit.slice(0, 8)}-${inputs.slice(0, 8)}`;
}

/** Every package under `packages/` in the extracted tree, by name. */
function readPackages(tree: string): { byName: Map<string, SnapshotPackage>; deps: Map<string, string[]> } {
  const byName = new Map<string, SnapshotPackage>();
  const deps = new Map<string, string[]>();
  const base = join(tree, "packages");
  if (!existsSync(base)) throw new Error(`${tree} has no packages/; is that an engine commit?`);
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(base, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, any>;
    if (typeof manifest.name !== "string") continue;
    byName.set(manifest.name, { dir: entry.name, name: manifest.name, version: String(manifest.version ?? "0.0.0") });
    const names = Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) }).filter(isEnginePackage);
    deps.set(manifest.name, names);
  }
  return { byName, deps };
}

/** The catalog's packages plus the @jgengine packages they need, dependencies first. */
function buildOrder(tree: string, wanted: string[]): SnapshotPackage[] {
  const { byName, deps } = readPackages(tree);
  const order: SnapshotPackage[] = [];
  const seen = new Set<string>();
  const visit = (name: string, trail: string[]): void => {
    if (seen.has(name)) return;
    if (trail.includes(name)) throw new Error(`@jgengine dependency cycle: ${[...trail, name].join(" -> ")}`);
    const pkg = byName.get(name);
    if (pkg === undefined) return;
    for (const dep of deps.get(name) ?? []) visit(dep, [...trail, name]);
    seen.add(name);
    order.push(pkg);
  };
  for (const name of wanted) {
    if (!byName.has(name)) throw new Error(`that engine commit has no ${name}; pass --ref <sha|branch>`);
    visit(name, []);
  }
  return order;
}

function markerPath(dir: string): string {
  return join(dir, "snapshot.json");
}

function readMarker(dir: string): SnapshotMarker | null {
  const path = markerPath(dir);
  if (!existsSync(path)) return null;
  try {
    const marker = JSON.parse(readFileSync(path, "utf8")) as SnapshotMarker;
    return marker;
  } catch {
    return null;
  }
}

/** The commit a finished snapshot was built from, for anything that must name it. */
export function readSnapshotMarker(dir: string): SnapshotMarker | null {
  return readMarker(dir);
}

/** A marker alone is not enough: every package it names has to be there with a built dist. */
export function snapshotValid(dir: string): boolean {
  const marker = readMarker(dir);
  if (marker === null || marker.schema !== SCHEMA) return false;
  if (!existsSync(join(dir, "node_modules", ".bun"))) return false;
  return marker.packages.every((pkg) => {
    const packageDir = join(dir, "packages", pkg.dir);
    const dist = join(packageDir, "dist");
    return existsSync(join(packageDir, "package.json")) && existsSync(dist) && readdirSync(dist).length > 0;
  });
}

/**
 * Windows' own bsdtar: Git Bash's GNU tar comes first on PATH there, reads "C:\..." as a
 * remote host and cannot create the engine's skill symlinks. Paths stay relative either way.
 */
function tarCommand(): string {
  const system = join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe");
  return process.platform === "win32" && existsSync(system) ? system : "tar";
}

function buildSnapshot(options: { enginePath: string; commit: string; short: string; ref: string; target: string; inputs: string }): number {
  const { enginePath, commit, short, target, inputs, ref } = options;
  mkdirSync(cacheRoot(), { recursive: true });
  const work = mkdtempSync(join(cacheRoot(), `.build-${short}-`));
  const started = Date.now();
  try {
    const archive = join(work, "tree.tar");
    gitValue(enginePath, ["archive", "--format=tar", `--output=${archive}`, commit]);
    const tree = join(work, "tree");
    mkdirSync(tree);
    const extract = spawn(tarCommand(), ["-xf", basename(archive), "-C", basename(tree)], work);
    if (extract.status !== 0) throw new Error(`tar could not extract ${commit}: ${extract.output.trim()}`);

    const install = ["install", ...(existsSync(join(tree, "bun.lock")) ? ["--frozen-lockfile"] : [])];
    let installed = spawn("bun", install, tree);
    if (installed.status !== 0 && install.includes("--frozen-lockfile")) {
      installed = spawn("bun", ["install"], tree);
    }
    if (installed.status !== 0) throw new Error(`bun install failed in the ${short} snapshot:\n${installed.output.trim()}`);
    console.log(`[engine:pin] ${short}: install ${((Date.now() - started) / 1000).toFixed(1)}s`);

    // Dependencies first: a package builds against the dist of the ones it imports.
    const packages = buildOrder(tree, catalogPackages());
    for (const pkg of packages) {
      const at = Date.now();
      const built = spawn("bun", [`--cwd=packages/${pkg.dir}`, "run", "build"], tree);
      if (built.status !== 0) throw new Error(`${pkg.name} build failed at ${commit}:\n${built.output.trim()}`);
      console.log(`[engine:pin] ${short}: ${pkg.dir} built in ${((Date.now() - at) / 1000).toFixed(1)}s`);
    }

    // Keep the install beside the packages: a linked package resolves its imports from
    // its real path in the cache, so @jgengine/* and react/three have to be there.
    // Bun hardlinks from its store, so this costs less disk than its reported size.
    for (const entry of readdirSync(tree)) {
      if (entry === "packages" || entry === "node_modules" || entry === "package.json" || entry === "bun.lock") continue;
      rmSync(join(tree, entry), { recursive: true, force: true });
    }
    for (const pkg of packages) {
      const packageDir = join(tree, "packages", pkg.dir);
      rmSync(join(packageDir, "src"), { recursive: true, force: true });
      for (const entry of readdirSync(packageDir)) {
        if (/^tsconfig.*\.json$/.test(entry)) rmSync(join(packageDir, entry), { force: true });
      }
    }

    const marker: SnapshotMarker = {
      schema: SCHEMA,
      sha: commit,
      short,
      ref,
      inputs,
      engine: enginePath,
      bun: bunVersion(),
      builtAt: new Date().toISOString(),
      buildSeconds: Math.round((Date.now() - started) / 100) / 10,
      packages,
    };
    writeFileSync(markerPath(tree), `${JSON.stringify(marker, null, 2)}\n`);

    rmSync(target, { recursive: true, force: true });
    renameSync(tree, target);
    return marker.buildSeconds;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function ensureInstalled(): boolean {
  if (catalogPackages().every((name) => installedEntries(name).length > 0)) return true;
  console.log("[engine:pin] installing the published packages first");
  return spawn("bun", ["install", "--frozen-lockfile"], root).status === 0;
}

function reportBroken(broken: LinkCheck[]): void {
  for (const check of broken) {
    console.error(`[engine:pin] ${check.name} -> ${check.sites.map((site) => site.resolved ?? "nothing").join(", ")} (expected ${check.expected})`);
  }
}

function pin(args: string[]): number {
  const started = Date.now();
  const version = option(args, "--version");
  if (version !== undefined) return pinPublished(version);

  const dir = option(args, "--dir");
  let enginePath: string;
  try {
    enginePath = resolveEngine(dir);
  } catch (error) {
    console.error(`engine:pin: ${(error as Error).message}`);
    return 3;
  }

  const ref = option(args, "--ref") ?? "HEAD";
  let commit: string;
  try {
    commit = resolveCommit(enginePath, ref);
  } catch (error) {
    console.error(`engine:pin: ${(error as Error).message}`);
    return 3;
  }
  const short = commit.slice(0, 8);
  const wanted = catalogPackages();

  // The package list and versions come from the commit, not the working tree.
  let packages: SnapshotPackage[];
  try {
    const listed = gitValue(enginePath, ["ls-tree", "--name-only", `${commit}:packages`]).split("\n").filter((line) => line !== "");
    packages = wanted.map((name) => {
      const dirNameOfPackage = dirName(name);
      if (!listed.includes(dirNameOfPackage)) throw new Error(`${commit} has no packages/${dirNameOfPackage} (needed for ${name})`);
      const manifest = JSON.parse(gitValue(enginePath, ["show", `${commit}:packages/${dirNameOfPackage}/package.json`])) as Record<string, any>;
      return { dir: dirNameOfPackage, name, version: String(manifest.version ?? "0.0.0") };
    });
  } catch (error) {
    console.error(`engine:pin: ${(error as Error).message}`);
    return 3;
  }

  const inputs = inputsHash(enginePath, commit, packages);
  const target = join(cacheRoot(), snapshotId(commit, inputs));
  const reused = snapshotValid(target);

  let built: number | null = null;
  if (!reused) {
    try {
      built = buildSnapshot({ enginePath, commit, short, ref, target, inputs });
    } catch (error) {
      console.error(`engine:pin: ${(error as Error).message}`);
      return 1;
    }
  }

  if (!ensureInstalled()) {
    console.error("engine:pin: bun install --frozen-lockfile failed");
    return 1;
  }
  const linked = linkCatalog((name) => join(target, "packages", dirName(name)));
  const broken = linkChecks(join(target, "packages")).filter((check) => !check.ok);
  if (broken.length > 0) {
    reportBroken(broken);
    return 1;
  }

  writeState({
    mode: "pinned",
    engine: short,
    ref,
    path: enginePath,
    snapshot: target,
    versions: Object.fromEntries(packages.map((pkg) => [pkg.name, pkg.version])),
    switchedAt: new Date().toISOString(),
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    built === null
      ? `engine pin ${short.slice(0, 7)} — reused snapshot (${elapsed}s; ${linked} install sites linked)`
      : `engine pin ${short.slice(0, 7)} — built snapshot in ${built}s (${linked} install sites linked, ${elapsed}s total)`,
  );
  const dirty = engineDirtyFiles(enginePath);
  console.log(
    `  snapshot ${target}\n  live checkout ${enginePath} is not linked${dirty.length === 0 ? "" : ` (its ${dirty.length} uncommitted file${dirty.length === 1 ? "" : "s"} are invisible here)`}`,
  );
  return 0;
}

/** A published version keeps the catalog install; this never invents a second tag path. */
function pinPublished(version: string): number {
  const catalog = (readRootPackage().workspaces?.catalog ?? {}) as Record<string, string>;
  const locked = catalog[`${ENGINE_SCOPE}core`];
  if (locked !== version) {
    console.error(
      `engine:pin --version ${version}: the root catalog locks ${locked}. A published SDK version is adopted by changing the catalog and bun install (a reviewable patch), not by a mode switch.\n` +
        `  bun run engine:pin --version ${locked}   # the published build this workspace already locks`,
    );
    return 2;
  }
  const code = publish();
  if (code !== 0) return code;
  const report = statusLine();
  console.log(`engine pin published ${version} — ${report.line}`);
  return report.ok ? 0 : 1;
}

function packageSize(dir: string): number {
  return directorySize(join(dir, "packages"));
}

function directorySize(dir: string): number {
  let total = 0;
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else
        try {
          total += statSync(child).size;
        } catch {
          // a file that vanished mid-count does not change the answer
        }
    }
  };
  walk(dir);
  return total;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function ago(iso: string): string {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return "unknown";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function snapshots(args: string[]): number {
  const cache = cacheRoot();
  mkdirSync(cache, { recursive: true });
  const entries = readdirSync(cache, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(cache, entry.name));

  const pruneArg = option(args, "--prune");
  if (pruneArg !== undefined) return pruneSnapshots(entries, pruneArg, args.includes("--force"));

  const state = readState();
  const active = state?.snapshot;
  if (entries.length === 0) {
    console.log(`engine snapshots: none cached in ${cache} (bun run engine:pin caches one per commit)`);
    return 0;
  }
  const total = entries.reduce((sum, dir) => sum + packageSize(dir), 0);
  console.log(`engine snapshots: ${entries.length} in ${cache} (${megabytes(total)} of package builds; dependencies are hardlinked from bun's store)`);
  for (const dir of entries.sort((a, b) => a.localeCompare(b))) {
    const marker = readMarker(dir);
    const pkg = marker?.packages.find((entry) => entry.name === `${ENGINE_SCOPE}core`) ?? marker?.packages[0];
    const linked = active !== undefined && resolve(active).toLowerCase() === resolve(dir).toLowerCase();
    console.log(
      `  ${basename(dir)}  ${megabytes(packageSize(dir)).padStart(6)}  ${marker === null ? "no marker" : `built ${ago(marker.builtAt)}, v${pkg?.version ?? "?"}`}${
        linked ? "  <- linked here" : ""
      }`,
    );
  }
  console.log(`  prune one: bun run engine:snapshots --prune <sha>   all: --prune all`);
  return 0;
}

function pruneSnapshots(entries: string[], want: string, force: boolean): number {
  const state = readState();
  const active = state?.snapshot === undefined ? null : resolve(state.snapshot).toLowerCase();
  const matches = entries.filter((dir) => {
    if (want === "all") return true;
    const marker = readMarker(dir);
    return basename(dir).startsWith(want) || (marker !== null && (marker.sha.startsWith(want) || marker.short.startsWith(want) || marker.ref === want));
  });
  if (matches.length === 0) {
    console.error(`engine:snapshots: nothing cached matches ${want}`);
    return 1;
  }
  const activeMatch = matches.find((dir) => resolve(dir).toLowerCase() === active);
  if (activeMatch !== undefined && !force) {
    console.error(
      `engine:snapshots: ${basename(activeMatch)} is linked here (${currentMode()} mode); switch first with bun run engine:published, or pass --force to leave the links dangling`,
    );
    return 1;
  }
  let bytes = 0;
  for (const dir of matches) {
    bytes += packageSize(dir);
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`engine snapshots: pruned ${matches.length} snapshot${matches.length === 1 ? "" : "s"} (${megabytes(bytes)}) from ${cacheRoot()}`);
  return 0;
}

function main(): number {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || args.includes("--help") || args.includes("-h")) {
    console.log(
      "bun run engine:pin [--ref <sha|branch>] [--version <x.y.z>] [--dir <engine path>]\n" +
        "bun run engine:snapshots [--prune <sha|all>] [--force]",
    );
    return command === undefined ? 2 : 0;
  }
  if (command === "pin") return pin(args);
  if (command === "snapshots") return snapshots(args);
  console.error("engine-pin: pass pin or snapshots");
  return 2;
}

if (import.meta.main) process.exit(main());
