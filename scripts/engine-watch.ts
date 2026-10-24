/**
 * Rebuild engine packages from the local checkout as their sources change, so a
 * game's dev server or `bun test` sees an edit with no publish.
 *
 *   bun run engine:watch
 *
 * Runs in local mode only (`bun run engine:local` first). Each package rebuilds
 * through its own `build` script, which is what a release uses.
 */
import { watch } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  catalogPackages,
  currentMode,
  dirName,
  enginePackagePath,
  linkChecks,
  readState,
  resolveEngine,
  staleness,
} from "./engine-mode";

const DEBOUNCE_MS = 120;
const state = readState();
const enginePath = state?.mode === "local" && state.path !== undefined ? state.path : resolveEngine();

if (currentMode() !== "local") {
  console.error("engine:watch: the workspace is in published mode — run bun run engine:local first");
  process.exit(1);
}
const broken = linkChecks(enginePath).filter((check) => !check.ok);
if (broken.length > 0) {
  console.error(`engine:watch: ${broken[0]!.name} does not resolve inside ${enginePath} — rerun bun run engine:local`);
  process.exit(1);
}

const names = catalogPackages();
const pending = new Map<string, NodeJS.Timeout>();
const queue: string[] = [];
let building = false;
let built = 0;

function build(name: string): void {
  const dir = dirName(name);
  const started = Date.now();
  const result = spawnSync("bun", [`--cwd=packages/${dir}`, "run", "build"], { cwd: enginePath, encoding: "utf8" });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`[engine:watch] ${dir} build failed (${elapsed}s)\n${result.stdout ?? ""}${result.stderr ?? ""}`);
    return;
  }
  built += 1;
  const staleLeft = staleness(enginePath).filter((report) => report.stale);
  console.log(`[engine:watch] ${dir} rebuilt in ${elapsed}s (${built} rebuild${built === 1 ? "" : "s"}, ${staleLeft.length === 0 ? "dist fresh" : `stale: ${staleLeft.map((report) => dirName(report.name)).join(", ")}`})`);
}

function drain(): void {
  if (building) return;
  const name = queue.shift();
  if (name === undefined) return;
  building = true;
  try {
    build(name);
  } finally {
    building = false;
    drain();
  }
}

function schedule(name: string): void {
  const running = pending.get(name);
  if (running !== undefined) clearTimeout(running);
  pending.set(
    name,
    setTimeout(() => {
      pending.delete(name);
      if (!queue.includes(name)) queue.push(name);
      drain();
    }, DEBOUNCE_MS),
  );
}

const staleAtStart = staleness(enginePath).filter((report) => report.stale);
for (const report of staleAtStart) queue.push(report.name);
console.log(
  `[engine:watch] ${enginePath}: watching ${names.length} packages, debounce ${DEBOUNCE_MS}ms` +
    (staleAtStart.length > 0 ? `; building stale: ${staleAtStart.map((report) => dirName(report.name)).join(", ")}` : ""),
);
drain();

for (const name of names) {
  const src = `${enginePackagePath(enginePath, name)}/src`.replaceAll("\\", "/");
  watch(src, { recursive: true }, (_event, file) => {
    if (file === null || !/\.(ts|tsx)$/.test(file)) return;
    schedule(name);
  });
}

process.on("SIGINT", () => {
  console.log(`[engine:watch] stopped after ${built} rebuild${built === 1 ? "" : "s"}`);
  process.exit(0);
});
