import { describe, expect, test } from "bun:test";

import {
  DECLINE_MIN,
  checkDeclarations,
  ledgerDrift,
  probeMatches,
  type Declaration,
  type Ledger,
} from "./capabilities";

const ledger: Ledger = {
  generatedBy: "test",
  engineVersion: "1.2.3",
  gameFacingRule: "probed capabilities only",
  capabilities: [
    {
      id: "mission-runtime",
      packages: ["@jgengine/core"],
      module: "@jgengine/core/mission/mission",
      gameFacing: true,
      probe: { kind: "devtools" },
      intent: "run missions",
    },
    {
      id: "audio-probe",
      packages: ["@jgengine/shell"],
      module: "@jgengine/shell/audio/audioProbe",
      gameFacing: true,
      probe: { kind: "window", global: "__jgengineAudio" },
      intent: "read the mix",
    },
  ],
};

const declaration = (overrides: Partial<Declaration> = {}): Declaration => ({
  adopts: ["mission-runtime"],
  probes: { "@jgengine/core/mission/mission": ["campaign"] },
  declines: { "audio-probe": "This game ships no audio, so there is no mix to read." },
  ...overrides,
});

describe("missing declaration", () => {
  test("a game-facing capability nobody declared fails and names game, capability and module", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ adopts: [], probes: {}, declines: {} }) },
    ]);
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]!.message).toContain("ember");
    expect(report.problems[0]!.message).toContain("mission-runtime");
    expect(report.problems[0]!.message).toContain("@jgengine/core/mission/mission");
    expect(report.problems[0]!.message).toContain("adopt it");
    expect(report.problems[0]!.message).toContain("decline");
  });

  test("a complete declaration passes", () => {
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: declaration() }]);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(1);
    expect(report.declined).toBe(1);
  });

  test("a missing declaration file fails with the generating command", () => {
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: null }]);
    expect(report.problems[0]!.message).toContain("ember/capabilities.json is missing");
    expect(report.problems[0]!.message).toContain("capabilities:declare");
  });
});

describe("decline reasons", () => {
  test(`a reason under ${DECLINE_MIN} characters fails and names the capability`, () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ declines: { "audio-probe": "no audio" } }) },
    ]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("ember declines");
    expect(report.problems[0]!.message).toContain("audio-probe");
    expect(report.problems[0]!.message).toContain("8-character reason");
    expect(report.problems[0]!.message).toContain(`${DECLINE_MIN}+ characters`);
  });

  test("an empty or whitespace-only reason fails", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ declines: { "audio-probe": "                      " } }) },
    ]);
    expect(report.problems[0]!.capability).toBe("audio-probe");
  });
});

describe("stale ledger", () => {
  test("a newly shipped capability makes the checked ledger stale", () => {
    const installed: Ledger = {
      ...ledger,
      capabilities: [
        ...ledger.capabilities,
        {
          id: "traffic",
          packages: ["@jgengine/core"],
          module: "@jgengine/core/nav/traffic",
          gameFacing: true,
          probe: { kind: "devtools" },
          intent: "drive traffic",
        },
      ],
    };
    const drift = ledgerDrift(ledger, installed);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('added "traffic"');
    expect(drift[0]).toContain("@jgengine/core/nav/traffic");
    expect(drift[0]).toContain("no game declares it yet");
  });

  test("a matching ledger is fresh", () => {
    expect(ledgerDrift(ledger, ledger)).toEqual([]);
  });

  test("an engine version bump is reported", () => {
    expect(ledgerDrift(ledger, { ...ledger, engineVersion: "1.2.4" })).toContain(
      "engine version 1.2.3 -> 1.2.4",
    );
  });
});

describe("probe expectations", () => {
  test("wildcards match live devtools probe keys", () => {
    expect(probeMatches("park.staff.*", ["park.staff.greeter", "park.staff.cleaner"])).toBe(true);
    expect(probeMatches("park.staff.*", ["park.guest.1"])).toBe(false);
    expect(probeMatches("ember-command campaign", ["ember-command campaign"])).toBe(true);
  });

  test("dots and dashes are literal", () => {
    expect(probeMatches("harbor.traffic", ["harborXtraffic"])).toBe(false);
  });

  test("an adopted capability with no probe is reported as declaration-level", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ probes: {} }) },
    ]);
    expect(report.problems).toEqual([]);
    expect(report.declarationLevel).toEqual([
      { game: "ember", capability: "mission-runtime", module: "@jgengine/core/mission/mission" },
    ]);
  });

  test("a probe for a module the game does not adopt fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          adopts: ["audio-probe"],
          probes: { "@jgengine/core/mission/mission": ["campaign"] },
        }),
      },
    ]);
    expect(report.problems.some((problem) => problem.message.includes("adopts none of its capabilities"))).toBe(true);
  });
});
