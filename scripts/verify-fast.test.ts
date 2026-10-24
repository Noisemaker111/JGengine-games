import { expect, test } from "bun:test";

import { buildPlan, fullPlan, isRuntimeSource, workspaceOf, workspaces, type Workspace } from "./verify-fast";

const all: Workspace[] = [
  { dir: "deepward", checkTypes: true, test: true },
  { dir: "harbor-heat", checkTypes: true, test: true },
  { dir: "registry", checkTypes: false, test: false },
];

const stepsFor = (changed: string[]): string[] => buildPlan(changed, all).steps.map((step) => step.name);

test("this repo's own `*` workspace glob becomes its game directories, not a literal star", () => {
  const found = workspaces().map((workspace) => workspace.dir);
  expect(found).toContain("deepward");
  expect(found).toContain("harbor-heat");
  expect(found).not.toContain("*");
});

test("a game's source runs that game's types and tests, and the gates that read game code", () => {
  expect(stepsFor(["deepward/src/game/ai.ts"])).toEqual([
    "provision",
    "check:framework",
    "check:module-globals",
    "deepward check-types",
    "deepward test",
  ]);
});

test("two changed games run both, and only them", () => {
  const steps = stepsFor(["deepward/src/a.ts", "harbor-heat/src/b.ts"]);
  expect(steps).toContain("deepward check-types");
  expect(steps).toContain("harbor-heat check-types");
  expect(steps.filter((name) => name.endsWith("check-types")).length).toBe(2);
});

test("a scripts change runs the scripts' tests instead of every game", () => {
  expect(stepsFor(["scripts/lane-close.ts"])).toEqual(["scripts test"]);
});

test("a ledger or catalog change runs the capability gate and type-checks every game", () => {
  const steps = stepsFor(["capabilities.json", "package.json", "bun.lock"]);
  expect(steps).toContain("check:capabilities");
  expect(steps).toContain("deepward check-types");
  expect(steps).toContain("harbor-heat check-types");
});

test("a game step runs its script from the game's directory, in a form bun actually runs", () => {
  const steps = buildPlan(["deepward/src/a.ts"], all).steps;
  const game = steps.filter((step) => step.name === "deepward check-types");
  expect(game.length).toBe(1);
  expect(game[0]!.command).toEqual(["bun", "--cwd=deepward", "run", "check-types"]);
  for (const step of steps) {
    const cwd = step.command.indexOf("--cwd");
    expect(cwd).toBe(-1);
  }
});

test("documentation alone reaches no gate and needs no attribution", () => {
  const plan = buildPlan(["AGENTS.md", "README.md", "deepward/README.md"], all);
  expect(plan.steps).toEqual([]);
  expect(plan.unattributed).toEqual([]);
});

test("a game with no check-types and no tests is reported, not silently passed", () => {
  const plan = buildPlan(["registry/thing.ts"], all);
  expect(plan.steps.map((step) => step.name)).toEqual(["provision", "check:framework", "check:module-globals"]);
  expect(plan.unattributed).toEqual(["registry/thing.ts"]);
});

test("a declaration or a test file is not runtime source", () => {
  expect(isRuntimeSource("harbor-heat/src/thing.test.ts")).toBe(false);
  expect(isRuntimeSource("harbor-heat/src/types.d.ts")).toBe(false);
  expect(isRuntimeSource("harbor-heat/src/thing.tsx")).toBe(true);
});

test("the deepest workspace owns a path", () => {
  expect(workspaceOf("deepward/src/a.ts", all)?.dir).toBe("deepward");
  expect(workspaceOf("AGENTS.md", all)).toBe(null);
});

test("--full runs every gate, every game's types and tests, and the scripts' tests", () => {
  const steps = fullPlan(all).steps.map((step) => step.name);
  for (const name of ["check:framework", "check:seam-line", "check:module-globals", "check:capabilities"]) {
    expect(steps).toContain(name);
  }
  expect(steps).toContain("scripts test");
  expect(steps).toContain("harbor-heat test");
});
