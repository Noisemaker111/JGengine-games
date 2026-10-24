import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { CONDITION_TIMEOUT_MS, FLOW_STEP_KINDS, MAX_FLOW_DEPTH, RULES, STEP_EXTRAS, STEP_VALUE_FIELDS, conditionProblems, stepProblems } from "./flow-schema";

const steps = (...list: unknown[]) => list.map((step, index) => stepProblems(step, `steps[${index}]`));
const problems = (...list: unknown[]) => steps(...list).flatMap((checked) => checked.problems);

describe("the flow shape the runner accepts", () => {
  test("waitFor states a condition, and timeoutMs caps it", () => {
    const [plain] = steps({ waitFor: "__jgProbe().frontStarted === 1" });
    expect(plain!.problems).toEqual([]);
    expect(plain!.kind).toBe("waitFor");

    const [capped] = steps({ waitFor: "__jgProbe().frontStarted === 1", timeoutMs: 45_000 });
    expect(capped!.problems).toEqual([]);
  });

  test("a step's condition carries is, value, timeoutMs and note", () => {
    const [checked] = steps({
      assert: "window.__jgengineRun.read().closed",
      before: { is: "window.__jgengineRun !== undefined", timeoutMs: 30_000, note: "the loop is mounted" },
      after: { is: "window.__jgengineRun.read().closed", value: 1 },
      note: "arrival",
    });
    expect(checked!.problems).toEqual([]);
    expect(conditionProblems({ is: "x", value: 1, timeoutMs: CONDITION_TIMEOUT_MS, note: "y" }, "at")).toEqual([]);
  });

  test("the shapes the games already write still pass", () => {
    expect(
      problems(
        { click: "Start" },
        { clickAt: [800, 450] },
        { key: "KeyW", ms: 2500 },
        { wait: 500 },
        { assert: "units.length", is: 5, note: "five units" },
        { flow: "to-menu" },
        { shot: "arrival" },
        { reload: true },
        { probe: "run" },
      ),
    ).toEqual([]);
  });

  test("a field no kind owns is refused, and the message says what a step is", () => {
    const [wrong] = steps({ click: "Start", wobble: 1 });
    expect(wrong!.problems[0]).toContain('unknown field "wobble"');
    expect(wrong!.problems[0]).toContain(RULES.unknownField);
  });

  test("one step is one kind", () => {
    expect(problems({ click: "a", key: "KeyW" })[0]).toContain(RULES.oneKind);
    expect(problems({ wiggle: "x" })[0]).toContain("none of the drive step keys");
  });
});

describe("the fields the runner silently ignores", () => {
  test("timeoutMs outside waitFor is refused with the rule that says where the cap belongs", () => {
    const [stray] = steps({ click: "Start", timeoutMs: 5000 });
    expect(stray!.problems).toHaveLength(1);
    expect(stray!.problems[0]).toContain(RULES.capOutsideCondition);
    expect(stray!.problems[0]).toContain("before");

    expect(problems({ assert: "x", timeoutMs: 5000 })[0]).toContain(RULES.capOutsideCondition);
  });

  test("ms outside a key hold is refused with the rule that names a condition instead", () => {
    expect(problems({ click: "Start", ms: 500 })[0]).toContain(RULES.holdOutsideKey);
    expect(problems({ waitFor: "x", ms: 500 })[0]).toContain(RULES.holdOutsideKey);
  });

  test("is outside an assert is refused", () => {
    expect(problems({ click: "a", is: 5 })[0]).toContain('"is" is the expected value of an assert');
  });

  test("a condition with an unknown field or no expression is refused", () => {
    expect(problems({ click: "a", before: { until: "x" } })[0]).toContain(RULES.unknownConditionField);
    expect(problems({ click: "a", after: {} })[0]).toContain('needs "is"');
    expect(problems({ click: "a", before: { is: "x", timeoutMs: 0 } })[0]).toContain("positive number");
  });

  test("a flow include carries no fields of its own", () => {
    expect(problems({ flow: "to-menu", before: { is: "x" } })[0]).toContain("carries no fields of its own");
  });

  test("a bad value names its kind", () => {
    expect(problems({ clickAt: "800,450" })[0]).toContain("[x, y] pixel numbers");
    expect(problems({ assert: "" })[0]).toContain("non-empty string");
    expect(problems({ waitFor: "" })[0]).toContain("waitFor takes the page expression");
    expect(problems({ waitFor: "x", timeoutMs: 0 })[0]).toContain("positive number");
    expect(problems({ key: "KeyW", ms: -1 })[0]).toContain("non-negative");
  });
});

/**
 * The runner is `drive` in the engine checkout. When it sits beside this repo, compare the two
 * lists field for field; CI has no engine checkout, so this test skips there and `check:framework`'s
 * engine seam line is the remaining proof.
 */
function engineCaptureArgs(): string | null {
  const explicit = process.env.JGENGINE_DIR;
  const candidates: string[] = explicit === undefined ? [] : [join(explicit, "packages/jgengine/src/templates/captureArgs.ts")];
  let dir = import.meta.dir;
  for (let depth = 0; depth < 8; depth += 1) {
    candidates.push(join(dir, "jgengine/packages/jgengine/src/templates/captureArgs.ts"));
    dir = dirname(dir);
  }
  return candidates.find((path) => existsSync(path)) ?? null;
}

const captureArgs = engineCaptureArgs();

function stringsIn(source: string, pattern: RegExp): string[] {
  const body = pattern.exec(source)?.[1] ?? "";
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

describe("parity with the runner", () => {
  test.skipIf(captureArgs === null)("the step kinds and fields are the engine's own", () => {
    const source = readFileSync(captureArgs!, "utf8");
    const kinds = stringsIn(source, /export function driveStepKinds\(\): string\[\] \{\s*return \[([^\]]*)\]/);
    expect(kinds).toEqual([...FLOW_STEP_KINDS]);

    const modifiers = stringsIn(source, /const modifiers = \[([^\]]*)\]/);
    expect([...modifiers].sort()).toEqual([...STEP_EXTRAS, ...STEP_VALUE_FIELDS].sort());
  });

  test.skipIf(captureArgs === null)("the condition fields and the nesting cap are the engine's own", () => {
    const source = readFileSync(captureArgs!, "utf8");
    expect(source).toContain("valid: is, value, timeoutMs, note");
    expect(source).toContain(`DRIVE_FLOW_MAX_DEPTH = ${MAX_FLOW_DEPTH}`);
    const timeout = /DRIVE_CONDITION_TIMEOUT_MS = ([\d_]+)/.exec(source)?.[1];
    expect(Number((timeout ?? "").replaceAll("_", ""))).toBe(CONDITION_TIMEOUT_MS);
  });
});
