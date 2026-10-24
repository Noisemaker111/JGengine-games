import { expect, test } from "bun:test";

import { branchRefusal, guardStaged, parseArgs, prBody } from "./lane-close";
import { checkPrBody } from "./seam-line-check";

test("a lane is a task branch, not the base", () => {
  expect(branchRefusal("beta")).toContain("refusing to close beta");
  expect(branchRefusal("main")).toContain("refusing to close main");
  expect(branchRefusal("HEAD")).toContain("could not read");
  expect(branchRefusal("agent/lane-agents-entry")).toBe(null);
});

test("scratch artifacts, logs and a lone lockfile are refused", () => {
  const refusals = guardStaged(["AGENTS.md", ".scratch/bg/x/out.log", "bun.lock"], []);
  expect(refusals.map((refusal) => refusal.path)).toEqual([".scratch/bg/x/out.log", "bun.lock"]);
});

test("a lockfile beside its manifest is a pin bump, not a drift", () => {
  expect(guardStaged(["package.json", "bun.lock"], [])).toEqual([]);
});

test("--allow keeps one refused file on purpose", () => {
  expect(guardStaged(["bun.lock"], ["bun.lock"])).toEqual([]);
});

test("the body a lane:close opens passes the games CI seam check", () => {
  const body = prBody("Odd Orbit: the coaster runs a real circuit", "none - authored content only", "`bun run verify:fast` passed");
  expect(checkPrBody(body).ok).toBe(true);
  expect(prBody("x", "packages/shell/src/render/x.ts (adopts #1234)", "verified")).toContain(
    "Engine seam: packages/shell/src/render/x.ts (adopts #1234)",
  );
});

test("flags parse, and the commit message is optional until there is something to commit", () => {
  expect(parseArgs([])).toEqual({ allow: [], dryRun: false });
  const args = parseArgs(["-m", "subject", "--seam", "none - authored content only", "--allow", "bun.lock", "--dry-run"]);
  expect(args.message).toBe("subject");
  expect(args.allow).toEqual(["bun.lock"]);
  expect(args.dryRun).toBe(true);
});
