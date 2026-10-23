import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkPrBody, runCli } from "./seam-line-check";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Writes `body` to a temp PR-body file and returns its path. */
function bodyFile(body: string): string {
  const root = mkdtempSync(join(tmpdir(), "seam-line-"));
  roots.push(root);
  const path = join(root, "body.md");
  writeFileSync(path, body);
  return path;
}

/** Writes a GitHub event payload and returns its path. */
function eventFile(payload: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "seam-event-"));
  roots.push(root);
  const path = join(root, "event.json");
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

/** Drives the CLI with one body file, returning the exit code and the printed line. */
function cli(body: string): { code: number; out: string } {
  const lines: string[] = [];
  const code = runCli(["--body-file", bodyFile(body)], {}, (line) => lines.push(line));
  return { code, out: lines.join("\n") };
}

describe("seam line gate", () => {
  test("missing line fails", () => {
    const { code, out } = cli("## What changed\n\nTidied the HUD.\n");
    expect(code).toBe(1);
    expect(out).toContain("no \"Engine seam: \" line");
    expect(out).toContain("Engine seam: packages/<pkg>/src/<file>");
    expect(out).toContain("Engine seam: none - <reason, 10+ characters>");
  });

  test("short none reason fails, and a bare none fails too", () => {
    const short = cli("Engine seam: none - too short");
    expect(short.code).toBe(1);
    expect(short.out).toContain("10+ characters");

    const bare = cli("Engine seam: none\n");
    expect(bare.code).toBe(1);
    expect(bare.out).toContain("10+ characters");
  });

  test("a named seam with a package path passes", () => {
    const { code, out } = cli("## Engine seam\nEngine seam: packages/shell/src/render/frame.ts (adopts #1234)\n");
    expect(code).toBe(0);
    expect(out).toBe("seam check: OK - packages/shell/src/render/frame.ts (adopts #1234)");
  });

  test("a dependency-bump body passes with none - dependency catalog only", () => {
    const { code, out } = cli("## What changed\nCatalog to 0.33.0.\n\nEngine seam: none - dependency catalog only\n");
    expect(code).toBe(0);
    expect(out).toBe("seam check: OK - no seam: dependency catalog only");
  });
});

describe("seam line gate details", () => {
  test("a seam with no path or issue fails", () => {
    const { code, out } = cli("Engine seam: added shared ammo handling\n");
    expect(code).toBe(1);
    expect(out).toContain("names no path or issue");
  });

  test("an issue number or package name is enough", () => {
    expect(checkPrBody("Engine seam: adopts #1234").ok).toBe(true);
    expect(checkPrBody("Engine seam: @jgengine/core").ok).toBe(true);
  });

  test("the line is case-sensitive and cannot be quoted", () => {
    expect(cli("engine seam: packages/shell/src/x.ts").code).toBe(1);
    expect(cli("> Engine seam: packages/shell/src/x.ts").code).toBe(1);
  });

  test("the empty template line fails", () => {
    const { code, out } = cli("## Engine seam\nEngine seam:\n");
    expect(code).toBe(1);
    expect(out).toContain("empty");
  });

  test("a short none reason counts characters after the dash", () => {
    expect(checkPrBody("Engine seam: none - 123456789").ok).toBe(false);
    expect(checkPrBody("Engine seam: none - 1234567890").ok).toBe(true);
  });

  test("CI reads pull_request.body from GITHUB_EVENT_PATH", () => {
    const missing: string[] = [];
    const bad = runCli([], { GITHUB_EVENT_PATH: eventFile({ pull_request: { body: "no line here" } }) }, (line) =>
      missing.push(line),
    );
    expect(bad).toBe(1);
    expect(missing.join("\n")).toContain("no \"Engine seam: \" line");

    const good: string[] = [];
    const ok = runCli(
      [],
      { GITHUB_EVENT_PATH: eventFile({ pull_request: { body: "Engine seam: none - dependency bump only" } }) },
      (line) => good.push(line),
    );
    expect(ok).toBe(0);
  });

  test("a push event prints one pass line and exits 0", () => {
    const lines: string[] = [];
    const code = runCli([], { GITHUB_EVENT_PATH: eventFile({ ref: "refs/heads/beta", after: "abc" }) }, (line) =>
      lines.push(line),
    );
    expect(code).toBe(0);
    expect(lines).toEqual(["seam check: OK - no PR body (push event), nothing to check"]);
  });

  test("--body-file wins over a CI event payload", () => {
    const lines: string[] = [];
    const code = runCli(
      ["--body-file", bodyFile("Engine seam: none - dependency catalog only")],
      { GITHUB_EVENT_PATH: eventFile({ pull_request: { body: "" } }) },
      (line) => lines.push(line),
    );
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("dependency catalog only");
  });
});
