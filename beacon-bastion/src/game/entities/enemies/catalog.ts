/** Fresnel rim tuned per raider so its edge separates from the road it walks on. */
export interface CreepRim {
  color: string;
  strength: number;
  power?: number;
}

export interface CreepDef {
  id: string;
  label: string;
  health: number;
  speed: number;
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
};

export function creepDef(id: string): CreepDef {
  const def = CREEP_CATALOG[id];
  if (def === undefined) throw new Error(`beacon-bastion: unknown creep id "${id}"`);
  return def;
}



