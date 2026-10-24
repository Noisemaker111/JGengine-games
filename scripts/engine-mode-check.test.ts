import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkEngineMode, namedCommit, pinLine, runCli, withPinLine, type EngineFacts } from "./engine-mode-check";

const SHA = "e62f4ae9d2b2c1a0f0e1d2c3b4a5968778695a4b";

function facts(overrides: Partial<EngineFacts> = {}): EngineFacts {
  return {
    installed: "published",
    recorded: "published",
    catalogVersion: "0.38.3",
    installedVersions: [
      { name: "@jgengine/core", version: "0.38.3" },
      { name: "@jgengine/shell", version: "0.38.3" },
    ],
    pinned: null,
    ...overrides,
  };
}

const pinned = (overrides: Partial<EngineFacts> = {}): EngineFacts =>
  facts({
    installed: "pinned",
    recorded: "pinned",
    installedVersions: [
      { name: "@jgengine/core", version: "0.38.4" },
      { name: "@jgengine/shell", version: "0.38.4" },
    ],
    pinned: { sha: SHA, short: "e62f4ae9" },
    ...overrides,
  });

describe("published mode passes cleanly", () => {
  test("the catalog install with matching versions agrees, with no pin line", () => {
    const verdict = checkEngineMode(facts(), "## What changed\n\nTidied the HUD.\n");
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain("published 0.38.3");
  });

  test("a push event with no PR body still passes", () => {
    expect(checkEngineMode(facts(), undefined).ok).toBe(true);
  });

  test("a milestone body may name the commit it releases without failing", () => {
    const verdict = checkEngineMode(facts(), `## What changed\n\nCatalog to 0.38.4.\n\n${pinLine(SHA)}\n`);
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain("names pinned e62f4ae9d2b2");
  });
});

describe("the catalog and the installed tree must be the same install", () => {
  test("a half-restored link fails and names the package", () => {
    const verdict = checkEngineMode(
      facts({ installedVersions: [{ name: "@jgengine/core", version: "0.38.4" }, { name: "@jgengine/shell", version: "0.38.3" }] }),
      undefined,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("catalog names 0.38.3");
    expect(verdict.message).toContain("@jgengine/core 0.38.4");
    expect(verdict.message).toContain("engine:published");
  });

  test("a package with no installed copy fails rather than passing as null", () => {
    const verdict = checkEngineMode(facts({ installedVersions: [{ name: "@jgengine/core", version: "missing" }] }), undefined);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("@jgengine/core missing");
  });

  test("a state file that disagrees with the installed tree fails in both directions", () => {
    const stalePin = checkEngineMode(pinned({ recorded: "published" }), `Engine pin: ${SHA}`);
    expect(stalePin.ok).toBe(false);
    expect(stalePin.message).toContain("records published but pinned is what is installed");

    const stalePublish = checkEngineMode(facts({ recorded: "pinned" }), undefined);
    expect(stalePublish.ok).toBe(false);
    expect(stalePublish.message).toContain("records pinned but published is what is installed");
  });
});

describe("pinned mode must name the commit it installed", () => {
  test("the matching commit passes and says the catalog is another install", () => {
    const verdict = checkEngineMode(pinned(), `## Engine seam\nEngine seam: none - scripts only\n\n${pinLine(SHA)}\n`);
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain("pinned e62f4ae9");
    expect(verdict.message).toContain("catalog 0.38.3 is a different install");
  });

  test("a missing line fails and says exactly what to write", () => {
    const verdict = checkEngineMode(pinned(), "## Engine seam\nEngine seam: none - scripts only\n");
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('no "Engine pin: " line');
    expect(verdict.message).toContain("Engine pin: <7-40 hex characters");
  });

  test("a body that names another commit fails, naming both", () => {
    const verdict = checkEngineMode(pinned(), `Engine pin: 9f5b952e`);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("PR names 9f5b952e");
    expect(verdict.message).toContain("pinned commit e62f4ae9");
  });

  test("a short prefix matches, a long or non-hex value does not", () => {
    expect(checkEngineMode(pinned(), "Engine pin: e62f4ae").ok).toBe(true);
    expect(checkEngineMode(pinned(), "Engine pin: e62f4a").ok).toBe(false);
    expect(checkEngineMode(pinned(), "Engine pin: zzzz1234").ok).toBe(false);
    expect(checkEngineMode(pinned(), "Engine pin: 0.38.4").ok).toBe(false);
  });

  test("an empty line or a snapshot with no marker fails", () => {
    expect(checkEngineMode(pinned(), "Engine pin:\n").ok).toBe(false);
    expect(checkEngineMode(pinned(), "Engine pin:   \n").ok).toBe(false);
    const noMarker = checkEngineMode(pinned({ pinned: null }), `Engine pin: ${SHA}`);
    expect(noMarker.ok).toBe(false);
    expect(noMarker.message).toContain("no readable identity marker");
  });
});

describe("local mode never proves a commit", () => {
  test("it fails with the pin command to run", () => {
    const verdict = checkEngineMode(facts({ installed: "local", recorded: "local" }), `Engine pin: ${SHA}`);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("proves no commit");
    expect(verdict.message).toContain("bun run engine:pin --ref <sha>");
  });
});

describe("the evidence line itself", () => {
  test("it is one line, case-sensitive and unquoted", () => {
    expect(namedCommit(`Engine pin: ${SHA}`).sha).toBe(SHA);
    expect(namedCommit(`engine pin: ${SHA}`).problem).toContain("no \"Engine pin: \" line");
    expect(namedCommit(`> Engine pin: ${SHA}`).problem).toContain("no \"Engine pin: \" line");
    expect(namedCommit(`Engine pin: ${SHA} (engine beta)`).sha).toBe(SHA);
  });

  test("withPinLine replaces an existing line instead of adding a second", () => {
    const once = withPinLine("Engine pin: 9f5b952e\n", SHA);
    expect(once.match(/Engine pin: /g)?.length).toBe(1);
    expect(once).toContain(SHA.slice(0, 12));
    const added = withPinLine("## What changed\n\nHUD.\n", SHA);
    expect(added).toContain("## Engine pin");
    expect(checkEngineMode(pinned(), added).ok).toBe(true);
  });
});

describe("the CLI a lane and CI run", () => {
  const roots: string[] = [];
  const bodyFile = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "engine-mode-"));
    roots.push(dir);
    const path = join(dir, "body.md");
    writeFileSync(path, body);
    return path;
  };
  const eventFile = (payload: unknown): string => {
    const dir = mkdtempSync(join(tmpdir(), "engine-mode-event-"));
    roots.push(dir);
    const path = join(dir, "event.json");
    writeFileSync(path, JSON.stringify(payload));
    return path;
  };

  test("it reads the body from --body-file and from the CI event payload", () => {
    const lines: string[] = [];
    const fromFile = runCli(["--body-file", bodyFile("Engine seam: none - dependency bump only")], {}, (line) => lines.push(line), {
      readFacts: () => facts(),
    });
    expect(fromFile).toBe(0);
    expect(lines.join("\n")).toContain("published");

    const fromEvent: string[] = [];
    const fromCi = runCli(
      [],
      { GITHUB_EVENT_PATH: eventFile({ pull_request: { body: "Engine seam: none - dependency bump only" } }) },
      (line) => fromEvent.push(line),
      { readFacts: () => facts() },
    );
    expect(fromCi).toBe(0);
    expect(fromEvent.join("\n")).toContain("published");
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("a pinned lane with no body exits 3, so it cannot pass on silence", () => {
    const lines: string[] = [];
    const code = runCli([], {}, (line) => lines.push(line), { readFacts: () => pinned() });
    expect(code).toBe(3);
    expect(lines.join("\n")).toContain("no PR body to check");
  });
});
