import { expect, test } from "bun:test";

import { branchRefusal, guardStaged, parseArgs, pinEvidence, prBody, seamProblem } from "./lane-close";
import { checkPrBody } from "./seam-line-check";
import { checkEngineMode } from "./engine-mode-check";

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

test("a pinned lane's body carries the commit it proved, and passes the mode gate", () => {
  const sha = "e62f4ae9d2b2c1a0f0e1d2c3b4a5968778695a4b";
  const body = prBody("Harbor: the deck sign adopts the pinned shell", "none - scripts only", "`bun run verify:fast` passed", sha);
  expect(body).toContain("Engine pin: e62f4ae9d2b2");
  expect(checkPrBody(body).ok).toBe(true);
  expect(
    checkEngineMode(
      { installed: "pinned", recorded: "pinned", catalogVersion: "0.38.3", installedVersions: [], pinned: { sha, short: "e62f4ae9" } },
      body,
    ).ok,
  ).toBe(true);
  expect(prBody("x", "none - scripts only", "verified")).not.toContain("Engine pin");
});

test("a lane that proved no commit cannot name one", () => {
  const published: Parameters<typeof pinEvidence>[0] = {
    installed: "published",
    recorded: "published",
    catalogVersion: "0.38.3",
    installedVersions: [],
    pinned: null,
  };
  expect(pinEvidence(published)).toEqual({ sha: null, refusal: null });
  expect(pinEvidence({ ...published, installed: "local", recorded: "local" }).refusal).toContain("proves no commit");
  expect(pinEvidence({ ...published, installed: "pinned", recorded: "pinned" }).refusal).toContain("identity marker");
  expect(pinEvidence({ ...published, installed: "pinned", recorded: "pinned", pinned: { sha: "e62f4ae9", short: "e62f4ae9" } }).sha).toBe(
    "e62f4ae9",
  );
  expect(pinEvidence(published, "not-a-sha").refusal).toContain("is not a commit sha");
  expect(pinEvidence(published, "E62F4AE9").sha).toBe("e62f4ae9");
});

test("a seam line a shell mangled is refused before the PR exists, not by CI after", () => {
  expect(seamProblem(undefined)).toContain("needs its seam line");
  expect(seamProblem("")).toContain("needs its seam line");
  expect(seamProblem("none")).toContain("needs");
  expect(seamProblem('\\none - lane scripts and docs,no game source\\')).toContain("names no path or issue");
  expect(seamProblem("none - authored content only")).toBe(null);
  expect(seamProblem("packages/core/src/x.ts (adopts #12)")).toBe(null);
});

test("flags parse, and the commit message is optional until there is something to commit", () => {
  expect(parseArgs([])).toEqual({ allow: [], dryRun: false });
  const args = parseArgs(["-m", "subject", "--seam", "none - authored content only", "--allow", "bun.lock", "--dry-run"]);
  expect(args.message).toBe("subject");
  expect(args.allow).toEqual(["bun.lock"]);
  expect(args.dryRun).toBe(true);
});
