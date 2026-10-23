import type { BossPhase } from "@jgengine/core/ai/director/boss";
import type { EncounterDefinition } from "@jgengine/core/ai/director/encounter";
import type { PressureRule } from "@jgengine/core/ai/director/pressure";

import { SPAWN_POINT_KEY } from "../world/path";

/**
 * The raider host, authored as data. Each wave names its composition, the approach it uses, and the
 * second each group walks on; `escalates` marks the groups the director may thicken when the keep is
 * hurting. Nothing here spawns anything — `waves/director.ts` turns orders into creeps.
 */
export const ENCOUNTER: EncounterDefinition = {
  id: "beacon-bastion",
  waves: [
    {
      id: "probe",
      label: "Probe",
      durationSeconds: 20,
      groups: [
        { unit: "raider_scout", entry: SPAWN_POINT_KEY, count: 5 },
        { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 2, at: 6 },
      ],
    },
    {
      id: "press",
      label: "Press",
      durationSeconds: 20,
      groups: [
        { unit: "raider_scout", entry: SPAWN_POINT_KEY, count: 5 },
        { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 4, at: 4, escalates: true },
        { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 1, at: 10 },
      ],
    },
    {
      id: "breakers",
      label: "Breakers",
      durationSeconds: 22,
      groups: [
        { unit: "raider_scout", entry: SPAWN_POINT_KEY, count: 3 },
        { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 5, at: 3, escalates: true },
        { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 2, at: 8, escalates: true },
        { unit: "raider_brute", entry: SPAWN_POINT_KEY, count: 1, at: 14 },
      ],
    },
    {
      id: "hammer",
      label: "Hammer",
      durationSeconds: 22,
      groups: [
        { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 6, escalates: true },
        { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 3, at: 5, escalates: true },
        { unit: "raider_brute", entry: SPAWN_POINT_KEY, count: 2, at: 11 },
      ],
    },
    {
      id: "tide",
      label: "Tide",
      durationSeconds: 24,
      groups: [
        { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 7, escalates: true },
        { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 4, at: 4, escalates: true },
        { unit: "raider_brute", entry: SPAWN_POINT_KEY, count: 2, at: 9 },
        { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 2, at: 15, elite: true },
      ],
    },
    {
      id: "warden",
      label: "The Warden",
      durationSeconds: 26,
      groups: [
        { unit: "raider_grunt", entry: SPAWN_POINT_KEY, count: 4, escalates: true },
        { unit: "raider_elite", entry: SPAWN_POINT_KEY, count: 2, at: 4, escalates: true },
        { unit: "raider_warden", entry: SPAWN_POINT_KEY, count: 1, at: 10 },
      ],
    },
  ],
};

export const TOTAL_WAVES = ENCOUNTER.waves.length;

export const DIRECTOR_SEED = 1337;

/** The Warden's id in the creep catalog, and the entity it becomes. */
export const WARDEN_ID = "raider_warden";

/**
 * How hard the director leans on a hurting keep. Player health, wave progress and time each weigh
 * in; `maxTier` 2 caps the whole plan, so a nearly-dead keep on a long match still sends tier 2.
 */
export const PRESSURE_RULE: PressureRule = {
  healthWeight: 1,
  progressWeight: 1,
  timeWeight: 0.4,
  timeFloorSeconds: 120,
  timeWindowSeconds: 480,
  maxTier: 2,
};

/**
 * The Warden's three phases. Thresholds and tells are engine data; what a phase *does* is this
 * game's stance table below, so the phase change is visible on the field.
 */
export const WARDEN_PHASES: readonly BossPhase[] = [
  { id: "opening", atHealth: 1, behaviour: {}, tell: { id: "arrival", telegraphSeconds: 2.5 } },
  { id: "enraged", atHealth: 0.6, behaviour: {}, tell: { id: "roar", telegraphSeconds: 2.5 } },
  { id: "last-stand", atHealth: 0.25, behaviour: {}, tell: { id: "dig-in", telegraphSeconds: 2.5 } },
];

/** What each Warden phase looks like on the approach: how fast it walks and what the HUD calls it. */
export const WARDEN_STANCE: Record<string, { speedScale: number; label: string }> = {
  opening: { speedScale: 1, label: "Opening" },
  enraged: { speedScale: 1.7, label: "Enraged" },
  "last-stand": { speedScale: 2.3, label: "Last Stand" },
};

/** The banner text for a Warden tell. */
export const WARDEN_TELL_TEXT: Record<string, string> = {
  arrival: "The Warden takes the field",
  roar: "The Warden roars — it moves faster",
  "dig-in": "The Warden makes its last stand",
};
