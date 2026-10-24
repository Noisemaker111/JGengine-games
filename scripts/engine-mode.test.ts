import { describe, expect, test } from "bun:test";

import { installSurface } from "./engine-mode";

const base = {
  name: "jgengine-games",
  scripts: { "verify:fast": "bun scripts/verify-fast.ts" },
  workspaces: { packages: ["*"], catalog: { "@jgengine/core": "0.38.3" } },
};

describe("what an install can change", () => {
  test("a new script or a prose edit keeps the install surface", () => {
    const edited = { ...base, description: "different prose", scripts: { ...base.scripts, "check:engine-mode": "bun scripts/engine-mode-check.ts" } };
    expect(installSurface(edited)).toBe(installSurface(base));
  });

  test("a catalog bump or a dependency change does not", () => {
    const bumped = { ...base, workspaces: { ...base.workspaces, catalog: { "@jgengine/core": "0.38.4" } } };
    expect(installSurface(bumped)).not.toBe(installSurface(base));
    expect(installSurface({ ...base, dependencies: { three: "^0.182.0" } })).not.toBe(installSurface(base));
  });
});
