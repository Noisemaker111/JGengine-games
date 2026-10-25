/**
 * `bun run new-game "<idea in plain words>"` - a playable starter in one command.
 *
 * It reads the idea (`new-game/idea.ts`), copies the starter template for how the player moves
 * (walking or driving), writes the one data file the idea becomes (`src/game/idea.ts`), lays out the
 * authored scene (`src/editor.scene.json`), copies every model it names into the game, and writes the
 * package, README design checklist, loop proof flow and capabilities the repo gates ask for.
 *
 * Usage:
 *   bun run new-game "zombie survival where you scavenge by day and fortify for nights"
 *   bun run new-game "<idea>" --name "Dead Acre" [--force] [--no-install]
 *   bun run new-game --print "<idea>"        # show what the idea reads as, write nothing
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { dirName, linkCatalog, readState, resolveEngine, root } from "./engine-mode";
import { ideaModels, readIdea } from "./new-game/idea";
import type { DriverIdea, Idea, ModelRef, WalkerIdea } from "./new-game/template/common/src/game/ideaShape";

const started = performance.now();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const valued = new Set(["--name"]);
const text = args.filter((arg, index) => !arg.startsWith("--") && !valued.has(args[index - 1] ?? "")).join(" ").trim();
if (text.length === 0) {
  console.error('new-game: say the idea in plain words, e.g. bun run new-game "dinosaur survival: tame, build, craft"');
  process.exit(1);
}

const name = option("name");
const idea: Idea = readIdea(text, name === undefined ? {} : { name });
if (flag("print")) {
  console.log(JSON.stringify(idea, null, 2));
  process.exit(0);
}

const gameDir = join(root, idea.id);
if (existsSync(gameDir)) {
  if (!flag("force")) {
    console.error(`new-game: ${idea.id}/ already exists; pass --force to write over it, or --name "Another Name"`);
    process.exit(1);
  }
  for (const entry of readdirSync(gameDir)) if (entry !== "node_modules") rmSync(join(gameDir, entry), { recursive: true, force: true });
}

const template = join(import.meta.dir, "new-game", "template");
const step = (label: string) => console.log(`  ${label}`);
console.log(`new-game: "${idea.name}" (${idea.player === "walker" ? "on foot" : "behind the wheel"}) -> ${idea.id}/`);

// 1. The template: shared screens and flow, then the movement-specific game.
cpSync(join(template, "common"), gameDir, { recursive: true });
cpSync(join(template, idea.player), gameDir, { recursive: true });
// Template tests are stored as `*.ts.tmpl` so the repo's own test run skips them; the game gets them as `*.ts`.
untemplate(gameDir);
step(`copied the ${idea.player} starter`);

// 2. Models: pack files the dev runner serves are copied in and committed; library models come from
// any game that already pulled them (they are large and gitignored), else `bun run provision`.
const engine = resolveEngine();
const devPublic = join(engine, "apps", "dev", "public");
const missingLibrary: string[] = [];

function untemplate(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) untemplate(path);
    else if (entry.endsWith(".tmpl")) renameSync(path, path.slice(0, -".tmpl".length));
  }
}

function imagesOf(glb: string): string[] {
  const bytes = readFileSync(glb);
  if (bytes.readUInt32LE(0) !== 0x46546c67) return [];
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as { images?: { uri?: string }[] };
  return (json.images ?? []).map((image) => image.uri).filter((uri): uri is string => typeof uri === "string" && !uri.startsWith("data:"));
}

/** Textures over 1 MB are 2-4K maps; a starter commits them at 1024 px (ffmpeg, when installed) so a game stays a few MB. */
function copyTexture(source: string, target: string): void {
  if (existsSync(target)) return;
  // A model's textures can sit in a sibling folder ("../scenery/T_Brick.png"), which may not exist yet.
  mkdirSync(dirname(target), { recursive: true });
  if (statSync(source).size > 1_000_000 && /\.(png|jpe?g)$/i.test(source)) {
    const shrunk = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", source, "-vf", "scale='min(1024,iw)':-1", target], { stdio: "ignore" });
    if (shrunk.status === 0 && existsSync(target)) return;
  }
  cpSync(source, target);
}

function copyPackModel(url: string): string {
  const from = join(devPublic, url);
  const served = `/models/imported/${url.replace(/^\/models\//, "")}`;
  const to = join(gameDir, "public", served);
  if (!existsSync(from)) throw new Error(`new-game: ${url} is not in ${relative(root, devPublic) || devPublic}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  for (const image of imagesOf(from)) {
    const source = join(dirname(from), decodeURIComponent(image));
    if (existsSync(source)) copyTexture(source, join(dirname(to), decodeURIComponent(image)));
  }
  return served;
}

function libraryCaches(): string[] {
  const places = [root, join(root, "..", "..", "..")];
  const found: string[] = [];
  for (const place of places) {
    for (const top of [place, join(place, ".claude", "worktrees")]) {
      if (!existsSync(top)) continue;
      for (const entry of readdirSync(top)) {
        const direct = join(top, entry, "public", "models", "library");
        if (existsSync(direct)) found.push(direct);
        const nested = join(top, entry);
        if (top.endsWith("worktrees") && statSync(nested).isDirectory()) {
          for (const game of readdirSync(nested)) {
            const cache = join(nested, game, "public", "models", "library");
            if (existsSync(cache)) found.push(cache);
          }
        }
      }
    }
  }
  return found.filter((cache) => !cache.startsWith(gameDir));
}

const caches = libraryCaches();
function copyLibraryModel(model: string): void {
  const to = join(gameDir, "public", "models", "library", model);
  if (existsSync(to)) return;
  const cache = caches.find((dir) => existsSync(join(dir, model)));
  if (cache === undefined) {
    missingLibrary.push(model);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(cache, model), to, { recursive: true });
}

const served = new Map<string, string>();
for (const ref of ideaModels(idea)) {
  if (ref.model.startsWith("/")) {
    if (!served.has(ref.model)) served.set(ref.model, copyPackModel(ref.model));
  } else copyLibraryModel(ref.model);
}
const repoint = (ref: ModelRef): ModelRef => (ref.model.startsWith("/") ? { ...ref, model: served.get(ref.model)! } : ref);
const localIdea: Idea =
  idea.player === "walker"
    ? {
        ...idea,
        hero: { ...idea.hero, ...repoint(idea.hero) },
        home: { ...idea.home, model: repoint(idea.home.model) },
        nodes: idea.nodes.map((node) => ({ ...node, prop: repoint(node.prop) })),
        structures: idea.structures.map((structure) => ({ ...structure, prop: repoint(structure.prop) })),
        threats: idea.threats.map((threat) => ({ ...threat, model: repoint(threat.model) })),
        allies: idea.allies.map((ally) => ({ ...ally, model: repoint(ally.model) })),
        scenery: idea.scenery.map(repoint),
      }
    : { ...idea, car: repoint(idea.car), rivals: idea.rivals.map(repoint), scenery: idea.scenery.map(repoint), trackside: repoint(idea.trackside) };
step(`copied ${served.size} models into public/models/imported${missingLibrary.length === 0 ? "" : `; ${missingLibrary.length} library models to pull`}`);

// 3. The idea itself: one data file the whole starter reads.
const type = localIdea.player === "walker" ? "WalkerIdea" : "DriverIdea";
writeFileSync(
  join(gameDir, "src", "game", "idea.ts"),
  `import type { ${type} } from "./ideaShape";

/**
 * ${localIdea.name}: "${localIdea.pitch.replace(/\*\//g, "* /")}"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in \`src/editor.scene.json\` (F2+E in the running game).
 */
export const idea: ${type} = ${JSON.stringify(localIdea, null, 2)};
`,
);
step("wrote src/game/idea.ts");

// 4. The authored scene: seeded so the same idea lays out the same world.
let seed = [...localIdea.id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 11);
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
type Spot = { x: number; z: number };
const taken: { x: number; z: number; r: number }[] = [];
function place(inner: number, outer: number, clearance: number, near?: Spot): Spot {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = inner + random() * (outer - inner);
    const x = Math.round(((near?.x ?? 0) + Math.cos(angle) * distance) * 10) / 10;
    const z = Math.round(((near?.z ?? 0) + Math.sin(angle) * distance) * 10) / 10;
    if (taken.every((spot) => Math.hypot(spot.x - x, spot.z - z) >= spot.r + clearance)) {
      taken.push({ x, z, r: clearance });
      return { x, z };
    }
  }
  const angle = random() * Math.PI * 2;
  return { x: (near?.x ?? 0) + Math.cos(angle) * outer, z: (near?.z ?? 0) + Math.sin(angle) * outer };
}
const at = (spot: Spot) => ({ x: spot.x, y: 0, z: spot.z });
const turn = () => Math.round(random() * Math.PI * 2 * 100) / 100;

const markers: Record<string, unknown>[] = [];
const volumes: Record<string, unknown>[] = [];
const paths: Record<string, unknown>[] = [];
if (localIdea.player === "walker") walkerScene(localIdea);
else driverScene(localIdea);

function walkerScene(walker: WalkerIdea): void {
  const cells = 14;
  const cell = 2;
  const half = (cells * cell) / 2;
  taken.push({ x: 0, z: 0, r: half + 4 });
  markers.push({ id: "home", kind: "home", position: at({ x: 0, z: 0 }), label: walker.home.label, meta: { grid: cells, cell, clearance: 6 } });
  markers.push({ id: "spawn", kind: "player_spawn", position: at({ x: 0, z: half - 4 }), rotationY: Math.PI, label: "Spawn", meta: { clearance: 3 } });
  walker.nodes.forEach((node, kind) => {
    for (let index = 0; index < 7; index += 1) {
      const spot = place(half + 5, half + 30 + kind * 3, 4);
      markers.push({ id: `${node.id}-${index + 1}`, kind: "prop", catalogId: node.id, position: at(spot), rotationY: turn(), label: node.label, meta: { node: node.id, clearance: 2 } });
    }
  });
  walker.allies.forEach((ally) => {
    const herd = place(half + 18, half + 40, 10);
    taken.pop(); // the herd's own room is for its members
    for (let index = 0; index < 3; index += 1) {
      const spot = place(1, 6, 1.5, herd);
      markers.push({ id: `${ally.id}-${index + 1}`, kind: "herd", position: at(spot), rotationY: turn(), label: ally.label, meta: { ally: ally.id } });
    }
  });
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2;
    markers.push({ id: `lair-${index + 1}`, kind: "lair", position: at({ x: Math.round(Math.cos(angle) * 56), z: Math.round(Math.sin(angle) * 56) }), label: `${walker.wave} comes from here` });
  }
  scenery(walker.scenery, half + 8, 110, 120);
  if (walker.ground.material === "grass" || walker.ground.material === "highland") {
    volumes.push({
      id: "meadow",
      kind: "grass_field",
      shape: "box",
      center: { x: 0, y: 0, z: 0 },
      halfExtents: { x: 70, y: 0.01, z: 70 },
      label: "Meadow",
      meta: { density: 2.2, bladeHeight: 0.34, colorBase: walker.ground.low, colorTip: walker.ground.high, windStrength: 0.18, windSpeed: 1.2, seed: `${walker.id}-meadow` },
    });
  }
}

function driverScene(driver: DriverIdea): void {
  // One closed circuit as an authored path: a wobbled oval, so it has fast sweepers and two tight ends.
  const width = 14;
  const points = 56;
  const line: { x: number; y: number; z: number }[] = [];
  const phase = random() * Math.PI * 2;
  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const wobble = 1 + 0.2 * Math.sin(angle * 3 + phase) + 0.07 * Math.cos(angle * 5);
    line.push({ x: Math.round(Math.cos(angle) * 150 * wobble * 10) / 10, y: 0, z: Math.round(Math.sin(angle) * 95 * wobble * 10) / 10 });
  }
  for (let index = 0; index < points; index += 1) {
    const from = line[index]!;
    const to = line[(index + 1) % points]!;
    for (let step = 0; step < 4; step += 1) taken.push({ x: from.x + ((to.x - from.x) * step) / 4, z: from.z + ((to.z - from.z) * step) / 4, r: width / 2 + 5 });
  }
  paths.push({ id: "track", kind: "track", label: "Circuit", points: line, meta: { width } });
  // Trackside props every other line point, alternating sides, facing the road.
  for (let index = 0; index < points; index += 2) {
    const from = line[index]!;
    const to = line[(index + 1) % points]!;
    const heading = Math.atan2(to.x - from.x, to.z - from.z);
    const side = index % 4 === 0 ? 1 : -1;
    const out = width / 2 + 3.5;
    markers.push({
      id: `trackside-${index / 2 + 1}`,
      kind: "prop",
      catalogId: "trackside",
      position: { x: Math.round((from.x + Math.cos(heading) * out * side) * 10) / 10, y: 0, z: Math.round((from.z - Math.sin(heading) * out * side) * 10) / 10 },
      rotationY: Math.round((heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2)) * 100) / 100,
      label: "Trackside",
    });
  }
  markers.push({ id: "spawn", kind: "player_spawn", position: line[0]!, label: "Grid", meta: { clearance: 4 } });
  scenery(driver.scenery, 20, 240, 150);
}

function scenery(refs: readonly ModelRef[], inner: number, outer: number, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const which = index % refs.length;
    const spot = place(inner, outer, 5);
    markers.push({ id: `scenery-${index + 1}`, kind: "prop", catalogId: `scenery${which + 1}`, position: at(spot), rotationY: turn(), label: "Scenery", meta: { clearance: 2 } });
  }
}

writeFileSync(join(gameDir, "src", "editor.scene.json"), `${JSON.stringify({ version: 1, markers, volumes, paths }, null, 2)}\n`);
step(`laid out the scene: ${markers.length} markers`);

// 5. Package, page, README checklist, loop proof flow.
const sample = JSON.parse(readFileSync(join(template, "common", "package.json"), "utf8")) as Record<string, unknown>;
writeFileSync(join(gameDir, "package.json"), `${JSON.stringify({ ...sample, name: `@games/${localIdea.id}` }, null, 2)}\n`);
writeFileSync(
  join(gameDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${localIdea.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
);
writeFileSync(join(gameDir, "README.md"), readme(localIdea));
mkdirSync(join(gameDir, "proofs", "flows"), { recursive: true });
writeFileSync(join(gameDir, "proofs", "flows", `${localIdea.id}-loop.json`), `${JSON.stringify(loopFlow(localIdea), null, 2)}\n`);

const rootPackagePath = join(root, "package.json");
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { scripts: Record<string, string> };
if (rootPackage.scripts[`dev:${localIdea.id}`] === undefined) {
  rootPackage.scripts[`dev:${localIdea.id}`] = `bun --cwd=${localIdea.id} run dev`;
  writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);
}
step("wrote package.json, index.html, README.md and the loop proof");

// 6. Install, link the pinned engine, and seed capabilities.
const run = (command: string[], cwd = root) => {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
};
if (!flag("no-install")) {
  run(["bun", "install"]);
  // bun install links the registry copy; point the new game at the same engine the others use.
  const state = readState();
  const linked = state?.mode === "pinned" ? state.snapshot : state?.mode === "local" ? state.path : undefined;
  if (linked !== undefined) linkCatalog((pkg) => join(linked, "packages", dirName(pkg)));
  run(["bun", "scripts/capabilities-declare.ts", localIdea.id, "--force"]);
  fillDeclines(localIdea);
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`\nnew-game: ${localIdea.name} is ready in ${seconds}s.`);
if (missingLibrary.length > 0) console.log(`  pull its library models first: bun run provision ${localIdea.id}   (${missingLibrary.join(", ")})`);
console.log(`  play it:   bun run dev:${localIdea.id}`);
console.log(`  change it: ${localIdea.id}/src/game/idea.ts (words, costs, models) and F2+E in the game (places)`);
console.log("  guide:     docs/new-game.md");

/** Every capability the starter does not use is declined in words that name its domain, as the ledger asks. */
function fillDeclines(made: Idea): void {
  const path = join(gameDir, "capabilities.json");
  if (!existsSync(path)) return;
  const ledger = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8")) as { capabilities: { id: string; domain: string }[] };
  const domains = new Map(ledger.capabilities.map((entry) => [entry.id, entry.domain]));
  const declared = JSON.parse(readFileSync(path, "utf8")) as { declines?: Record<string, { kind: string; reason: string; issue?: string }> };
  const loop = made.player === "walker" ? `a ${made.wave.toLowerCase()}-defence survival starter` : "a circuit racing starter";
  for (const [capability, decline] of Object.entries(declared.declines ?? {})) {
    if (!/TODO/i.test(decline.reason)) continue;
    const domain = domains.get(capability) ?? capability;
    declared.declines![capability] = { kind: "not-applicable", reason: `${made.name} has no ${domain} yet: it is ${loop}, and nothing in its loop uses ${capability}.` };
  }
  writeFileSync(path, `${JSON.stringify(declared, null, 2)}
`);
}

function readme(made: Idea): string {
  if (made.player === "driver") {
    const [first] = made.races;
    return `# ${made.name}

${made.tagline} Made with \`bun run new-game\` from: "${made.pitch}". Start it with \`bun run dev:${made.id}\` from the repository root.

## Design checklist

Every word, price and model below lives in \`src/game/idea.ts\`; the track gates live in \`src/editor.scene.json\`.

- **Core loop.** Pick a race in the garage, line up against ${first?.rivals ?? 3} rivals, drive the gates
  in order for the laps, finish, get paid, spend it on the car, race again.
- **Progression.** ${made.races.length} races unlock in order and pay ${made.races.map((race) => race.pay).join(" / ")} ${made.currency.label.toLowerCase()};
  ${made.upgrades.map((upgrade) => `${upgrade.label} (${upgrade.levels} levels from ${upgrade.cost})`).join(", ")} make the car faster each level.
- **Failure states.** Finish outside the top three and the race pays nothing; the next race stays locked.
- **Minute 5 -> hour 5.** At 5:00 the first race is won and one upgrade is on the car. The later races
  bring more rivals and laps, and the upgrades are what lets you keep up.
- **References it is chasing.**
  - *Need for Speed: Underground* - feel: night streets and a car you tune; UI: a garage between races.
  - *Burnout* - feel: speed you feel through the camera; density: rivals close enough to trade paint.
- **Gap to target.** One circuit and no traffic yet; rivals follow the racing line rather than racing you.

Loop proof: ${made.id}-loop
`;
  }
  const [main] = made.resources;
  const [wall] = made.structures;
  return `# ${made.name}

${made.tagline} Made with \`bun run new-game\` from: "${made.pitch}". Start it with \`bun run dev:${made.id}\` from the repository root.

## Design checklist

Every word, cost and model below lives in \`src/game/idea.ts\`; places live in \`src/editor.scene.json\`.

- **Core loop.** ${made.nodes.map((node) => `${node.verb} ${node.label.toLowerCase()}s for ${node.gives}`).join(", ")};
  build ${made.structures.map((structure) => structure.label.toLowerCase()).join(", ")} on the grid around the ${made.home.label.toLowerCase()};
  every ${made.calm} seconds a ${made.wave.toLowerCase()} comes from the lairs and goes for your walls, you and the ${made.home.label.toLowerCase()}.
- **Progression.**
  - [x] Waves grow: 3 attackers on the first, three more each time, and ${made.threats.slice(1).map((threat) => `${threat.label.toLowerCase()}s from ${made.wave.toLowerCase()} ${threat.from}`).join(", ")}.
  - [x] Buildings level up to 3 (E on a building); a level-3 ${made.structures.find((structure) => structure.role === "turret")?.label.toLowerCase() ?? "turret"} hits three times as hard.
  - [x] ${made.allies.length > 0 ? `${made.allies.map((ally) => ally.label).join(", ")} can be won over and fight beside you.` : "Producers keep resources coming between waves."}
  - [x] A ${made.beats.length}-beat story from ${made.guide.name} ends after ${made.winAt} ${made.wave.toLowerCase()}s held.
- **Failure states.** The ${made.home.label.toLowerCase()} has ${made.home.health} health; when it falls the run ends and you retry from the last dawn's save. You respawn 4 seconds after going down.
- **Minute 5 -> hour 5.** At 5:00 two ${made.wave.toLowerCase()}s are held behind a few ${wall?.label.toLowerCase() ?? "walls"} and ${main?.label.toLowerCase() ?? "resources"} is the limit. Later ${made.wave.toLowerCase()}s bring bigger attackers, so levelled buildings${made.allies.length > 0 ? " and allies" : ""} decide whether the ${made.home.label.toLowerCase()} stands.
- **References it is chasing.**
  - *7 Days to Die* - feel: scavenging by day for a defence that has to hold at night.
  - *ARK: Survival Evolved* - feel: gathering by hand into a camp that grows; tamed creatures that fight for you.
  - *They Are Billions* - density: a wave that is many bodies at once against walls you placed.
- **Gap to target.** One map, three building types, and attackers that only walk at you; no crafting tree or day-night sky yet.

Loop proof: ${made.id}-loop
`;
}

/**
 * A short route for a clip (`--state wave|race --flow <id>-clip --record clip`): `--record` is
 * lockstep and stops near 46s, so this stays near 35s and starts from the capture state.
 */
function clipFlow(made: Idea): { steps: Record<string, unknown>[] } {
  if (made.player === "driver") {
    return { steps: [{ key: "KeyT", ms: 120 }, { key: "KeyW", ms: 25000 }, { assert: "__jgProbe().racing === 1", note: "arrival: mid-race with assist on" }] };
  }
  const swings = Array.from({ length: 24 }, () => [{ key: "mouse0", ms: 120 }, { wait: 450 }]).flat();
  return { steps: [{ wait: 21000 }, { key: "KeyW", ms: 600 }, ...swings, { assert: "__jgProbe().wave >= 1", note: "arrival: still in the night after the fight" }] };
}

function loopFlow(made: Idea): { steps: Record<string, unknown>[] } {
  // Flows run in play mode: capture.play has already left the title, so the first assert is in the game.
  if (made.player === "driver") {
    return {
      steps: [
        { assert: "/start race/i.test(document.body.innerText)", before: { is: "/start race/i.test(document.body.innerText)", timeoutMs: 60000 }, note: "arrival: the career opens in the garage with the first race on the board" },
        { click: "Start race", after: { is: "__jgProbe().racing === 1", timeoutMs: 20000 }, note: "line up; the count runs and the lights go green" },
        { assert: "__jgProbe().rivals > 0", note: "arrival: rivals are on the grid, read from the game's own session" },
        { key: "KeyT", ms: 120, after: { is: "__jgProbe().assist === 1", timeoutMs: 3000 }, note: "steering assist on, so a held throttle follows the racing line" },
        { key: "KeyW", ms: 70000, note: "race the first event flat out" },
        { assert: `__jgProbe().racing === 0 && __jgProbe().cash > ${made.currency.start}`, before: { is: "__jgProbe().racing === 0", timeoutMs: 60000 }, note: "arrival: the race finished on the podium and paid out, so the career loop turns" },
      ],
    };
  }
  const swings = Array.from({ length: 30 }, () => [{ key: "mouse0", ms: 120 }, { wait: 400 }]).flat();
  return {
    steps: [
      { assert: `/${made.beats[0]!.title}/i.test(document.body.innerText)`, before: { is: `/${made.beats[0]!.title}/i.test(document.body.innerText)`, timeoutMs: 60000 }, note: "arrival: a run is up and the first story beat started by itself" },
      { key: "Digit1", ms: 120, after: { is: "__jgProbe().built >= 1", timeoutMs: 8000 }, note: `build a ${made.structures[0]!.label.toLowerCase()} in front of you` },
      { key: "KeyN", ms: 120, after: { is: "__jgProbe().wave >= 1", timeoutMs: 10000 }, note: `call the first ${made.wave.toLowerCase()} early` },
      { assert: "__jgProbe().alive > 0", note: `arrival: the ${made.wave.toLowerCase()} spawned at the lairs, read from the game's own session` },
      { wait: 25000 },
      ...swings,
      { assert: "__jgProbe().alive < 3", before: { is: "__jgProbe().alive < 3", timeoutMs: 30000 }, note: "arrival: swings landed and attackers fell, so the fight is real and not only the spawn" },
    ],
  };
}
