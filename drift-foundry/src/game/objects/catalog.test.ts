import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { EXIT_GATE_ARCH, OBJECT_CATALOG } from "./catalog";
import { placeExitGate } from "../world/setup";

test("the finish opening stays free for camera rays after the renderer reports its outer bounds", () => {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Finish camera", multiplayer: "off" }),
    content: { objectById: id => OBJECT_CATALOG[id] },
    player: { userId: "driver", isNew: true },
  });
  placeExitGate(ctx);
  expect(ctx.scene.object.reportBounds(EXIT_GATE_ARCH, { min: [-11, 0, -.6], max: [11, 11, .6] })).toBe(true);
  expect(ctx.scene.raycast({ origin: [0, 3, 458], direction: [0, 0, 1], maxDistance: 20, filter: { entities: false, terrain: false } })).toBeNull();
});
