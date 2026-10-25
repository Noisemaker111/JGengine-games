/**
 * The shape of `idea.ts`: every word, number and model the starter reads. `bun run new-game` writes
 * `idea.ts` from a plain-words idea; change a word, a cost or a model there and the game follows.
 */

export type PlayerKind = "walker" | "driver";
export type UiKitName = "ink" | "paper" | "parchment" | "terminal" | "holo" | "broadcast" | "arcade" | "signal";
export type LookName = "cinematic" | "photoreal" | "toon" | "comic" | "retro";
export type MoodName = "day" | "bright" | "golden" | "dusk" | "overcast" | "night";
export type GroundName = "grass" | "sand" | "snow" | "rock" | "ash" | "highland" | "slate";

/** The ground's palette: the terrain material and its low and high colours. */
export interface GroundWord {
  material: GroundName;
  low: string;
  high: string;
}

/** A model: a file the game serves (`/models/...`), or a model library name (`nature/boulder`). */
export interface ModelRef {
  model: string;
  /** Metres tall once drawn; omit to keep the model's own size. */
  height?: number;
  /** A colour multiplied over the model's own (a sickly green turns a passer-by into the infected). */
  tint?: string;
}

export interface ResourceWord {
  id: string;
  label: string;
  start: number;
}

/** Something in the world the player works for a resource (search a crate, chop a tree). */
export interface NodeWord {
  id: string;
  label: string;
  verb: string;
  gives: string;
  amount: number;
  /** Uses before it is spent; it refills at `regrow` per second. */
  uses: number;
  regrow: number;
  prop: ModelRef;
}

/** Something the player builds on the camp grid. */
export interface StructureWord {
  id: string;
  label: string;
  /** `wall` soaks damage, `turret` shoots threats in range, `producer` adds a resource over time. */
  role: "wall" | "turret" | "producer";
  key: string;
  cost: Readonly<Record<string, number>>;
  takes: number;
  health: number;
  /** turret: damage per shot at level 1; producer: units per second at level 1. */
  power: number;
  /** producer: the resource it makes. */
  makes?: string;
  prop: ModelRef;
}

/** Something that comes for the camp when the wave starts. */
export interface ThreatWord {
  id: string;
  label: string;
  model: ModelRef;
  health: number;
  damage: number;
  speed: number;
  /** First wave it shows up in. */
  from: number;
}

/** A creature the player can win over; it follows and fights threats. */
export interface AllyWord {
  id: string;
  label: string;
  verb: string;
  model: ModelRef;
  cost: Readonly<Record<string, number>>;
  health: number;
  damage: number;
  speed: number;
}

/** One story beat: reach a fact, then the next beat starts by itself. */
export interface BeatWord {
  id: string;
  title: string;
  goal: string;
  fact: string;
  atLeast: number;
  pitch: string;
}

export interface WalkerIdea {
  player: "walker";
  id: string;
  spec: string;
  name: string;
  pitch: string;
  tagline: string;
  kit: UiKitName;
  look: LookName;
  mood: MoodName;
  accent: string;
  ground: GroundWord;
  home: { label: string; health: number; model: ModelRef };
  guide: { name: string; title: string };
  /** What one wave is called ("Night", "Hunt", "Raid"). */
  wave: string;
  /** Seconds of calm between waves. */
  calm: number;
  hero: ModelRef & { health: number; damage: number; label: string };
  resources: readonly ResourceWord[];
  nodes: readonly NodeWord[];
  structures: readonly StructureWord[];
  threats: readonly ThreatWord[];
  allies: readonly AllyWord[];
  beats: readonly BeatWord[];
  scenery: readonly ModelRef[];
  /** Waves to hold for the ending; play goes on after it. */
  winAt: number;
}

export interface DriverIdea {
  player: "driver";
  id: string;
  spec: string;
  name: string;
  pitch: string;
  tagline: string;
  kit: UiKitName;
  look: LookName;
  mood: MoodName;
  accent: string;
  ground: GroundWord;
  guide: { name: string; title: string };
  currency: { id: string; label: string; start: number };
  car: ModelRef;
  rivals: readonly ModelRef[];
  /** Upgrades bought in the garage, each with levels. */
  upgrades: readonly { id: string; label: string; cost: number; levels: number; boost: number }[];
  /** Races, run in order; each pays and unlocks the next. */
  races: readonly { id: string; title: string; laps: number; rivals: number; pay: number; pitch: string }[];
  scenery: readonly ModelRef[];
  /** Lines both sides of the circuit (street lamps, cones, barriers). */
  trackside: ModelRef;
}

export type Idea = WalkerIdea | DriverIdea;
