/**
 * Fails a lane or CI run whose installed engine is not the build of `engine-ref.txt`.
 *
 * Games build, test and run against one engine: the beta commit `engine-ref.txt` names,
 * linked by `bun run engine:sync`. A live `engine:local` link, a registry install or a
 * snapshot of another commit would prove a different engine than the one beta runs.
 *
 *   bun run check:engine-mode
 *
 * Exit 0 agrees, 1 disagrees.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readSnapshotMarker } from "./engine-pin";
import { catalogPackages, currentMode, installedEntries, readState, type Mode } from "./engine-mode";
import { readEngineRef } from "./engine-ref";

export type Verdict = { ok: boolean; message: string };

export interface EngineFacts {
  /** What is installed now, read from the links rather than the state file. */
  installed: Mode;
  /** What `.engine-mode` recorded when the lane switched; null when it has none. */
  recorded: Mode | null;
  /** The version every installed `@jgengine/*` copy reports, by package. */
  installedVersions: { name: string; version: string }[];
  /** The commit the linked snapshot was built from, from its own marker. */
  pinned: { sha: string; short: string } | null;
}

const SYNC = "run bun run engine:sync";

/** The gate's whole rule: the linked snapshot is the build of the ref, nothing else. */
export function checkEngineMode(facts: EngineFacts, ref: string): Verdict {
  const short = ref.slice(0, 12);
  if (facts.recorded !== null && facts.recorded !== facts.installed) {
    return { ok: false, message: `engine mode: FAIL - .engine-mode records ${facts.recorded} but ${facts.installed} is installed (${SYNC})` };
  }
  if (facts.installed === "local") {
    return {
      ok: false,
      message: `engine mode: FAIL - engine:local links a live checkout and proves no commit; land the engine change on engine beta, point engine-ref.txt at it and ${SYNC}`,
    };
  }
  if (facts.installed === "published") {
    return {
      ok: false,
      message: `engine mode: FAIL - @jgengine/* is the registry install, not engine source ${short} (${SYNC})`,
    };
  }
  if (facts.pinned === null) {
    return { ok: false, message: `engine mode: FAIL - the linked snapshot has no identity marker (${SYNC})` };
  }
  if (facts.pinned.sha.toLowerCase() !== ref.toLowerCase()) {
    return {
      ok: false,
      message: `engine mode: FAIL - engine-ref.txt names ${short} but the linked build is ${facts.pinned.sha.slice(0, 12)} (${SYNC})`,
    };
  }
  return { ok: true, message: `engine mode: OK - engine source ${short} (engine-ref.txt) is linked` };
}

/** Reads what is installed now: detection from the links, identity from the snapshot marker. */
export function readFacts(): EngineFacts {
  const state = readState();
  const installedVersions = catalogPackages().map((name) => {
    const site = installedEntries(name)[0];
    const version = site === undefined ? "missing" : (JSON.parse(readFileSync(join(site, "package.json"), "utf8")).version as string);
    return { name, version };
  });
  const marker = state?.snapshot === undefined ? null : readSnapshotMarker(state.snapshot);
  return {
    installed: currentMode(),
    recorded: state?.mode ?? null,
    installedVersions,
    pinned: marker === null ? null : { sha: marker.sha, short: marker.short },
  };
}

export interface CliDeps {
  readFacts?: () => EngineFacts;
  readRef?: () => string;
}

export function runCli(log: (line: string) => void, deps: CliDeps = {}): number {
  let ref: string;
  try {
    ref = (deps.readRef ?? readEngineRef)();
  } catch (error) {
    log(`engine mode: FAIL - ${(error as Error).message}`);
    return 1;
  }
  const verdict = checkEngineMode((deps.readFacts ?? readFacts)(), ref);
  log(verdict.message);
  return verdict.ok ? 0 : 1;
}

if (import.meta.main) process.exit(runCli(console.log));
