import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { assets } from "../../assets";
import { content } from "../../content";
import { PLAYER_SPAWN, setupWorld } from "../../world/setup";
import { entityModels, objectModels } from "../../world/models";
import { world } from "../../../world";
import { registerRelay, RELAY } from "../../relay";
import { pickCharacter } from "../../characters";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { enemyAiWork, tickEnemies } from "./ai";

function boot() {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "enemy-ai-bench", assets, world, multiplayer: "off", persist: false }), content,
    player: { userId: "player", isNew: true }, models: { entity: (id) => entityModels[id], object: (id) => objectModels[id] },
  });
  ctx.scene.entity.spawn("reactor_hunter", { id: "player", position: [PLAYER_SPAWN[0], ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]), PLAYER_SPAWN[2]] });
  setupWorld(ctx);
  return ctx;
}

const beforePath = process.argv[2];
const runs = [];
if (beforePath !== undefined) {
  const aiDir = import.meta.dir;
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const source = transpiler.transformSync(await Bun.file(beforePath).text()).replace(/from\s+["']([^"']+)["']/g, (_, id) => `from ${JSON.stringify(Bun.resolveSync(id, aiDir))}`);
  const before = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  runs.push({ label: "before", tick: before.tickEnemies, frames: 30 });
}
runs.push({ label: "bounded", tick: tickEnemies, frames: 240 });
runs.push({ label: "bounded-contract", tick: tickEnemies, frames: 240, contract: true });
for (const run of runs) {
  const ctx = boot();
  if (run.contract) {
    ctx.scene.entity.update("player", { position: [RELAY.x, ctx.world.groundHeightAt(RELAY.x, RELAY.z), RELAY.z] });
    registerRelay(ctx, () => {});
    pickCharacter("gunk");
    setGamePhase(ctx, "playing");
    ctx.game.commands.run("relay.start", {});
  }
  const samples = [];
  const peakWork = { active: 0, idle: 0, raycasts: 0, groundQueries: 0 };
  for (let i = 0; i < run.frames; i++) {
    ctx.time.advance(1 / 60);
    const start = performance.now();
    run.tick(ctx, 1 / 60);
    samples.push(performance.now() - start);
    const work = enemyAiWork(ctx);
    for (const key of Object.keys(peakWork)) peakWork[key] = Math.max(peakWork[key], work[key]);
  }
  console.log(JSON.stringify({ label: run.label, entities: ctx.scene.entity.list().length, objects: ctx.scene.object.list().length,
    frames: samples.length, averageMs: samples.reduce((a, b) => a + b, 0) / samples.length, maxMs: Math.max(...samples), peakWork, lastWork: enemyAiWork(ctx) }));
}
