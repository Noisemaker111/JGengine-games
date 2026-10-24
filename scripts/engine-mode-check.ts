/**
 * Fails a lane whose evidence and installed engine disagree about which engine it proved.
 *
 * The question that cost a lane four hours: "which engine did this prove?" A lane in
 * pinned or local mode has installed a build that the catalog does not describe, so the
 * PR body has to name the commit; a lane in published mode proves the catalog build, and
 * any installed package that differs from the catalog version is a half-restored link.
 *
 *   bun run check:engine-mode [--body-file <path>] [--body "<text>"]
 *
 * The body comes from `--body-file`, then `--body`, then `$GITHUB_EVENT_PATH`
 * (`pull_request.body`). Exit 0 agrees, 1 disagrees, 3 no body to judge in pinned mode.
 *
 * Accepted evidence line (one line, case-sensitive, no leading whitespace):
 *   Engine pin: <7-40 hex characters of the pinned engine commit>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readSnapshotMarker } from "./engine-pin";
import { catalogPackages, currentMode, installedEntries, readRootPackage, readState, type Mode } from "./engine-mode";
import { bodyFromEvent } from "./seam-line-check";

export type Verdict = { ok: boolean; message: string };

/** The one line a pinned lane writes in its PR body. */
export const PIN_LINE = /^Engine pin:/;
/** A commit prefix shorter than this is ambiguous in the engine's log. */
export const MIN_SHA = 7;
const SHA = /^[0-9a-f]{7,40}$/;

export const ACCEPTED_FORM = '"Engine pin: <7-40 hex characters of the pinned engine commit>"';

export function pinLine(sha: string): string {
  return `Engine pin: ${sha.slice(0, 12)}`;
}

/** The commit a PR body claims, and why the claim is unusable when it is. */
export function namedCommit(body: string | undefined): { sha: string | null; problem: string | null } {
  if (body === undefined) return { sha: null, problem: "there is no PR body to check" };
  const line = body.split(/\r?\n/).find((entry) => PIN_LINE.test(entry));
  if (line === undefined) return { sha: null, problem: `no "Engine pin: " line; add ${ACCEPTED_FORM}` };
  const value = line.slice(line.indexOf(":") + 1).trim();
  if (value.length === 0) return { sha: null, problem: `the Engine pin line is empty; add ${ACCEPTED_FORM}` };
  const sha = value.split(/[\s(]/)[0]!.toLowerCase();
  if (!SHA.test(sha) || sha.length < MIN_SHA) {
    return { sha: null, problem: `"${value}" is not a commit sha; add ${ACCEPTED_FORM}` };
  }
  return { sha, problem: null };
}

export interface EngineFacts {
  /** What is installed now, read from the links rather than the state file. */
  installed: Mode;
  /** What `.engine-mode` recorded when the lane switched; null when it has none. */
  recorded: Mode | null;
  /** The catalog version the root manifest names. */
  catalogVersion: string;
  /** The version every installed `@jgengine/*` copy reports, by package. */
  installedVersions: { name: string; version: string }[];
  /** Pinned mode: the commit the linked snapshot was built from, from its own marker. */
  pinned: { sha: string; short: string } | null;
}

/**
 * The gate's whole rule, decided from facts so the tests drive the same path the lane does.
 * Pinned and local modes prove a commit the catalog does not name, so the body must name it;
 * published mode proves the catalog build, so every installed package must be that version.
 */
export function checkEngineMode(facts: EngineFacts, body: string | undefined): Verdict {
  const { installed, recorded, catalogVersion } = facts;

  if (recorded !== null && recorded !== installed) {
    return {
      ok: false,
      message:
        `engine mode: FAIL - .engine-mode records ${recorded} but ${installed} is what is installed, ` +
        `so this lane cannot say which engine it proved (run bun run engine:status, then bun run engine:published or bun run engine:pin --ref <sha>)`,
    };
  }

  if (installed === "local") {
    return {
      ok: false,
      message:
        "engine mode: FAIL - local mode links a live checkout and sees uncommitted edits, so it proves no commit; " +
        "pin the commit you proved with bun run engine:pin --ref <sha> and name it in the PR",
    };
  }

  if (installed === "pinned") {
    if (facts.pinned === null) {
      return {
        ok: false,
        message: `engine mode: FAIL - the pinned snapshot has no readable identity marker, so the commit it was built from cannot be named (run bun run engine:pin --ref <sha>)`,
      };
    }
    const { sha, short } = facts.pinned;
    const named = namedCommit(body);
    if (named.problem !== null) {
      return { ok: false, message: `engine mode: FAIL - pinned ${short}: ${named.problem}` };
    }
    if (!sha.toLowerCase().startsWith(named.sha!)) {
      return {
        ok: false,
        message:
          `engine mode: FAIL - the PR names ${named.sha} but this lane installed the pinned commit ${short} (${sha}); ` +
          `the evidence would describe a different engine than the one the checks ran on`,
      };
    }
    return {
      ok: true,
      message: `engine mode: OK - pinned ${short}, named in the PR; catalog ${catalogVersion} is a different install`,
    };
  }

  const wrong = facts.installedVersions.filter((entry) => entry.version !== catalogVersion);
  if (wrong.length > 0) {
    return {
      ok: false,
      message:
        `engine mode: FAIL - the catalog names ${catalogVersion} but the installed tree is ` +
        `${wrong.map((entry) => `${entry.name} ${entry.version}`).join(", ")} (run bun run engine:published)`,
    };
  }

  const claimed = namedCommit(body);
  const note = claimed.sha === null ? "" : ` (+ the PR names pinned ${claimed.sha}; this checked the catalog install)`;
  return {
    ok: true,
    message: `engine mode: OK - published ${catalogVersion}, every installed @jgengine/* matches the catalog${note}`,
  };
}

/** Reads what is installed now: detection from the links, identity from the snapshot marker. */
export function readFacts(): EngineFacts {
  const state = readState();
  const installed = currentMode();
  const catalog = (readRootPackage().workspaces?.catalog ?? {}) as Record<string, string>;
  const names = catalogPackages();
  const catalogVersion = catalog[names[0] ?? ""] ?? "?";
  const installedVersions = names.map((name) => {
    const site = installedEntries(name)[0];
    const version = site === undefined ? "missing" : (JSON.parse(readFileSync(join(site, "package.json"), "utf8")).version as string);
    return { name, version };
  });
  const marker = state?.snapshot === undefined ? null : readSnapshotMarker(state.snapshot);
  return {
    installed,
    recorded: state?.mode ?? null,
    catalogVersion,
    installedVersions,
    pinned: marker === null ? null : { sha: marker.sha, short: marker.short },
  };
}

/** A body with the pin line replaced or added, so an existing PR can be brought up to date. */
export function withPinLine(body: string, sha: string): string {
  const line = pinLine(sha);
  const lines = body.split(/\r?\n/);
  const at = lines.findIndex((entry) => PIN_LINE.test(entry));
  if (at >= 0) {
    lines[at] = line;
    return lines.join("\n");
  }
  return `${body.trimEnd()}\n\n## Engine pin\n${line}\n`;
}

type Env = Record<string, string | undefined>;

export interface CliDeps {
  readBodyFile?: (path: string) => string;
  /** Injectable so the tests judge evidence without walking an installed tree. */
  readFacts?: () => EngineFacts;
}

/** CLI shell with injectable env/IO, so the tests drive the same path a lane and CI do. */
export function runCli(argv: string[], env: Env, log: (line: string) => void, deps: CliDeps = {}): number {
  const readBodyFile = deps.readBodyFile ?? ((path: string) => readFileSync(path, "utf8"));
  const at = argv.indexOf("--body-file");
  const inlineAt = argv.indexOf("--body");
  let body: string | undefined;
  if (at >= 0) body = readBodyFile(argv[at + 1] ?? "");
  else if (inlineAt >= 0) body = argv[inlineAt + 1] ?? "";
  else {
    const eventPath = env.GITHUB_EVENT_PATH;
    body = eventPath === undefined ? undefined : bodyFromEvent(readFileSync(eventPath, "utf8"));
  }

  const facts = (deps.readFacts ?? readFacts)();
  const verdict = checkEngineMode(facts, body);
  log(verdict.message);
  if (verdict.ok) return 0;
  return facts.installed === "pinned" && body === undefined ? 3 : 1;
}

if (import.meta.main) process.exit(runCli(process.argv.slice(2), process.env, console.log));
