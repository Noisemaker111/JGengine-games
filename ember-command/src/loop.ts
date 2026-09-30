import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { matchRunning } from "./game/session";
import { setupSkirmish } from "./game/world/scene";

/** @internal Spawn the roster and wire the skirmish once, at world boot. */
export function onInit(ctx: GameContext): void {
  setupSkirmish(ctx);
}

/** @internal No avatar — Ember Command is a commander-view RTS, so a joining player controls the army. */
export function onNewPlayer(_ctx: GameContext): void {}

/** @internal Command-card hotkeys mirror the buttons without conflicting with camera panning. */
export function onTick(ctx: GameContext, _dt: number): void {
  if (!matchRunning()) return;
  if (ctx.input.justPressed("attackMove")) ctx.game.commands.run("unit.attackMove", {});
  if (ctx.input.justPressed("rally")) ctx.game.commands.run("unit.rally", {});
  if (ctx.input.justPressed("hold")) ctx.game.commands.run("unit.hold", {});
  if (ctx.input.justPressed("trainPeasant")) ctx.game.commands.run("train.peasant", {});
  if (ctx.input.justPressed("trainFootman")) ctx.game.commands.run("train.footman", {});
  if (ctx.input.justPressed("trainRifleman")) ctx.game.commands.run("train.rifleman", {});
  if (ctx.input.justPressed("buildBarracks")) ctx.game.commands.run("build.arm", { type: "barracks" });
  if (ctx.input.justPressed("buildFarm")) ctx.game.commands.run("build.arm", { type: "farm" });
  if (ctx.input.justPressed("buildTower")) ctx.game.commands.run("build.arm", { type: "guard_tower" });
  if (ctx.input.justPressed("researchWeapons")) ctx.game.commands.run("research.weapons", {});
  if (ctx.input.justPressed("researchArmor")) ctx.game.commands.run("research.armor", {});
  if (ctx.input.justPressed("heroAbility")) ctx.game.commands.run("hero.ability", {});
}
