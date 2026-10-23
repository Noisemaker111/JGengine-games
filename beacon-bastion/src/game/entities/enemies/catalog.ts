/** Fresnel rim tuned per raider so its edge separates from the road it walks on. */
export interface CreepRim {
  color: string;
  strength: number;
  power?: number;
}

export interface CreepDef {
  id: string;
  label: string;
  /** A named raider's name, shown after the label ("Captain Ironjaw"). Composed elites carry one. */
  title?: string;
  health: number;
  speed: number;
  /** The unit's weight in gold at wave 1; the wave and a relic multiply it (`waves/bounty.ts`). */
  bounty: number;
  leak: number;
  /** Visual size, and the hitbox it derives. The default camera puts about seven vertical pixels on one world unit, so this carries most of the "which raider is that" answer. */
  scale: number;
  /** Character model in the kaykit-adventurers pack: a hooded point, an armoured bulk, a broad body with an axe over the shoulder. */
  model: string;
  fallbackModel: string;
  /** Body tint, multiplied over the model's own texture - the arena is warm tan and green, so each raider carries a hue the ground never has. */
  color: string;
  rim: CreepRim;
}

export const CREEP_CATALOG: Record<string, CreepDef> = {
  raider_scout: {
    id: "raider_scout",
    label: "Scout",
    health: 20,
    speed: 3.6,
    bounty: 4,
    leak: 1,
    scale: 0.8,
    model: "kaykit-adventurers/Rogue_Hooded",
    fallbackModel: "kaykit-skeletons/Skeleton_Rogue",
    color: "#9be8ff",
    rim: { color: "#ffe4b0", strength: 1.8, power: 2.4 },
  },
  raider_grunt: {
    id: "raider_grunt",
    label: "Grunt",
    health: 46,
    speed: 2.35,
    bounty: 6,
    leak: 1,
    scale: 1.15,
    model: "kaykit-adventurers/Knight",
    fallbackModel: "kaykit-skeletons/Skeleton_Warrior",
    color: "#bcd2ff",
    rim: { color: "#dbe8ff", strength: 2.2, power: 2.4 },
  },
  raider_elite: {
    id: "raider_elite",
    label: "Elite",
    health: 95,
    speed: 2.2,
    bounty: 10,
    leak: 1,
    scale: 1.35,
    model: "kaykit-adventurers/Knight",
    fallbackModel: "kaykit-skeletons/Skeleton_Warrior",
    color: "#f2d16b",
    rim: { color: "#fff0b8", strength: 3, power: 2 },
  },
  raider_warden: {
    id: "raider_warden",
    label: "The Warden",
    health: 1400,
    speed: 1.1,
    bounty: 90,
    leak: 6,
    scale: 1.95,
    model: "kaykit-adventurers/Barbarian",
    fallbackModel: "kaykit-skeletons/Skeleton_Minion",
    color: "#ff5c4d",
    rim: { color: "#ffd2c4", strength: 3.4, power: 1.8 },
  },
  raider_brute: {
    id: "raider_brute",
    label: "Brute",
    health: 150,
    speed: 1.5,
    bounty: 15,
    leak: 2,
    scale: 1.6,
    model: "kaykit-adventurers/Barbarian",
    fallbackModel: "kaykit-skeletons/Skeleton_Minion",
    color: "#ff8a7a",
    rim: { color: "#fff2d6", strength: 2.6, power: 2 },
  },
  // Named elites the composer calls up from wave 7. Same pack as the anonymous raiders, a heavier
  // stat line and a louder hue so one is recognisable on the road at the default camera.
  raider_captain: {
    id: "raider_captain",
    label: "Captain",
    title: "Ironjaw",
    health: 175,
    speed: 2,
    bounty: 18,
    leak: 1,
    scale: 1.45,
    model: "kaykit-adventurers/Knight",
    fallbackModel: "kaykit-skeletons/Skeleton_Warrior",
    color: "#b7f7c0",
    rim: { color: "#e9ffd6", strength: 3, power: 2 },
  },
  raider_reaver: {
    id: "raider_reaver",
    label: "Reaver",
    title: "Sable",
    health: 130,
    speed: 2.85,
    bounty: 16,
    leak: 1,
    scale: 1.3,
    model: "kaykit-adventurers/Rogue_Hooded",
    fallbackModel: "kaykit-skeletons/Skeleton_Rogue",
    color: "#e7a4ff",
    rim: { color: "#f5d9ff", strength: 2.8, power: 2.2 },
  },
  raider_breaker: {
    id: "raider_breaker",
    label: "Breaker",
    title: "Hollow",
    health: 260,
    speed: 1.75,
    bounty: 24,
    leak: 2,
    scale: 1.7,
    model: "kaykit-adventurers/Barbarian",
    fallbackModel: "kaykit-skeletons/Skeleton_Minion",
    color: "#8fd0ff",
    rim: { color: "#d8efff", strength: 3, power: 1.9 },
  },
  raider_warlord: {
    id: "raider_warlord",
    label: "The Warlord",
    health: 2200,
    speed: 1.2,
    bounty: 140,
    leak: 8,
    scale: 2.1,
    model: "kaykit-adventurers/Barbarian",
    fallbackModel: "kaykit-skeletons/Skeleton_Minion",
    color: "#ff7a1f",
    rim: { color: "#ffd9a8", strength: 3.6, power: 1.7 },
  },
};

/** A raider's display name: its name when it has one, else its role. */
export function creepName(id: string): string {
  const def = CREEP_CATALOG[id];
  if (def === undefined) return id;
  return def.title === undefined ? def.label : `${def.label} ${def.title}`;
}

export function creepDef(id: string): CreepDef {
  const def = CREEP_CATALOG[id];
  if (def === undefined) throw new Error(`beacon-bastion: unknown creep id "${id}"`);
  return def;
}



