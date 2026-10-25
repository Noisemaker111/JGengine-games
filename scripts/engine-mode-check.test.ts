import { describe, expect, test } from "bun:test";

import { checkEngineMode, runCli, type EngineFacts } from "./engine-mode-check";

const REF = "e62f4ae9d2b2c1a0f0e1d2c3b4a5968778695a4b";
const OTHER = "9f5b952e00000000000000000000000000000000";

const linked = (overrides: Partial<EngineFacts> = {}): EngineFacts => ({
  installed: "pinned",
  recorded: "pinned",
  installedVersions: [{ name: "@jgengine/core", version: "0.44.0" }],
  pinned: { sha: REF, short: "e62f4ae9" },
  ...overrides,
});

describe("only the build of engine-ref.txt passes", () => {
  test("the snapshot of the ref agrees", () => {
    const verdict = checkEngineMode(linked(), REF);
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain("e62f4ae9d2b2");
  });

  test("a snapshot of another commit fails and names both", () => {
    const verdict = checkEngineMode(linked({ pinned: { sha: OTHER, short: "9f5b952e" } }), REF);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("e62f4ae9d2b2");
    expect(verdict.message).toContain("9f5b952e0000");
    expect(verdict.message).toContain("engine:sync");
  });

  test("the registry install fails: games never run the npm build", () => {
    const verdict = checkEngineMode(linked({ installed: "published", recorded: "published", pinned: null }), REF);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("registry");
  });

  test("a live local link proves no commit", () => {
    const verdict = checkEngineMode(linked({ installed: "local", recorded: "local" }), REF);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("proves no commit");
  });

  test("a snapshot without a marker, or a state file that disagrees with the links, fails", () => {
    expect(checkEngineMode(linked({ pinned: null }), REF).ok).toBe(false);
    expect(checkEngineMode(linked({ recorded: "local" }), REF).message).toContain("records local");
  });
});

test("the CLI reads the ref and the facts it is given", () => {
  const lines: string[] = [];
  expect(runCli((line) => lines.push(line), { readFacts: () => linked(), readRef: () => REF })).toBe(0);
  expect(runCli((line) => lines.push(line), { readFacts: () => linked(), readRef: () => OTHER })).toBe(1);
  expect(
    runCli((line) => lines.push(line), {
      readFacts: () => linked(),
      readRef: () => {
        throw new Error("engine-ref.txt names no commit");
      },
    }),
  ).toBe(1);
  expect(lines.at(-1)).toContain("names no commit");
});
