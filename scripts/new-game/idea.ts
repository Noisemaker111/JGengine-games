/**
 * Read a game idea in plain words and turn it into the starter's data (`src/game/idea.ts`): a name,
 * how the player moves, the UI kit, look and mood, the words the HUD uses, and real models matched to
 * what the idea names.
 *
 * The reader is a word table, not a model call: each theme below is plain data (what the threat is,
 * what you gather, what you build, which models draw them), and the idea's words pick and tune one.
 * Every pick lands in one generated file, so a human or an AI changes a word, a number or a model
 * there instead of hunting through code. New themes are new rows here, never new game code.
 */
import type { BeatWord, DriverIdea, ModelRef, WalkerIdea } from "./template/common/src/game/ideaShape";

type WalkerTheme = Omit<WalkerIdea, "id" | "spec" | "name" | "pitch" | "player" | "beats" | "allies"> & {
  /** Words that pick this theme; more hits win. */
  words: readonly string[];
  names: readonly string[];
  allies: WalkerIdea["allies"];
  /** Beat titles and pitches; goals and facts come from the theme's own pieces. */
  story: readonly { title: string; pitch: string }[];
};

const RANGER: ModelRef = { model: "/models/lantern-reach/players/ranger.glb", height: 1.8 };
const SOLDIER: ModelRef = { model: "human/soldier", height: 1.8 };
const INFECTED = "#7c9468";

const THEMES: readonly WalkerTheme[] = [
  {
    words: ["zombie", "zombies", "undead", "infected", "apocalypse", "outbreak", "horde", "scavenge", "fortify", "walkers"],
    names: ["Dead Acre", "Last Light", "Hold the Line", "Boarded Up"],
    tagline: "Scavenge by day. Fortify by dusk. Live through the night.",
    kit: "terminal",
    look: "cinematic",
    mood: "overcast",
    accent: "#e8a33c",
    ground: { material: "ash", low: "#4a4a3f", high: "#77705c" },
    home: { label: "Safehouse", health: 1500, model: { model: "/models/kaykit-city-builder/building_B.glb", height: 9 } },
    guide: { name: "Mara", title: "Radio voice" },
    wave: "Night",
    calm: 75,
    hero: { ...SOLDIER, health: 120, damage: 34, label: "You" },
    resources: [
      { id: "scrap", label: "Scrap", start: 30 },
      { id: "food", label: "Food", start: 10 },
    ],
    nodes: [
      { id: "crate", label: "Supply crate", verb: "Search", gives: "scrap", amount: 6, uses: 3, regrow: 0.02, prop: { model: "industrial/wooden-crate", height: 0.9 } },
      { id: "wreck", label: "Wrecked car", verb: "Strip", gives: "scrap", amount: 10, uses: 4, regrow: 0.015, prop: { model: "/models/kaykit-city-builder/car_sedan.glb", height: 1.5 } },
      { id: "bin", label: "Trash can", verb: "Rummage", gives: "food", amount: 4, uses: 2, regrow: 0.02, prop: { model: "city/trash-can", height: 1.1 } },
      { id: "drum", label: "Oil drum", verb: "Siphon", gives: "scrap", amount: 4, uses: 2, regrow: 0.03, prop: { model: "industrial/barrel", height: 1 } },
    ],
    structures: [
      { id: "barricade", label: "Barricade", role: "wall", key: "1", cost: { scrap: 8 }, takes: 2, health: 260, power: 0, prop: { model: "city/road-barrier", height: 1.1 } },
      { id: "lookout", label: "Lookout", role: "turret", key: "2", cost: { scrap: 30 }, takes: 5, health: 200, power: 16, prop: { model: "/models/kaykit-city-builder/watertower.glb", height: 5 } },
      { id: "garden", label: "Garden bed", role: "producer", key: "3", cost: { scrap: 14 }, takes: 4, health: 120, power: 0.25, makes: "food", prop: { model: "park/planter-box", height: 0.8 } },
    ],
    threats: [
      { id: "shambler", label: "Shambler", model: { model: "human/man-casual", height: 1.8, tint: INFECTED }, health: 60, damage: 8, speed: 1.6, from: 1 },
      { id: "biter", label: "Biter", model: { model: "human/woman-casual", height: 1.7, tint: INFECTED }, health: 45, damage: 7, speed: 2.2, from: 1 },
      { id: "runner", label: "Runner", model: { model: "human/jogger", height: 1.8, tint: INFECTED }, health: 40, damage: 6, speed: 4.2, from: 3 },
      { id: "brute", label: "Brute", model: { model: "human/construction-worker", height: 2.3, tint: INFECTED }, health: 260, damage: 22, speed: 1.4, from: 5 },
    ],
    allies: [
      { id: "dog", label: "Stray dog", verb: "Feed", model: { model: "creature/dog-shepherd", height: 0.8 }, cost: { food: 6 }, health: 90, damage: 14, speed: 5.5 },
    ],
    story: [
      { title: "First night", pitch: "The radio crackles: the dead walk after dark. Board up before the sun goes." },
      { title: "Hold out", pitch: "They came back, and more of them. Keep the walls standing." },
      { title: "The long dark", pitch: "Brutes are in the horde now. Build up and hold." },
      { title: "Dawn of rescue", pitch: "A convoy is coming. Survive until they reach you." },
    ],
    scenery: [
      { model: "/models/kaykit-city-builder/building_D.glb", height: 10 },
      { model: "/models/kaykit-city-builder/building_F.glb", height: 12 },
      { model: "/models/kaykit-city-builder/car_hatchback.glb", height: 1.5 },
      { model: "city/street-lamp", height: 5 },
      { model: "/models/kaykit-city-builder/dumpster.glb", height: 1.4 },
      { model: "city/fire-hydrant", height: 0.8 },
      { model: "/models/quaternius-stylized-nature/DeadTree_1.glb", height: 6 },
    ],
    winAt: 7,
  },
  {
    words: ["dinosaur", "dinosaurs", "dino", "dinos", "raptor", "raptors", "jurassic", "prehistoric", "ark", "rex", "tame", "taming"],
    names: ["Primal Shore", "Fernwild", "Claw Island", "Ember Age"],
    tagline: "Tame the wild. Raise a camp. Outlast the hunt.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#6fc36a",
    ground: { material: "grass", low: "#4f6d2f", high: "#8a9a52" },
    home: { label: "Camp", health: 1400, model: { model: "/models/lantern-reach/settlements/settlement-1.glb", height: 7 } },
    guide: { name: "Ka-Ren", title: "Old tamer" },
    wave: "Hunt",
    calm: 80,
    hero: { ...RANGER, health: 120, damage: 30, label: "Survivor" },
    resources: [
      { id: "wood", label: "Wood", start: 20 },
      { id: "stone", label: "Stone", start: 10 },
      { id: "berries", label: "Berries", start: 6 },
    ],
    nodes: [
      { id: "tree", label: "Tree", verb: "Chop", gives: "wood", amount: 5, uses: 4, regrow: 0.03, prop: { model: "/models/quaternius-stylized-nature/CommonTree_1.glb", height: 7 } },
      { id: "pine", label: "Pine", verb: "Chop", gives: "wood", amount: 6, uses: 4, regrow: 0.03, prop: { model: "/models/quaternius-stylized-nature/Pine_2.glb", height: 8 } },
      { id: "rock", label: "Rock", verb: "Mine", gives: "stone", amount: 4, uses: 5, regrow: 0.02, prop: { model: "/models/quaternius-stylized-nature/Rock_Medium_1.glb", height: 1.4 } },
      { id: "bush", label: "Berry bush", verb: "Pick", gives: "berries", amount: 3, uses: 3, regrow: 0.05, prop: { model: "/models/quaternius-stylized-nature/Bush_Common_Flowers.glb", height: 1.1 } },
    ],
    structures: [
      { id: "palisade", label: "Palisade", role: "wall", key: "1", cost: { wood: 8 }, takes: 2, health: 240, power: 0, prop: { model: "/models/quaternius-medieval-village/Prop_WoodenFence_Single.glb", height: 1.6 } },
      { id: "brazier", label: "Fire ward", role: "turret", key: "2", cost: { wood: 12, stone: 10 }, takes: 4, health: 180, power: 14, prop: { model: "/models/kaykit-dungeon/torch_lit.glb", height: 2.2 } },
      { id: "patch", label: "Berry patch", role: "producer", key: "3", cost: { wood: 10 }, takes: 4, health: 120, power: 0.25, makes: "berries", prop: { model: "/models/quaternius-stylized-nature/Bush_Common.glb", height: 0.9 } },
    ],
    threats: [
      { id: "raptor", label: "Raptor", model: { model: "/models/lantern-reach/creatures/velociraptor.glb", height: 1.6 }, health: 50, damage: 8, speed: 3.6, from: 1 },
      { id: "stalker", label: "Stalker", model: { model: "/models/lantern-reach/creatures/velociraptor.glb", height: 2.4 }, health: 120, damage: 14, speed: 3.2, from: 3 },
      { id: "rex", label: "Tyrant", model: { model: "/models/lantern-reach/creatures/velociraptor.glb", height: 4.5 }, health: 520, damage: 32, speed: 2.4, from: 5 },
    ],
    allies: [
      { id: "stag", label: "Stag", verb: "Tame", model: { model: "/models/lantern-reach/creatures/stag.glb", height: 1.9 }, cost: { berries: 6 }, health: 140, damage: 16, speed: 5 },
      { id: "boar", label: "Boar", verb: "Tame", model: { model: "/models/lantern-reach/creatures/wild_boar.glb", height: 1.1 }, cost: { berries: 4 }, health: 100, damage: 12, speed: 5 },
      { id: "bull", label: "Aurochs", verb: "Tame", model: { model: "/models/lantern-reach/creatures/bull.glb", height: 1.8 }, cost: { berries: 10 }, health: 220, damage: 22, speed: 4.2 },
    ],
    story: [
      { title: "Washed ashore", pitch: "Nothing here is friendly yet. Raise a palisade before the raptors find your smoke." },
      { title: "A pack of your own", pitch: "The beasts that graze here can be won with berries. Tame one to fight beside you." },
      { title: "Stalkers", pitch: "Bigger hunters smell the camp. Fire keeps them back." },
      { title: "The Tyrant", pitch: "Something huge walks the ferns. Hold the camp through its hunt." },
    ],
    scenery: [
      { model: "/models/quaternius-stylized-nature/CommonTree_3.glb", height: 8 },
      { model: "/models/quaternius-stylized-nature/CommonTree_5.glb", height: 9 },
      { model: "/models/quaternius-stylized-nature/Fern_1.glb", height: 1.2 },
      { model: "/models/quaternius-stylized-nature/Plant_7_Big.glb", height: 1.6 },
      { model: "/models/quaternius-stylized-nature/Rock_Medium_3.glb", height: 2 },
      { model: "/models/quaternius-stylized-nature/TwistedTree_1.glb", height: 7 },
    ],
    winAt: 7,
  },
  {
    words: ["wolf", "wolves", "goblin", "goblins", "orc", "orcs", "fantasy", "medieval", "village", "castle", "siege", "wilds"],
    names: ["Lanternfall", "Thornwatch", "Ember Hollow"],
    tagline: "Gather, build, and hold the village through the long hunt.",
    kit: "parchment",
    look: "cinematic",
    mood: "dusk",
    accent: "#d9a441",
    ground: { material: "highland", low: "#4c5a33", high: "#7d7a55" },
    home: { label: "Village hall", health: 1400, model: { model: "/models/lantern-reach/settlements/settlement-0.glb", height: 8 } },
    guide: { name: "Elder Rowan", title: "Village elder" },
    wave: "Raid",
    calm: 75,
    hero: { model: "/models/lantern-reach/players/knight.glb", height: 1.8, health: 130, damage: 32, label: "Warden" },
    resources: [
      { id: "wood", label: "Wood", start: 20 },
      { id: "stone", label: "Stone", start: 10 },
    ],
    nodes: [
      { id: "tree", label: "Tree", verb: "Chop", gives: "wood", amount: 5, uses: 4, regrow: 0.03, prop: { model: "/models/quaternius-stylized-nature/CommonTree_2.glb", height: 7 } },
      { id: "rock", label: "Rock", verb: "Mine", gives: "stone", amount: 4, uses: 5, regrow: 0.02, prop: { model: "/models/quaternius-stylized-nature/Rock_Medium_2.glb", height: 1.4 } },
    ],
    structures: [
      { id: "fence", label: "Fence", role: "wall", key: "1", cost: { wood: 8 }, takes: 2, health: 240, power: 0, prop: { model: "/models/quaternius-medieval-village/Prop_WoodenFence_Single.glb", height: 1.6 } },
      { id: "brazier", label: "Brazier", role: "turret", key: "2", cost: { wood: 10, stone: 10 }, takes: 4, health: 180, power: 14, prop: { model: "/models/kaykit-dungeon/torch_lit.glb", height: 2.2 } },
    ],
    threats: [
      { id: "goblin", label: "Goblin", model: { model: "/models/lantern-reach/creatures/goblin.glb", height: 1.3 }, health: 45, damage: 7, speed: 3, from: 1 },
      { id: "wolf", label: "Wolf", model: { model: "/models/lantern-reach/creatures/wolf_basic.glb", height: 1.1 }, health: 50, damage: 8, speed: 4.4, from: 2 },
      { id: "orc", label: "Orc", model: { model: "/models/lantern-reach/creatures/orc.glb", height: 2.1 }, health: 200, damage: 20, speed: 2.2, from: 4 },
    ],
    allies: [],
    story: [
      { title: "First raid", pitch: "Raiders gather in the hills. Fence the hall before they come." },
      { title: "Wolves at the gate", pitch: "Wolves run with them now. Keep the fires burning." },
      { title: "The warband", pitch: "Orcs lead the next raid. Hold the hall." },
    ],
    scenery: [
      { model: "/models/quaternius-stylized-nature/Pine_1.glb", height: 8 },
      { model: "/models/quaternius-stylized-nature/Bush_Common.glb", height: 1 },
      { model: "/models/quaternius-medieval-village/Prop_Wagon.glb", height: 1.8 },
    ],
    winAt: 6,
  },
];

const DRIVER_WORDS = ["race", "racer", "racing", "street", "drift", "drive", "driving", "car", "cars", "kart", "rally", "speed"];

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);

const hash = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const score = (said: readonly string[], wanted: readonly string[]) => said.filter((word) => wanted.includes(word)).length;

/** One beat per story line: the first holds a wave, the middle ones build or tame, the last holds to `winAt`. */
function beatsFor(theme: WalkerTheme, tame: boolean): BeatWord[] {
  const [wall] = theme.structures;
  const goals: Omit<BeatWord, "id" | "title" | "pitch">[] = [
    { goal: `Build ${wall === undefined ? "a defence" : `a ${wall.label.toLowerCase()}`} and survive the first ${theme.wave.toLowerCase()}`, fact: "camp.held", atLeast: 1 },
    tame && theme.allies.length > 0
      ? { goal: `${theme.allies[0]!.verb} a ${theme.allies[0]!.label.toLowerCase()}`, fact: "camp.tamed", atLeast: 1 }
      : { goal: `Hold ${3} ${theme.wave.toLowerCase()}s`, fact: "camp.held", atLeast: 3 },
    { goal: `Hold ${Math.ceil(theme.winAt / 1.4)} ${theme.wave.toLowerCase()}s`, fact: "camp.held", atLeast: Math.ceil(theme.winAt / 1.4) },
    { goal: `Survive ${theme.winAt} ${theme.wave.toLowerCase()}s`, fact: "camp.held", atLeast: theme.winAt },
  ];
  const lines = theme.story.slice(0, goals.length);
  return lines.map((line, index) => {
    const goal = index === lines.length - 1 ? goals[goals.length - 1]! : goals[index]!;
    return { id: `beat${index + 1}`, title: line.title, pitch: line.pitch, ...goal };
  });
}

export interface ReadOptions {
  /** Overrides the picked name. */
  name?: string;
}

/** Read a plain-words idea into the starter's data. */
export function readIdea(text: string, options: ReadOptions = {}): WalkerIdea | DriverIdea {
  const said = words(text);
  const driverHits = score(said, DRIVER_WORDS);
  const ranked = THEMES.map((theme) => ({ theme, hits: score(said, theme.words) })).sort((a, b) => b.hits - a.hits);
  const best = ranked[0]!;
  if (driverHits > best.hits) return readDriver(text, options);

  const theme = best.hits > 0 ? best.theme : THEMES[THEMES.length - 1]!;
  const name = options.name ?? theme.names[hash(text) % theme.names.length]!;
  const id = slug(name);
  const tame = said.some((word) => ["tame", "taming", "pet", "pets", "companion", "dog", "ride", "ark"].includes(word));
  const allies = tame || theme.allies.length > 0 ? theme.allies : [];
  const nights = said.some((word) => word === "night" || word === "nights");
  const { words: _words, names: _names, story: _story, ...rest } = theme;
  return {
    ...rest,
    player: "walker",
    id,
    spec: id.replace(/-/g, "_"),
    name,
    pitch: text.trim(),
    wave: nights ? "Night" : theme.wave,
    allies,
    beats: beatsFor(theme, tame || allies.length > 0),
  };
}

function readDriver(text: string, options: ReadOptions): DriverIdea {
  const names = ["Neon Apex", "Night Shift GT", "Redline Run", "Apex Nights"];
  const name = options.name ?? names[hash(text) % names.length]!;
  const id = slug(name);
  return {
    player: "driver",
    id,
    spec: id.replace(/-/g, "_"),
    name,
    pitch: text.trim(),
    tagline: "Win races. Tune the car. Own the night.",
    kit: "arcade",
    look: "cinematic",
    mood: "night",
    accent: "#ff3d8b",
    ground: { material: "slate", low: "#2c2f36", high: "#4a4e57" },
    guide: { name: "Vee", title: "Crew chief" },
    currency: { id: "cash", label: "Cash", start: 200 },
    car: { model: "vehicle/sports-car", height: 1.3 },
    rivals: [
      { model: "/models/kaykit-city-builder/car_taxi.glb", height: 1.5 },
      { model: "/models/kaykit-city-builder/car_police.glb", height: 1.5 },
      { model: "/models/kaykit-city-builder/car_hatchback.glb", height: 1.5 },
      { model: "/models/kaykit-city-builder/car_stationwagon.glb", height: 1.5 },
    ],
    upgrades: [
      { id: "engine", label: "Engine", cost: 150, levels: 5, boost: 0.08 },
      { id: "grip", label: "Tyres", cost: 120, levels: 5, boost: 0.08 },
      { id: "nitro", label: "Nitro", cost: 180, levels: 4, boost: 0.2 },
    ],
    races: [
      { id: "rookie", title: "Rookie sprint", laps: 2, rivals: 3, pay: 220, pitch: "Three locals, two laps. Show them you're real." },
      { id: "docks", title: "Dockside dash", laps: 3, rivals: 4, pay: 380, pitch: "The dock crews race for keeps. Three laps." },
      { id: "crown", title: "Crown of the city", laps: 3, rivals: 4, pay: 700, pitch: "The best in the city. Win this and the streets are yours." },
    ],
    scenery: [
      { model: "/models/kaykit-city-builder/building_A.glb", height: 12 },
      { model: "/models/kaykit-city-builder/building_C.glb", height: 14 },
      { model: "/models/kaykit-city-builder/building_E.glb", height: 16 },
      { model: "/models/kaykit-city-builder/building_G.glb", height: 18 },
      { model: "/models/kaykit-city-builder/building_H.glb", height: 15 },
      { model: "/models/kaykit-city-builder/watertower.glb", height: 9 },
    ],
    trackside: { model: "city/street-lamp", height: 6 },
  };
}

/** Every model an idea uses, so the generator can copy each one into the game. */
export function ideaModels(idea: WalkerIdea | DriverIdea): ModelRef[] {
  if (idea.player === "driver") return [idea.car, ...idea.rivals, ...idea.scenery, idea.trackside];
  return [
    idea.hero,
    idea.home.model,
    ...idea.nodes.map((node) => node.prop),
    ...idea.structures.map((structure) => structure.prop),
    ...idea.threats.map((threat) => threat.model),
    ...idea.allies.map((ally) => ally.model),
    ...idea.scenery,
  ];
}
