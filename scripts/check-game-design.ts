/**
 * Makes every game's stated loop something the repo requires, not something a README hopes for.
 *
 * Each game's README carries the same six design-checklist sections and one `Loop proof:` line
 * naming the flow that proves the loop. This gate fails a game that:
 *
 *   - has no README, or is missing a section (core loop, progression, failure states,
 *     minute 5 -> hour 5, references, gap to target);
 *   - has no `Loop proof:` line, or names no flow;
 *   - names a flow whose file is not at `<game>/proofs/flows/<name>.json`, does not parse, has no
 *     step, or has no arrival assert (keys and shapes come from the engine's drive step file);
 *   - includes a flow by name that does not exist, or includes itself in a cycle.
 *
 * A name prefixed `TODO` is a flow the README promises and nobody has written. It is reported as a
 * TODO line rather than a failure, so the four games still to be covered can be cut as their own
 * lanes; `--strict` fails them, which is the state this gate is aiming at.
 *
 * Usage: bun run check:game-design [--strict] [--root <dir>]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { gameDirs } from "./capabilities";

/** The six sections every game's design checklist states, and the bold label each is written as. */
export const SECTIONS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  { id: "core-loop", label: "Core loop", pattern: /\*\*Core loop\b/ },
  { id: "progression", label: "Progression", pattern: /\*\*Progression\b/ },
  { id: "failure-states", label: "Failure states", pattern: /\*\*Failure states\b/ },
  { id: "minute-5", label: "Minute 5 -> hour 5", pattern: /\*\*Minute 5\b/ },
  { id: "references", label: "References it is chasing", pattern: /\*\*References\b/ },
  { id: "gap-to-target", label: "Gap to target", pattern: /\*\*Gap to target\b/ },
];

/** The engine's drive step-file keys (captureArgs `driveStepKinds`), plus the per-step extras. */
export const STEP_KINDS: readonly string[] = [
  "click",
  "doubleClick",
  "clickAt",
  "rightClickAt",
  "fill",
  "key",
  "wait",
  "waitFor",
  "reload",
  "shot",
  "rpc",
  "probe",
  "assert",
  "flow",
];

const EXTRAS: readonly string[] = ["before", "after", "note"];

/** How deep a flow may include another before the run refuses the script (engine DRIVE_FLOW_MAX_DEPTH). */
export const MAX_FLOW_DEPTH = 4;

const FLOW_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** An `[x, y]` pair of CSS viewport pixels, the shape the engine's step file takes for a click. */
function isPoint(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

export interface LoopProofEntry {
  name: string;
  /** The README promises this flow; nobody has written it yet. */
  todo: boolean;
}

export type LoopProof =
  | { ok: true; entries: LoopProofEntry[] }
  | { ok: false; problem: string };

/**
 * Read the `Loop proof:` line. It names one or more flows as bare names separated by commas; a
 * trailing parenthetical is a note (the `--state` a run needs), not a name.
 */
export function readLoopProof(readme: string): LoopProof {
  const match = /^Loop proof: *(.*)$/m.exec(readme);
  if (match === null) {
    return { ok: false, problem: 'has no "Loop proof:" line; name the flow that proves the core loop' };
  }
  const raw = (match[1] ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (raw.length === 0) {
    return { ok: false, problem: 'has an empty "Loop proof:" line; name at least one flow' };
  }
  const entries: LoopProofEntry[] = [];
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (token.length === 0) continue;
    const todoPrefix = /^TODO\b:?/.exec(token);
    const name = todoPrefix === null ? token : token.slice(todoPrefix[0].length).trim();
    if (!FLOW_NAME.test(name)) {
      return {
        ok: false,
        problem: `names "${token}" on its Loop proof line, which is not a flow name (lowercase letters, digits and dashes)`,
      };
    }
    entries.push({ name, todo: todoPrefix !== null });
  }
  if (entries.length === 0) {
    return { ok: false, problem: 'has a "Loop proof:" line that names no flow' };
  }
  return { ok: true, entries };
}

export interface FlowParse {
  problems: string[];
  /** Names this flow includes; the caller resolves them against the game's folder. */
  includes: string[];
  asserts: number;
}

function stepValueProblem(kind: string, value: unknown): string | null {
  switch (kind) {
    case "assert":
      return typeof value === "string" && value.trim().length > 0 ? null : "the assert expression must be a non-empty string";
    case "clickAt":
    case "rightClickAt":
      return isPoint(value) ? null : `${kind} takes [x, y] pixel numbers`;
    case "wait":
      return typeof value === "number" && value >= 0 ? null : "wait takes milliseconds as a number";
    case "flow":
      return typeof value === "string" && FLOW_NAME.test(value) ? null : 'a flow include takes a flow name (lowercase letters, digits and dashes)';
    case "probe":
      return typeof value === "string" ? null : "probe takes a name string";
    case "key":
      return typeof value === "string" && value.trim().length > 0 ? null : 'key takes a key chord such as "KeyW" or "KeyW+ShiftLeft"';
    case "reload":
      return null;
    case "before":
    case "after":
      return value !== null && typeof value === "object" ? null : `${kind} takes a condition object`;
    default:
      return typeof value === "string" && value.trim().length > 0 ? null : `${kind} takes a non-empty string`;
  }
}

/** Parse a flow file's text: the shape the engine's drive runner reads, checked without a browser. */
export function parseFlow(text: string, label: string): FlowParse {
  const problems: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { problems: [`${label} is not valid JSON (${error instanceof Error ? error.message : String(error)})`], includes: [], asserts: 0 };
  }
  const root = json as { steps?: unknown } | null;
  if (root === null || typeof root !== "object" || !Array.isArray(root.steps)) {
    return { problems: [`${label} has no "steps" array`], includes: [], asserts: 0 };
  }
  if (root.steps.length === 0) return { problems: [`${label} has an empty "steps" array`], includes: [], asserts: 0 };

  const includes: string[] = [];
  let asserts = 0;
  root.steps.forEach((step: unknown, index: number) => {
    const at = `${label} steps[${index}]`;
    if (step === null || typeof step !== "object" || Array.isArray(step)) {
      problems.push(`${at} is not an object`);
      return;
    }
    const record = step as Record<string, unknown>;
    const kinds = Object.keys(record).filter((key) => STEP_KINDS.includes(key));
    if (kinds.length === 0) {
      problems.push(`${at} has none of the drive step keys (${STEP_KINDS.join(", ")})`);
      return;
    }
    if (kinds.length > 1) {
      problems.push(`${at} mixes step keys ${kinds.join(" and ")}; one step is one kind`);
      return;
    }
    const kind = kinds[0]!;
    for (const key of Object.keys(record)) {
      if (key !== kind && !EXTRAS.includes(key) && !(key === "ms" && kind === "key")) {
        problems.push(`${at} has unknown field "${key}"`);
      }
    }
    if (kind === "key" && "ms" in record && (typeof record.ms !== "number" || record.ms < 0)) {
      problems.push(`${at} key hold takes ms as a non-negative number`);
    }
    for (const key of ["before", "after"] as const) {
      if (key in record) {
        const problem = stepValueProblem(key, record[key]);
        if (problem !== null) problems.push(`${at} ${problem}`);
      }
    }
    const problem = stepValueProblem(kind, record[kind]);
    if (problem !== null) {
      problems.push(`${at} ${problem}`);
      return;
    }
    if (kind === "assert") asserts += 1;
    if (kind === "flow") includes.push(record[kind] as string);
  });
  return { problems, includes, asserts };
}

export interface GameInspection {
  game: string;
  problems: string[];
  /** Flows the README names but nobody has written. */
  todos: string[];
  /** Flows the README names that exist and parse. */
  proven: string[];
}

type Read = (path: string) => string;
type Exists = (path: string) => boolean;
type ListFlows = (dir: string) => string[];

export interface Io {
  read: Read;
  exists: Exists;
  listFlows: ListFlows;
}

export const realIo: Io = {
  read: (path) => readFileSync(path, "utf8"),
  exists: (path) => existsSync(path),
  listFlows: (dir) => {
    try {
      return readdirSync(dir).map((name) => name.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  },
};

/** Walk a flow's includes, so a proof that leans on a missing or self-including flow fails here. */
function checkFlowTree(game: string, flowName: string, flowsDir: string, io: Io): { problems: string[]; asserts: number } {
  const problems: string[] = [];
  let asserts = 0;
  const seen = new Map<string, number>();

  const walk = (name: string, depth: number, chain: string[]): void => {
    const file = `${flowsDir}/${name}.json`;
    const label = `${game}/proofs/flows/${name}.json`;
    if (chain.includes(name)) {
      problems.push(`${game} Loop proof "${flowName}" includes "${name}" in a cycle (${[...chain, name].join(" -> ")})`);
      return;
    }
    if (depth > MAX_FLOW_DEPTH) {
      problems.push(`${game} Loop proof "${flowName}" nests includes more than ${MAX_FLOW_DEPTH} deep (${[...chain, name].join(" -> ")})`);
      return;
    }
    const previous = seen.get(name);
    if (previous !== undefined) {
      asserts += previous;
      return;
    }
    if (!io.exists(file)) {
      const available = io.listFlows(flowsDir);
      problems.push(
        `${game} Proof "${flowName}" includes "${name}", but ${label} does not exist` +
          (available.length === 0 ? "" : ` (available: ${available.sort().join(", ")})`),
      );
      return;
    }
    const parsed = parseFlow(io.read(file), label);
    problems.push(...parsed.problems);
    const before = asserts;
    for (const include of parsed.includes) walk(include, depth + 1, [...chain, name]);
    asserts = before;
    const own = parsed.asserts;
    seen.set(name, own);
    asserts += own;
  };

  walk(flowName, 0, []);
  return { problems, asserts };
}

/** Check one game's README and the flows it names. */
export function inspectGame(root: string, game: string, io: Io = realIo): GameInspection {
  const problems: string[] = [];
  const todos: string[] = [];
  const proven: string[] = [];
  const dir = join(root, game);
  const readme = join(dir, "README.md");

  if (!io.exists(readme)) {
    return { game, problems: [`${game} has no README.md with a design checklist`], todos, proven };
  }
  const text = io.read(readme);
  for (const section of SECTIONS) {
    if (!section.pattern.test(text)) problems.push(`${game} README is missing the "${section.label}" section of the design checklist`);
  }

  const proof = readLoopProof(text);
  if (!proof.ok) {
    problems.push(`${game} README ${proof.problem}`);
    return { game, problems, todos, proven };
  }

  const flowsDir = join(dir, "proofs", "flows");
  for (const entry of proof.entries) {
    if (entry.todo) {
      todos.push(entry.name);
      continue;
    }
    const file = join(flowsDir, `${entry.name}.json`);
    if (!io.exists(file)) {
      const available = io.listFlows(flowsDir);
      problems.push(
        `${game} Loop proof names "${entry.name}", but ${game}/proofs/flows/${entry.name}.json does not exist` +
          (available.length === 0
            ? " (the game has no flows; write one that reaches the loop and asserts the arrival)"
            : ` (available: ${available.sort().join(", ")})`),
      );
      continue;
    }
    const tree = checkFlowTree(game, entry.name, flowsDir, io);
    problems.push(...tree.problems);
    if (tree.problems.length === 0) {
      if (tree.asserts === 0) {
        problems.push(`${game} Loop proof "${entry.name}" runs steps but asserts nothing; a flow without an arrival assert is not a proof`);
      } else {
        proven.push(entry.name);
      }
    }
  }
  return { game, problems, todos, proven };
}

export interface CheckResult {
  lines: string[];
  failures: number;
  todos: number;
}

/** Check every game directory under `root`; `strict` turns the TODO lines into failures. */
export function checkGames(root: string, games: string[], io: Io = realIo, strict = false): CheckResult {
  const lines: string[] = [];
  let failures = 0;
  let todos = 0;

  for (const game of games) {
    const result = inspectGame(root, game, io);
    for (const problem of result.problems) {
      failures += 1;
      lines.push(`game-design: FAIL - ${problem}`);
    }
    for (const name of result.todos) {
      todos += 1;
      const message = `${game} Loop proof names "${name}" as TODO: no ${game}/proofs/flows/${name}.json yet`;
      if (strict) {
        failures += 1;
        lines.push(`game-design: FAIL - ${message}`);
      } else {
        lines.push(`game-design: TODO - ${message}`);
      }
    }
    if (result.problems.length === 0) {
      const proven = result.proven.length === 0 ? "no flow yet" : `flow${result.proven.length === 1 ? "" : "s"} ${result.proven.join(", ")}`;
      lines.push(`game-design: OK - ${game}: 6 sections, ${proven}`);
    }
  }

  if (failures > 0) {
    lines.push(`game-design: FAIL - ${failures} problem${failures === 1 ? "" : "s"} in ${games.length} games`);
  } else {
    const todoNote = todos === 0 ? "" : `, ${todos} TODO proof${todos === 1 ? "" : "s"} still to write`;
    lines.push(`game-design: OK - ${games.length} games carry the six sections and name a flow${todoNote}`);
  }
  return { lines, failures, todos };
}

export function runCli(argv: string[], root: string, log: (line: string) => void): number {
  const strict = argv.includes("--strict");
  const at = argv.indexOf("--root");
  const target = at >= 0 ? (argv[at + 1] ?? root) : root;
  const result = checkGames(target, gameDirs(target), realIo, strict);
  for (const line of result.lines) log(line);
  return result.failures === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(runCli(process.argv.slice(2), process.cwd(), console.log));
