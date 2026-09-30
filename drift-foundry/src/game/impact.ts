import type { EmitterConfig } from "@jgengine/core/vfx/particles";
import { ROUTE_GATES } from "./route/gates";
import type { SessionSnapshot } from "./run/session";

type ImpactSnapshot = Pick<SessionSnapshot, "phase" | "paused" | "runTime" | "pose" | "clearedGateIds" | "armorSavesUsed">;
export interface ImpactBurst {
  kind: "plow" | "landing" | "blocked" | "armor";
  config: EmitterConfig;
  count: number;
  blending: "additive" | "normal";
}

/** Visuals follow accepted simulation transitions; replaying a frame cannot emit again. */
export function impactBursts(before: ImpactSnapshot, after: ImpactSnapshot): ImpactBurst[] {
  if (before.phase !== "running" || before.paused || after.paused || after.runTime <= before.runTime) return [];
  const bursts: ImpactBurst[] = [];
  const [x, y, z] = after.pose.position;
  const dust = (kind: "plow" | "landing", position: readonly [number, number, number]): ImpactBurst => ({
    kind,
    blending: "normal",
    count: kind === "plow" ? 42 : 24,
    config: {
      position, spawnJitter: kind === "plow" ? [1.8, .45, .25] : [.9, .05, .6],
      direction: [0, 1, 0], spread: 1.3, speed: { min: 1.5, max: kind === "plow" ? 7 : 3.8 },
      gravity: [0, -9, 0], drag: .2, lifetime: { min: .3, max: .85 },
      size: { start: kind === "plow" ? .16 : .1, end: .03 },
      colorStart: kind === "plow" ? 0xb58b57 : 0xddc5a0, colorEnd: 0x66523b,
      alpha: { start: .9, end: 0 }, seed: `${kind}:${after.runTime}`,
    },
  });
  for (const gate of ROUTE_GATES) {
    if (gate.requirement === "plow" && after.clearedGateIds.has(gate.id) && !before.clearedGateIds.has(gate.id)) {
      bursts.push(dust("plow", [x, y + .45, gate.atZ]));
    }
  }
  if (before.pose.airborne && !after.pose.airborne) bursts.push(dust("landing", [x, y + .08, z]));
  const armor = after.armorSavesUsed > before.armorSavesUsed;
  if (armor || (!before.pose.blockedByGate && after.pose.blockedByGate)) {
    bursts.push({
      kind: armor ? "armor" : "blocked", blending: "additive", count: armor ? 32 : 14,
      config: {
        position: [x, y + .45, z + (armor ? -1.2 : 1.2)], spawnJitter: [.65, .15, .1],
        direction: [0, .7, armor ? 1 : -1], spread: 1, speed: { min: 2, max: 6 },
        gravity: [0, -10, 0], lifetime: { min: .12, max: .45 }, size: { start: .065, end: .015 },
        colorStart: 0xffdd73, colorEnd: 0xee6c26, alpha: { start: 1, end: 0 },
        seed: `${armor ? "armor" : "blocked"}:${after.runTime}`,
      },
    });
  }
  return bursts;
}
