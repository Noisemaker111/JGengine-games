import { describe, expect, test } from "bun:test";

import {
  DECLINE_MIN,
  checkDeclarations,
  ledgerDrift,
  namesDomain,
  probeMatches,
  renderSummary,
  type Declaration,
  type IssueState,
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
      domain: "mission runtime",
      gameFacing: true,
      probe: { kind: "devtools" },
      intent: "run missions",
    },
    {
      id: "audio-probe",
      packages: ["@jgengine/shell"],
      module: "@jgengine/shell/audio/audioProbe",
      domain: "audio mix",
      gameFacing: true,
      probe: { kind: "window", global: "__jgengineAudio" },
      intent: "read the mix",
    },
  ],
};

const OPEN = new Map<number, IssueState>([
  [101, { state: "open" }],
  [102, { state: "closed" }],
]);

const declaration = (overrides: Partial<Declaration> = {}): Declaration => ({
  adopts: ["mission-runtime"],
  probes: { "@jgengine/core/mission/mission": ["campaign"] },
  declines: {
    "audio-probe": {
      kind: "not-applicable",
      reason: "No audio mix is published: this game ships synth-free silence.",
    },
  },
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
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: declaration() }], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(1);
    expect(report.notApplicable).toBe(1);
    expect(report.debt).toBe(0);
  });

  test("a missing declaration file fails with the generating command", () => {
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: null }]);
    expect(report.problems[0]!.message).toContain("ember/capabilities.json is missing");
    expect(report.problems[0]!.message).toContain("capabilities:declare");
  });
});

describe("decline kinds", () => {
  test("the old boilerplate sentence is rejected even at 20+ characters", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": {
              kind: "not-applicable",
              reason: "Not adopted: this game does not run the engine audio-probe system.",
            },
          },
        }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("ember declines");
    expect(report.problems[0]!.message).toContain("Not adopted");
  });

  test("a reason that does not name the domain fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: { "audio-probe": { kind: "not-applicable", reason: "This game does not need one of those." } },
        }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("audio mix");
  });

  test("a bare string decline is rejected as ambiguous", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: { "audio-probe": "No audio mix is published here." as unknown as Declaration["declines"][string] },
        }),
      },
    ], OPEN);
    expect(report.problems[0]!.message).toContain('{"kind"');
  });

  test(`a reason under ${DECLINE_MIN} characters fails and names the capability`, () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: { "audio-probe": { kind: "not-applicable", reason: "no audio" } },
        }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("ember declines");
    expect(report.problems[0]!.message).toContain("audio-probe");
    expect(report.problems[0]!.message).toContain("8-character reason");
    expect(report.problems[0]!.message).toContain(`${DECLINE_MIN}+ characters`);
  });

  test("two games with the same reason are a template, not two answers", () => {
    const reason = "No audio mix: this game has no sounds at all.";
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ declines: { "audio-probe": { kind: "not-applicable", reason } } }) },
      { game: "harbor", declaration: declaration({ declines: { "audio-probe": { kind: "not-applicable", reason } } }) },
    ], OPEN);
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]!.message).toContain("same decline reason");
  });

  test("a not-applicable entry carrying an issue fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": { kind: "not-applicable", reason: "No audio mix is published here.", issue: 101 },
          },
        }),
      },
    ], OPEN);
    expect(report.problems[0]!.message).toContain("not-applicable but names issue");
  });

  test("namesDomain accepts plural forms", () => {
    expect(namesDomain("Two mission runtimes would duplicate this.", "mission runtime")).toBe(true);
    expect(namesDomain("No such thing here.", "mission runtime")).toBe(false);
  });
});

describe("debt ownership", () => {
  const debtReason = "We have not adopted the shared audio mix; buses are wired by hand.";

  test("debt without an owner issue fails", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason } } }) },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("no owner");
  });

  test("debt whose issue is closed fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 102 } } }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("is closed");
  });

  test("debt whose issue does not exist fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 999 } } }),
      },
    ], new Map([[999, { state: "missing" as const }]]));
    expect(report.problems[0]!.message).toContain("does not have");
  });

  test("debt against an open issue passes and counts as debt", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 101 } } }),
      },
    ], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.debt).toBe(1);
    expect(report.notApplicable).toBe(0);
    expect(report.debtEntries).toEqual([{ game: "ember", capability: "audio-probe", issue: 101 }]);
  });

  test("a correct pair passes: one domain absent, one gap owned by an open issue", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": { kind: "debt", reason: debtReason, issue: 101 },
            "mission-runtime": {
              kind: "not-applicable",
              reason: "No mission runtime: this game has one endless skirmish and no objectives.",
            },
          },
          adopts: [],
          probes: {},
        }),
      },
    ], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.tallies).toEqual([{ game: "ember", adopted: 0, notApplicable: 1, debt: 1 }]);
  });
});

describe("summary table", () => {
  test("prints one row per game with adopted, not-applicable and debt counts", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": { kind: "debt", reason: "The shared audio mix is not adopted here yet.", issue: 101 },
          },
        }),
      },
      {
        game: "harbor",
        declaration: declaration({
          adopts: [],
          probes: {},
          declines: {
            "mission-runtime": { kind: "not-applicable", reason: "No mission runtime: courier routes have no objectives." },
            "audio-probe": { kind: "not-applicable", reason: "No audio mix is published in this game either." },
          },
        }),
      },
    ], OPEN);
    const table = renderSummary(report, ledger);
    expect(table).toContain("2 game-facing capabilities, engine 1.2.3");
    expect(table).toContain("ember");
    expect(table).toContain("harbor");
    expect(table).toContain("TOTAL");
    expect(table).toMatch(/ember\s+1\s+0\s+1/);
    expect(table).toMatch(/harbor\s+0\s+2\s+0/);
    expect(table).toContain("1 entry across 1 game(s)");
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
          domain: "traffic",
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
    ], OPEN);
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
    ], OPEN);
    expect(report.problems.some((problem) => problem.message.includes("adopts none of its capabilities"))).toBe(true);
  });
});
