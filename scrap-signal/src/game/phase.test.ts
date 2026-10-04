import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { activeActionCodes, playControlsActive } from "@jgengine/core/game/controlGate";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { setGamePhase } from "./phase";

test("menu-seeded published tracker sees overridden bindings while phases still gate play", () => {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "phase-compatibility", assets: createAssetCatalog(), multiplayer: "off" }),
    player: { userId: "p1", isNew: true },
  });
  const overridden = { reload: ["KeyT"], moveForward: ["ArrowUp"] };
  for (const phase of ["menu", "playing", "paused", "playing", "ended"] as const) {
    setGamePhase(ctx, phase);
    expect(gamePhase(ctx)).toBe(phase);
    expect(playControlsActive(ctx)).toBe(phase === "playing");
    expect(activeActionCodes(ctx, overridden)).toEqual(overridden);
  }
});
