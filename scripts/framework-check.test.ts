import { describe, expect, test } from "bun:test";

import { ENGINE_SEAMS, MIN_SYSTEM_LINES, codeLines, engineSeams, gameFiles, inspect, seamAdvice, stripComments } from "./framework-check";

/**
 * The rule this lane replaced: a basename substring plus any arrow function. It is kept here as the
 * before-state of the regression, so the fixture below proves the false positive was real.
 */
const OLD = {
  path: /(^|\/)(systems?|sim|simulation|gameplay|mechanics)\//i,
  name: /(mission|objective|quest|contract|economy|progression|inventory|loot|ability|abilities|talent|perk|damage|status|vehicle|traffic|wanted|heat|director|spawner|scheduler|pathfind|navigat|reputation|unlock)/i,
  logic: /export\s+(async\s+)?(function|class)\s|export\s+const\s+\w+\s*=\s*(async\s*)?\(|=>\s*\{/,
};

function oldRuleWouldFlag(path: string, source: string): boolean {
  return OLD.logic.test(source) && (OLD.path.test(path) || OLD.name.test(path.split("/").pop() ?? ""));
}

const read = (files: Record<string, string>) => async (path: string) => files[path] ?? "";

/** Real code lines until the fixture clears the system floor, so the floor is not what is under test. */
const pad = (source: string): string => {
  const lines: string[] = [source];
  for (let index = codeLines(source); index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
  return lines.join("\n");
};

describe("a flow file is never an engine module", () => {
  /** The shape a lane wrote: a mission-order flow whose body has arrow functions and the word mission. */
  const FLOW = `{
  "steps": [
    {
      "assert": "(() => { const run = window.__jgengineRun.read(); return run.kind === 'mission' && run.phase === 'closed'; })()",
      "before": { "is": "window.__jgengineRun !== undefined", "timeoutMs": 30000 },
      "note": "arrival: the mission's order was cleared on the shared session loop"
    }
  ]
}
`;

  test("to-cleared-mission.json passes now and would have failed before", () => {
    const path = "ember-command/proofs/flows/to-cleared-mission.json";
    expect(oldRuleWouldFlag(path, FLOW)).toBe(true);
    expect(engineSeams(path, FLOW)).toEqual([]);
  });

  test("no non-code file is engine-shaped, whatever it is called", () => {
    for (const path of [
      "ember-command/proofs/flows/to-cleared-mission.json",
      "ember-command/src/systems/mission-director.json",
      "ember-command/docs/state-machine.md",
      "ember-command/src/game/damage-table.csv",
      "ember-command/public/spawn-director.glb",
    ]) {
      expect(engineSeams(path, FLOW)).toEqual([]);
    }
  });

  test("a game's own prose about systems is not a system", () => {
    const source = `/**
 * The mission state machine, the loot reducer, the spawn director and the damage table all live in
 * @jgengine/*; this module only adopts them.
 */
export const note = "state machine, reducer, scheduler, pathfinder";
`;
    expect(engineSeams("odd-orbit/src/game/notes.ts", source)).toEqual([]);
  });
});

describe("a game that owns an engine system still fails", () => {
  const STATE_MACHINE = `export type MissionPhase = "offered" | "accepted" | "closed";

let phase: MissionPhase = "offered";

export function accept(): void {
  if (phase !== "offered") return;
  phase = "accepted";
}

export function close(): void {
  if (phase !== "accepted") return;
  phase = "closed";
}

export function read(): MissionPhase {
  return phase;
}

export function reset(): void {
  phase = "offered";
}
`;

  test("a state machine inside a game names the seam it should move to", () => {
    const seams = engineSeams("ember-command/src/game/missionPhase.ts", pad(STATE_MACHINE));
    expect(seams.map((seam) => seam.name)).toEqual(["state machine"]);
    expect(seamAdvice(seams[0]!)).toContain("Noisemaker111/jgengine");
    expect(seamAdvice(seams[0]!)).toContain("missions / run and session loop");
    expect(seamAdvice(seams[0]!)).toContain("#2312");
  });

  test("the other engine systems are named too", () => {
    const pad = (source: string): string => {
      const lines: string[] = [source];
      for (let index = codeLines(source); index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
      return lines.join("\n");
    };
    const cases: Array<[string, string, string]> = [
      ["reducer", "ember-command/src/game/store.ts", "export function gameReducer(state: State, action: Action) {\n  switch (action.type) {\n    case 'a': return state;\n    default: return state;\n  }\n}\n"],
      ["pathfinder", "odd-orbit/src/game/nav.ts", "export function findPath(from: Cell, to: Cell): Cell[] {\n  const openSet = [from];\n  while (openSet.length > 0) openSet.pop();\n  return [];\n}\n"],
      ["spawn director", "harbor-heat/src/game/waves.ts", "export class SpawnDirector {\n  private spawnBudget = 10;\n  next(): number { return this.spawnBudget--; }\n}\n"],
      ["progression curve", "harbor-heat/src/game/xp.ts", "export function xpForLevel(level: number): number {\n  return Math.round(100 * level ** 1.5);\n}\n"],
      ["resource pool", "scrap-signal/src/game/pool.ts", "export class BulletPool {\n  private freeList: Bullet[] = [];\n  take(): Bullet { return this.freeList.pop()!; }\n}\n"],
      ["damage or status table", "deepward/src/game/hit.ts", "export function applyDamage(target: Target, amount: number): void {\n  target.health -= amount;\n}\n"],
    ];
    for (const [seam, path, source] of cases) {
      expect({ path, seams: engineSeams(path, pad(source)).map((found) => found.name) }).toEqual({ path, seams: [seam] });
    }
  });

  test("the same system in a test file is a test, not a second engine", () => {
    expect(engineSeams("ember-command/src/game/missionPhase.test.ts", STATE_MACHINE)).toEqual([]);
  });
});

describe("adoption is not an offence", () => {
  test("a module that imports a shared system and calls it passes", () => {
    const adoption = `import { useRunSession } from "@jgengine/react";
import { spawnWave } from "@jgengine/shell";

export function startMission(session: ReturnType<typeof useRunSession>): void {
  session.open({ kind: "mission", id: "the-long-watch" });
  spawnWave({ wave: 1, budget: 6 });
}

export function closeMission(session: ReturnType<typeof useRunSession>): void {
  session.close();
}
`;
    expect(engineSeams("ember-command/src/game/campaignSession.ts", adoption)).toEqual([]);
  });

  test("a short game helper that names a system stays below the system floor", () => {
    const short = `export function applyDamage(target: Target, amount: number): void {\n  target.health -= amount;\n}\n`;
    expect(codeLines(short)).toBeLessThan(MIN_SYSTEM_LINES);
    expect(engineSeams("deepward/src/game/hit.ts", short)).toEqual([]);
  });
});

describe("judging a branch's added files", () => {
  test("only the engine-shaped file is reported, with the seam named", async () => {
    const files = {
      "ember-command/proofs/flows/to-cleared-mission.json": `{ "steps": [ { "assert": "(() => true)()" } ] }`,
      "ember-command/src/game/campaignSession.ts": `import { useRunSession } from "@jgengine/react";\nexport const use = useRunSession;\n`,
      "ember-command/src/game/missionPhase.ts": pad(`export type Phase = "a" | "b";\nlet phase: Phase = "a";\nexport function next(): void {\n  phase = "b";\n}\nexport function back(): void {\n  phase = "a";\n}\nexport function read(): Phase {\n  return phase;\n}\n`),
      "shared/src/anything.ts": `export class SpawnDirector { private spawnBudget = 1; }\n`,
    };
    const offences = await inspect(Object.keys(files), read(files));
    expect(offences.map((offence) => offence.file)).toEqual(["ember-command/src/game/missionPhase.ts"]);
    expect(offences[0]!.seams.map((seam) => seam.name)).toEqual(["state machine"]);
  });

  test("game directories are the only ones judged", () => {
    expect(gameFiles(["shared/src/a.ts", "scripts/b.ts", ".github/c.ts", "ember-command/src/d.ts", "README.md"])).toEqual([
      "ember-command/src/d.ts",
    ]);
  });
});

describe("the shape of the judge", () => {
  test("comments are dropped before matching, code lines ignore blanks", () => {
    expect(stripComments("const a = 1; // state machine\n/* reducer */\nconst b = 2;")).not.toContain("state machine");
    expect(codeLines("const a = 1;\n\n// note\n")).toBe(1);
  });

  test("every seam names the engine area it belongs to", () => {
    expect(ENGINE_SEAMS.length).toBe(8);
    for (const seam of ENGINE_SEAMS) {
      expect(seam.owner.length).toBeGreaterThan(3);
      expect(seam.defines.length).toBeGreaterThan(0);
    }
  });
});
