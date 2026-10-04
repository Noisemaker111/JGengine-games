import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { activeActionCodes, playControlsActive } from "@jgengine/core/game/controlGate";
import { game } from "../game.config";
import { readDuetProbe } from "./nativeCapture";
import { shellDrivesPlayerPose } from "@jgengine/shell/shellMovement";

test("published offline boot seats both heroes and retains tracker codes while the menu blocks play", () => {
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "native-local", isNew: true } });
  game.loop.onInit(ctx);
  expect(readDuetProbe(ctx)).toMatchObject({ status: 0, ownedHeroes: 2, controlledHero: 1 });
  expect(activeActionCodes(ctx, game.game.input!)["duet.north"]).toContain("KeyW");
  expect(shellDrivesPlayerPose(game.game.input)).toBe(false);
  expect(playControlsActive(ctx)).toBe(false);
  const position = ctx.scene.entity.get("lumen")!.position;
  ctx.game.commands.run("duet.step", { dir: "east" });
  expect(ctx.scene.entity.get("lumen")!.position).toEqual(position);
  ctx.game.commands.run("duet.start", {});
  ctx.game.commands.run("swap", {});
  expect(readDuetProbe(ctx)).toMatchObject({ status: 1, controlledHero: 2, ownedHeroes: 2 });
  expect(playControlsActive(ctx)).toBe(true);
});
