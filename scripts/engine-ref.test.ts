import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onBetaVerdict, parseEngineRef, readEngineRef, REF_FILE, writeEngineRef } from "./engine-ref";

const SHA = "5892282a801641a1ec8d03979dfa58a203fafd0f";

test("the ref file holds one full engine sha", () => {
  expect(parseEngineRef(`${SHA}\n`)).toEqual({ sha: SHA, problem: null });
  expect(parseEngineRef(`# engine beta\n${SHA.toUpperCase()}\n`).sha).toBe(SHA);
  expect(parseEngineRef("").problem).toContain("names no commit");
  expect(parseEngineRef("5892282a").problem).toContain("full 40-character");
  expect(parseEngineRef("0.44.0").problem).toContain("full 40-character");
});

test("the committed engine-ref.txt is valid", () => {
  expect(readEngineRef(REF_FILE)).toMatch(/^[0-9a-f]{40}$/);
});

test("writing refuses anything but a full sha", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-ref-"));
  try {
    const path = join(dir, "engine-ref.txt");
    writeEngineRef(SHA, path);
    expect(readFileSync(path, "utf8")).toBe(`${SHA}\n`);
    expect(() => writeEngineRef("beta", path)).toThrow("full 40-character");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only a commit engine beta contains passes the on-beta check", () => {
  expect(onBetaVerdict(SHA, "identical").ok).toBe(true);
  expect(onBetaVerdict(SHA, "ahead").ok).toBe(true);
  const diverged = onBetaVerdict(SHA, "diverged");
  expect(diverged.ok).toBe(false);
  expect(diverged.line).toContain("merge the engine change first");
  expect(onBetaVerdict(SHA, "behind").ok).toBe(false);
  expect(onBetaVerdict(SHA, null).line).toContain("could not compare");
});
