import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { claimFrom, runCli } from "./ci-engine";

const SHA = "31aa290ce8f2bbfbaca359288615e95463e7655f";
const roots: string[] = [];

function temp(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ci-engine-"));
  roots.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function event(body: unknown): string {
  return temp("event.json", JSON.stringify(body));
}

describe("the engine a PR claims", () => {
  test("a body with no pin line claims nothing, which is the catalog path", () => {
    expect(claimFrom("## What changed\n\nTidied the HUD.\n\nEngine seam: none - authored content only\n")).toEqual({ sha: null, problem: null });
    expect(claimFrom(undefined)).toEqual({ sha: null, problem: null });
    expect(claimFrom("## Engine pin\n")).toEqual({ sha: null, problem: null });
  });

  test("a named commit comes back as the sha, short or long", () => {
    expect(claimFrom(`Engine pin: ${SHA}`).sha).toBe(SHA);
    expect(claimFrom("Engine pin: 31aa290c (engine beta)").sha).toBe("31aa290c");
  });

  test("a claim that names no commit is a failure, not a silence", () => {
    expect(claimFrom("Engine pin:").problem).toContain("empty");
    expect(claimFrom("Engine pin: 0.38.4").problem).toContain("is not a commit sha");
    expect(claimFrom("Engine pin: not-a-sha").problem).toContain("is not a commit sha");
    expect(claimFrom("Engine pin: 31aa29").problem).toContain("is not a commit sha");
  });
});

describe("the CI shell", () => {
  test("it prints the sha, or an empty line, and fails only a broken claim", () => {
    const out: string[] = [];
    const write = (line: string): void => {
      out.push(line);
    };

    expect(runCli(["--body", `Engine pin: ${SHA}`], {}, write)).toBe(0);
    expect(out.at(-1)).toBe(SHA);

    expect(runCli(["--body", "no pin here"], {}, write)).toBe(0);
    expect(out.at(-1)).toBe("");

    const errors: string[] = [];
    expect(runCli(["--body", "Engine pin: soon"], {}, write, { warn: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("claims a pinned engine it cannot name");
  });

  test("CI reads pull_request.body from GITHUB_EVENT_PATH, and a push event claims nothing", () => {
    const out: string[] = [];
    expect(runCli([], { GITHUB_EVENT_PATH: event({ pull_request: { body: `Engine pin: ${SHA}` } }) }, (line) => out.push(line))).toBe(0);
    expect(out.at(-1)).toBe(SHA);
    expect(runCli([], { GITHUB_EVENT_PATH: event({ ref: "refs/heads/beta", after: "abc" }) }, (line) => out.push(line))).toBe(0);
    expect(out.at(-1)).toBe("");

    const fromFile: string[] = [];
    expect(runCli(["--body-file", temp("body.md", `Engine pin: ${SHA}`)], {}, (line) => fromFile.push(line))).toBe(0);
    expect(fromFile.at(-1)).toBe(SHA);
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
});
