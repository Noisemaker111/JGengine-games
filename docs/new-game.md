# Make a new game

```sh
bun run new-game "zombie survival: scavenge by day, fortify your safehouse, nights get harder"
bun run dev:<id>          # play it
```

One sentence in, a playable game out, in about 3 seconds. The generator reads the idea's words
(`scripts/new-game/idea.ts`), picks a starter, and writes a full game folder:

| The idea says | Starter | What you get |
| --- | --- | --- |
| survival, zombie, dinosaur, tame, base, night, raid, craft... | **walker** | gather, build, defend, survive nights that get harder; tame animals when the idea mentions taming |
| race, racer, street, car, drift, circuit... | **driver** | a career of night races against rival cars; win money, upgrade the car |

Flags: `--name "My Name"` names it, `--force` rebuilds an existing folder.
Examples already made this way: `hold-the-line/`, `fernwild/`, `apex-nights/`.

## Change it

Almost everything is in **one file**: `<id>/src/game/idea.ts`. It holds the names, words, costs,
enemy stats, models, look, mood and UI kit. Places live in `<id>/src/editor.scene.json`: press F2,
then E, in the running game, move things, and save with Ctrl+S. Code never holds coordinates.

## The building blocks, and the lines that use them

**Game rules: `defineWorldModel` declarations run by `defineGameSpec`.** The world's facts, actions,
costs and story beats are plain data. The spec runs them, saves them, and puts built things in the scene.

```ts
export const world: WorldModelDecl = { kinds, things, actions, events, jobs };          // src/game/spec.ts
export const camp = defineGameSpec({ id: idea.spec, world, hooks, show: { structure: { role: "prop" } }, autoStart: true });
```

`show` makes each built barricade or palisade appear in the world, and a loaded save rebuilds it.
`autoStart` plays the story beats one after another with no quest giver. In the racer, upgrades are
actions whose cost goes up each stage: `scaleBy: "stage"`.

**Look and mood presets.** Pick them as words in `idea.ts`. The game config passes them on as is:

```ts
look: idea.look, mood: idea.mood,          // "cinematic" + "overcast", "cinematic" + "night", ...
```

**UI kit.** One word re-skins every menu and the HUD (`terminal`, `parchment`, `arcade`, ...):

```ts
uiKit: idea.kit,                                                       // src/game.config.ts
<KitPanel variant="hud" eyebrow={idea.name}><KitMeter label="You" value={hp} max={max} /></KitPanel>
```

The title, pause, briefing, controls and credits screens (`src/game/ui/Menus.tsx`) and the end screen
(`KitResultScreen`) are all kit parts, so they match the HUD.

**Models: the model library, plus packs on disk.** A bare name comes from the realistic model
library. A path is a file the game serves itself; the generator copies pack models into
`public/models/imported/`.

```ts
{ "model": "city/street-lamp", "height": 5 }                                  // library
{ "model": "/models/imported/kaykit-city-builder/building_B.glb" }             // pack copy
```

`src/game/models.ts` turns either form into a model config with `libraryModel(name, { targetHeight })`.
A `tint` repaints a model, so one rigged body can make several enemies.

**World and layout: the editor scene.** Terrain, sky, clearings, resource spots, herds, enemy lairs,
the home base and the race circuit are all records in `editor.scene.json`:

```ts
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 480, d: 480 } });   // src/world.ts
roads: [road({ path: loop, width: circuit.width, markings: true, sidewalk: { width: 3 } })],         // racer
```

**Enemies and pets.** Enemies are spawned with the engine's chase-and-attack behaviour. A tamed animal
uses the same behaviour, held to its owner:

```ts
behaviors: [pursue({ aggroRadius: 400, reach: 1.6, speed, attack: { effect: "damage", amount, intervalSec: 1.1 } })]
pursue({ anchor: ctx.player.userId, hunts: threatNames, ... })         // heels at ~2.5 m, fights only threats
```

**Driving and racing.** The racer's car, rivals and laps are engine parts:

```ts
car = createKinematicVehicle(BASE, { position, heading });  tickDrivableVehicle(car, dt, axis, modifiers);
state.race = createRaceState({ track: trackOf(circuit, race.laps) });     // checkpoints read off the circuit path
camera: { rig: "chase", chase: { distance: 7.5, fov: { base: 66, max: 84, speedForMax: 40 } } }
```

**Save.** The game saves on its own: every 30 seconds of play, at each dawn and after each race. Continue on the title screen
loads the save.

```ts
persist: { mode: "manual" },                         // src/game.config.ts
void ctx.game.save?.checkpoint();                    // src/game/flow.ts, waves.ts, race.ts
```

## Prove it

Each game ships two routes, which `bun run drive` plays in a real browser:

```sh
bun run drive <id> --game-dir <path-to-game> --flow <id>-loop      # the whole first loop, asserted
bun run drive <id> --game-dir <path-to-game> --state wave --flow <id>-clip --record clip   # a ~35 s clip
```

The racer uses `--state race`. `capture.probe` in `game.config.ts` names the numbers the routes
check (wave, alive, built, tamed, racing, position, cash).

## Add a new kind of game

1. Add its words to `scripts/new-game/idea.ts`: a theme for walkers, or a new reader.
2. If it plays differently, add a starter folder next to `scripts/new-game/template/walker` and `driver`.
3. When a game needs something the engine cannot do, fix the engine, not the game.
