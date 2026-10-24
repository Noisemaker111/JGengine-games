/**
 * Fails when a game directory grows an engine-shaped module.
 *
 * A game owns content and feel. Missions, economy, vehicles, loot, AI, damage, progression and UI
 * kits belong to `Noisemaker111/jgengine` so one fix reaches every game; see "Framework-first
 * development" in AGENTS.md.
 *
 * The verdict is about what a file contains, never what it is called. A basename or a folder name
 * is not evidence that a game wrote an engine: `to-cleared-mission.json` is a flow, not a mission
 * system, and a gate that pushed lanes to rename files around it would be worse than the false
 * positive it avoided. A non-code file can never be an engine module. A code file is engine-shaped
 * when it *defines* one of the systems below and is long enough to be a system rather than adoption
 * glue - importing and calling a shared system is the point, not an offence.
 *
 * Usage: bun run check:framework [--base origin/beta] [--allow "<reason>"]
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export interface EngineSeam {
  /** What the game wrote that the engine should own. */
  name: string;
  /** Where it belongs in the engine, in the words of epic #2312. */
  owner: string;
  /** Shapes that only appear when a module *owns* the system, never when it adopts one. */
  defines: readonly RegExp[];
}

const STATE_MACHINE_SEAM: EngineSeam = {
  name: "state machine",
  owner: "missions / run and session loop",
  defines: [
    /\b(?:nextState|transitionTo|advanceState|setPhase)\s*[(:]/,
    /Record<\s*\w*(?:State|Phase)\s*,\s*\w*(?:State|Phase)/,
    /switch\s*\(\s*(?:this\.)?\w*(?:state|phase|State|Phase)\s*\)/,
  ],
};

export const ENGINE_SEAMS: readonly EngineSeam[] = [
  STATE_MACHINE_SEAM,
  {
    name: "reducer",
    owner: "run and session loop",
    defines: [/\b(?:function|const)\s+\w*[Rr]educer\b/, /switch\s*\(\s*\w*action\.type\s*\)/],
  },
  {
    name: "scheduler",
    owner: "AI director / run and session loop",
    defines: [/\bclass\s+\w*(?:Scheduler|TimerQueue|IntervalHeap)\b/, /\b(?:nextRunAt|dueAt|scheduledAt|timerHeap|intervalHeap)\b/, /\bfunction\s+\w*(?:schedule|tickQueue)\b/],
  },
  {
    name: "resource pool",
    owner: "items and loot",
    defines: [/\bclass\s+\w*Pool\b/, /\b(?:freeList|pooledObjects|acquireFromPool|releaseToPool)\b/],
  },
  {
    name: "pathfinder",
    owner: "agents",
    defines: [/\b(?:function|const|class)\s+\w*(?:findPath|aStar|AStar|dijkstra|Dijkstra|navSearch)\b/, /\b(?:openSet|closedSet|gScore|fScore|cameFrom)\b/],
  },
  {
    name: "damage or status table",
    owner: "damage and status",
    defines: [/\bfunction\s+\w*(?:applyStatus|applyDamage|resolveDamage|tickStatus)\b/, /\bconst\s+\w*(?:Damage|Status|DAMAGE|STATUS)\w*(?:Table|Matrix|Chart)\b/],
  },
  {
    name: "spawn director",
    owner: "AI director",
    defines: [/\bclass\s+\w*(?:Director|Spawner|SpawnDirector)\b/, /\b(?:spawnBudget|waveBudget|spawnSchedule|difficultyCurve|threatBudget)\b/],
  },
  {
    name: "progression curve",
    owner: "progression and economy",
    defines: [/\b(?:function|const|let)\s+\w*(?:xpForLevel|xpToNext|levelCurve|progressionCurve|curveFor|levelThresholds|xpCurve)\b/],
  },
];

/** A named set of states and the transitions between them: a state machine, not a typed field. */
const STATE_UNION = /\btype\s+\w*(?:State|Phase)\s*=\s*[^;]*\|/;
const STATE_TRANSITION = /\b\w*(?:state|phase|State|Phase)\s*=\s*["'`]/g;

function definesStateMachine(code: string): boolean {
  const moves = code.match(STATE_TRANSITION)?.length ?? 0;
  return moves >= 2 && STATE_UNION.test(code);
}

/** A file the runner can execute. Anything else - a JSON flow, a note, an asset - is never an engine. */
const CODE_FILE = /\.[cm]?[jt]sx?$/;

/** Tests describe systems; they do not own them. */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * Below this many lines of code a match is adoption glue - an adapter that names a shared system -
 * rather than a system of its own. AGENTS.md files the seam at "roughly 50 lines"; this sits lower
 * so a lane hears about the system while it is still cheap to move.
 */
export const MIN_SYSTEM_LINES = 20;

/** Drop comments, so prose that mentions a state machine is not read as one. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Non-blank, non-comment lines: how much of a module is actually code. */
export function codeLines(source: string): number {
  return stripComments(source)
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

/** The engine systems a file owns; empty when it is content, adoption or too small to be a system. */
export function engineSeams(path: string, source: string): EngineSeam[] {
  if (!CODE_FILE.test(path) || TEST_FILE.test(path)) return [];
  if (codeLines(source) < MIN_SYSTEM_LINES) return [];
  const code = stripComments(source);
  const seams = ENGINE_SEAMS.filter((seam) => seam.defines.some((pattern) => pattern.test(code)));
  if (definesStateMachine(code) && !seams.some((seam) => seam.name === STATE_MACHINE_SEAM.name)) {
    seams.unshift(STATE_MACHINE_SEAM);
  }
  return seams;
}

/** What to do about a seam, in the words of AGENTS.md. */
export function seamAdvice(seam: EngineSeam): string {
  return `${seam.name}: file the seam in Noisemaker111/jgengine under "${seam.owner}" (epic #2312), name the API and the second game that would adopt it, then adopt it here`;
}

/** The game directories of a path: `<game>/...`, excluding the non-game roots. */
const NON_GAME = new Set(["shared", "studios", "registry", "scripts", "docs", ".github", "node_modules"]);

export function gameFiles(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const first = path.split("/")[0] ?? "";
    return path.includes("/") && !NON_GAME.has(first) && !path.startsWith(".");
  });
}

export interface Offence {
  file: string;
  seams: EngineSeam[];
}

/** Judge added files by content. `read` returns "" for a file that is gone. */
export async function inspect(paths: readonly string[], read: (path: string) => Promise<string>): Promise<Offence[]> {
  const offences: Offence[] = [];
  for (const file of gameFiles(paths)) {
    const seams = engineSeams(file, await read(file));
    if (seams.length > 0) offences.push({ file, seams });
  }
  return offences;
}

async function main(argv: readonly string[]): Promise<number> {
  const arg = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const reason = arg("--allow");
  const base = arg("--base") ?? "origin/beta";

  const changed = (diffArgs: string[]): string[] => {
    const result = spawnSync("git", ["diff", "--name-status", ...diffArgs], { encoding: "utf8" });
    if (result.status !== 0) return [];
    return (result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length === 2 && parts[0] === "A")
      .map((parts) => parts[1]!);
  };

  const added = gameFiles([...changed([`${base}...HEAD`]), ...changed(["--cached"])]);
  const offences = await inspect(added, (file) => Bun.file(join(process.cwd(), file)).text().catch(() => ""));

  if (offences.length === 0) {
    console.log(`framework check: ${added.length} new game files, none engine-shaped`);
    return 0;
  }

  if (reason !== undefined) {
    console.log(`framework check: allowed ${offences.length} engine-shaped file(s) - ${reason}`);
    for (const offence of offences) console.log(`  allowed: ${offence.file}`);
    return 0;
  }

  console.error("framework check: these game files own an engine system, judged by what they contain:");
  for (const offence of offences) {
    console.error(`  ${offence.file}`);
    for (const seam of offence.seams) console.error(`    ${seamAdvice(seam)}`);
  }
  console.error(
    [
      "",
      "A game that imports and calls a shared system is adoption and passes.",
      "If this file truly cannot live upstream, rerun with: bun run check:framework -- --allow \"<reason>\"",
      "Rule: AGENTS.md -> Framework-first development.",
    ].join("\n"),
  );
  return 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
