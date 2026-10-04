import { describe, expect, test } from "bun:test";

import { createAnimGraphRuntime } from "@jgengine/core/anim/animGraph";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";

import { loop } from "../../../loop";
import { physics, world } from "../../../world";
import { assets, FIELD_RESEARCHER_ASSET_ID } from "../../assets";
import { content } from "../../content";
import { surveyLifecycle } from "../../survey";
import { keybinds } from "../../keybinds";
import { entityModels, researcherAnimation } from "./models";

function drive(held: string[]) {
  const runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Field Station motion", assets, multiplayer: "off", world, physics, lifecycle: surveyLifecycle }),
    content,
    loop,
    player: { userId: `researcher-${held.length}`, isNew: true },
    playerMovement: true,
    heading: 0,
  });
  const position = () => [...runner.ctx.scene.entity.get(runner.userId)!.position];
  runner.ctx.game.commands.run("start", null);
  const start = position();
  for (let i = 0; i < 120; i++) runner.step(1 / 60, { held });
  const end = position();
  runner.step(1 / 60, { held });
  const after = position();
  return {
    distance: Math.hypot(end[0]! - start[0]!, end[2]! - start[2]!),
    speed: Math.hypot(after[0]! - end[0]!, after[2]! - end[2]!) * 60,
  };
}

describe("Field Station researcher locomotion", () => {
  test("both physical Shift keys engage and release the published sprint tracker", () => {
    const tracker = createActionStateTracker(toActionStateBindingMap(keybinds));
    for (const code of ["ShiftLeft", "ShiftRight"]) {
      tracker.handleDown(code);
      expect(tracker.isDown("sprint")).toBe(true);
      tracker.handleUp(code);
      expect(tracker.isDown("sprint")).toBe(false);
    }
  });

  test("actual walking and sprinting select the matching clips at a fieldwork pace", () => {
    const walk = drive(["moveForward"]);
    const run = drive(["moveForward", "sprint"]);
    expect(walk.speed).toBeCloseTo(2.8);
    expect(run.speed).toBeCloseTo(6.3);
    expect(walk.distance).toBeGreaterThan(5);
    expect(walk.distance).toBeLessThan(6);
    expect(run.distance).toBeGreaterThan(12);
    expect(run.distance).toBeLessThan(13);

    const rig = assets.resolve(FIELD_RESEARCHER_ASSET_ID)!;
    const clips = Object.fromEntries(rig.clips!.map((name) => [name, 1]));
    const graph = createAnimGraphRuntime(researcherAnimation);
    for (const [speed, clip] of [[0, "Idle"], [walk.speed, "Walking_A"], [run.speed, "Running_A"]] as const) {
      const output = graph.advance(1 / 60, { speed }, clips);
      const selected = output.clips.find((entry) => entry.weight > 0.999);
      expect(selected?.clip).toBe(clip);
      expect(selected?.time).toBeGreaterThan(0);
    }
    const resting = graph.advance(1 / 60, { speed: 0 }, clips);
    expect(resting.clips.find((entry) => entry.weight > 0.999)?.clip).toBe("Idle");
  });

  test("the researcher mapping resolves its authored rig and requested clips", () => {
    const rig = assets.resolve(FIELD_RESEARCHER_ASSET_ID)!;
    expect(entityModels.player.url).toBe(rig.url);
    const locomotion = researcherAnimation.layers[0]!.states.locomotion!;
    expect(locomotion.kind).toBe("blend1D");
    if (locomotion.kind !== "blend1D") throw new Error("Researcher locomotion must be a speed blend");
    for (const point of locomotion.points) expect(rig.clips).toContain(point.clip);
  });
});
