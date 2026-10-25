import { describe, expect, test } from "bun:test";

import { catalogVersion, runCli, verdict } from "./ci-pin-released";

const PIN = "8be64264aa00bb11cc22dd33ee44ff5566778899";
const RELEASE = "0248b68b4cb6d9ed4379fdf33f32dce532b9b098";
const PKG = JSON.stringify({ workspaces: { packages: ["*"], catalog: { "@jgengine/core": "0.41.0" } } });

async function run(status: "identical" | "behind" | "ahead" | "diverged" | "unknown", releaseSha: string | null = RELEASE) {
  const lines: string[] = [];
  const compared: string[][] = [];
  const code = await runCli([PIN], {
    readPackageJson: () => PKG,
    releaseSha: () => releaseSha,
    compare: async (base, head) => {
      compared.push([base, head]);
      return status;
    },
    write: (line) => lines.push(line),
  });
  return { code, line: lines.join("\n"), compared };
}

describe("is the pinned engine commit released", () => {
  test("a pin that is the release commit, or behind it, can land", async () => {
    expect((await run("identical")).code).toBe(0);
    const behind = await run("behind");
    expect(behind.code).toBe(0);
    expect(behind.line).toContain("contained in published 0.41.0 (0248b68b)");
    expect(behind.compared).toEqual([[RELEASE, PIN]]);
  });

  test("a pin newer than the published catalog fails, naming the pin, the version and the way out (#240)", async () => {
    const ahead = await run("ahead");
    expect(ahead.code).toBe(1);
    expect(ahead.line).toContain("engine pin 8be64264");
    expect(ahead.line).toContain("published 0.41.0 (0248b68b), which does not contain it");
    expect(ahead.line).toContain("drop the Engine pin line");
    expect((await run("diverged")).code).toBe(1);
  });

  test("not being able to answer is a failure, not a pass", async () => {
    expect((await run("unknown")).code).toBe(1);
    const noHead = await run("behind", null);
    expect(noHead.code).toBe(1);
    expect(noHead.line).toContain("npm names no commit for @jgengine/core@0.41.0");
  });

  test("an argument that is not a sha fails before any lookup", async () => {
    const lines: string[] = [];
    expect(await runCli(["0.41.0"], { write: (line) => lines.push(line) })).toBe(1);
    expect(lines[0]).toContain("expected an engine commit sha");
  });

  test("the catalog version is read from the root workspace catalog", () => {
    expect(catalogVersion(PKG)).toBe("0.41.0");
    expect(catalogVersion(JSON.stringify({ workspaces: { packages: ["*"] } }))).toBeNull();
    expect(verdict({ pin: PIN, version: "0.41.0", releaseSha: RELEASE, status: "behind" }).ok).toBe(true);
  });
});
