import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA, snapshotId, snapshotValid } from "./engine-pin";

function tree(): string {
  return mkdtempSync(join(tmpdir(), "engine-pin-test-"));
}

function marker(dir: string, packages: { dir: string; name: string; version: string }[], schema = SCHEMA): void {
  writeFileSync(
    join(dir, "snapshot.json"),
    JSON.stringify({ schema, sha: "a".repeat(40), short: "aaaaaaaa", ref: "HEAD", inputs: "b".repeat(64), engine: "x", bun: "1.4.3", builtAt: new Date().toISOString(), buildSeconds: 1, packages }),
  );
}

function built(dir: string, name: string): void {
  mkdirSync(join(dir, "packages", name, "dist"), { recursive: true });
  writeFileSync(join(dir, "packages", name, "package.json"), "{}");
  writeFileSync(join(dir, "packages", name, "dist", "index.js"), "");
}

const core = { dir: "core", name: "@jgengine/core", version: "0.36.0" };
const shell = { dir: "shell", name: "@jgengine/shell", version: "0.36.0" };

describe("engine snapshot cache", () => {
  test("a directory with no marker is never reused", () => {
    const dir = tree();
    try {
      built(dir, "core");
      expect(snapshotValid(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a finished snapshot is reused", () => {
    const dir = tree();
    try {
      for (const pkg of [core, shell]) built(dir, pkg.dir);
      marker(dir, [core, shell]);
      expect(snapshotValid(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a partial build is not reused: a package the marker names has no dist", () => {
    const dir = tree();
    try {
      built(dir, "core");
      mkdirSync(join(dir, "packages", "shell"), { recursive: true });
      marker(dir, [core, shell]);
      expect(snapshotValid(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a marker from an older layout is not reused", () => {
    const dir = tree();
    try {
      for (const pkg of [core, shell]) built(dir, pkg.dir);
      marker(dir, [core, shell], SCHEMA - 1);
      expect(snapshotValid(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("two commits, or two input hashes, never share a cache entry", () => {
    const one = "a".repeat(40);
    const two = "b".repeat(40);
    expect(snapshotId(one, "1".repeat(64))).not.toBe(snapshotId(two, "1".repeat(64)));
    expect(snapshotId(one, "1".repeat(64))).not.toBe(snapshotId(one, "2".repeat(64)));
    expect(snapshotId(one, "1".repeat(64))).toBe(snapshotId(one, "1".repeat(64)));
  });
});
