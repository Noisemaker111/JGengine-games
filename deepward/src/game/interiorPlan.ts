import { planInteriorDressing, type InteriorClearance, type InteriorClutterSlot, type InteriorDressingOptions, type InteriorDressingPlan } from "@jgengine/core/world/interiorDressing";

import type { Stratum } from "./strata";

/** A floor rectangle: centre and size on the ground plane. */
export interface FloorRect { x: number; z: number; w: number; d: number }

/**
 * How densely each floor is dressed. Receiving is a working dock (racks, crates, pipe runs), the
 * cold stores are bare tiled aisles under strip lamps, the ink wells drip and rust, and the choir is
 * near-empty concrete with tall ribs, so the floors read as different places before any prop does.
 */
export const DRESSING: Readonly<Record<Stratum, Omit<InteriorDressingOptions, "seed" | "floorY" | "ceilingY" | "keepClear">>> = {
  vault: {
    trims: { skirting: 0.16, rail: 1.05, crown: true, ribSpacing: 4 },
    pipes: { perWall: 2, radius: 0.075, drops: 0.3 },
    cables: { chance: 0.55 },
    decals: { grime: 0.7, leaks: 0.08, rust: 0.06, floor: 0.04, wet: 0.012 },
    fixtures: { spacing: 7, drop: 0.55 },
    clutter: { spacing: 2.6, chance: 0.45 },
  },
  cold: {
    trims: { skirting: 0.2, rail: false, crown: true, ribSpacing: 3 },
    pipes: { perWall: 1, radius: 0.09, drops: 0.15 },
    cables: { chance: 0.25 },
    decals: { grime: 0.45, leaks: 0.05, rust: 0.03, floor: 0.03, wet: 0 },
    fixtures: { spacing: 6, drop: 0.45 },
    clutter: { spacing: 2.6, chance: 0.45 },
  },
  wells: {
    trims: { skirting: 0.12, rail: false, crown: false, ribSpacing: 2.6 },
    pipes: { perWall: 3, radius: 0.1, drops: 0.45 },
    cables: { chance: 0.85, sag: 0.32 },
    decals: { grime: 0.9, leaks: 0.4, rust: 0.3, floor: 0.07, wet: 0.06 },
    fixtures: { spacing: 9, drop: 0.6 },
    clutter: { spacing: 2.2, chance: 0.55 },
  },
  choir: {
    trims: { skirting: 0.28, rail: false, crown: true, ribSpacing: 2.5 },
    pipes: { perWall: 1, radius: 0.12, drops: 0.1 },
    cables: { chance: 0.2, sag: 0.4 },
    decals: { grime: 0.8, leaks: 0.2, rust: 0.05, floor: 0.03, wet: 0.02 },
    fixtures: { spacing: 8, drop: 0.9 },
    clutter: { spacing: 3.2, chance: 0.22 },
  },
};

/** The clutter props each floor draws from: real-size CC0 library models, picked per slot. */
export const FLOOR_PROPS: Readonly<Record<Stratum, readonly string[]>> = {
  vault: ["industrial/metal-rack", "industrial/plastic-crate", "industrial/wooden-crate", "industrial/hand-truck", "industrial/tool-chest", "office/fire-extinguisher", "industrial/power-box"],
  cold: ["industrial/plastic-crate", "industrial/metal-rack", "industrial/compressor", "industrial/propane-tank", "industrial/military-crate"],
  wells: ["industrial/barrel", "industrial/propane-tank", "survival/jerrycan", "industrial/generator", "industrial/military-crate", "industrial/barrel"],
  choir: ["industrial/military-crate", "survival/ammo-box", "industrial/barrel"],
};

/** A floor's dressing plan plus which library prop stands in each clutter slot. */
export interface FloorDressing { plan: InteriorDressingPlan; props: { slot: InteriorClutterSlot; model: string }[] }

function overlaps(slot: InteriorClutterSlot, block: FloorRect, margin: number): boolean {
  const across = Math.abs(Math.sin(slot.rotationY)) > 0.5;
  const w = across ? slot.depth : slot.width, d = across ? slot.width : slot.depth;
  return Math.abs(slot.position[0] - block.x) < (w + block.w) / 2 + margin && Math.abs(slot.position[2] - block.z) < (d + block.d) / 2 + margin;
}

/**
 * Plan one floor's dressing from its authored rooms. Everything here is derived: the walls come
 * from the room footprints, nothing on the floor covers a kept-clear spot (lifts, pickups, spawns)
 * and no prop stands inside an authored structure.
 */
export function planFloorDressing(stratum: Stratum, rooms: readonly FloorRect[], floorY: number, ceilingY: number, keepClear: readonly InteriorClearance[], blocks: readonly FloorRect[]): FloorDressing {
  const plan = planInteriorDressing(rooms, { seed: `deepward:${stratum}`, floorY, ceilingY, keepClear, ...DRESSING[stratum] });
  const pool = FLOOR_PROPS[stratum];
  const clutter = plan.clutter.filter(slot => !blocks.some(block => overlaps(slot, block, 0.15)));
  return { plan: { ...plan, clutter }, props: clutter.map(slot => ({ slot, model: pool[Math.min(pool.length - 1, Math.floor(slot.pick * pool.length))]! })) };
}

/** The ground a clutter prop takes up, as a box the walk check can test. */
export function clutterFootprint(slot: InteriorClutterSlot): FloorRect {
  const across = Math.abs(Math.sin(slot.rotationY)) > 0.5;
  return { x: slot.position[0], z: slot.position[2], w: across ? slot.depth : slot.width, d: across ? slot.width : slot.depth };
}
