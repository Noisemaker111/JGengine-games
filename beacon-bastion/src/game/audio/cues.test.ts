import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { content } from "../content";
import { BASE_ENTITY_ID } from "../entities/base/catalog";
import { session } from "../session";
import { setupWorld } from "../world/setup";
import { tickWaves } from "../waves/director";
import { audio, ENEMY_KILLED_CUE, ENEMY_LEAKED_CUE } from "./catalog";

let runner: HeadlessRunner;
let played: string[];

beforeEach(() => {
  runner = createHeadlessRunner({ definition: defineGameDefinition({ name: "Beacon cues", multiplayer: "off" }), content, loop: { onInit: setupWorld, onNewPlayer() {} } });
  played = [];
  runner.ctx.game.events.on("audio.play", ({ sound }) => played.push(sound));
});

function releaseFirstWave(): void {
  runner.ui.invoke("wave.send", {});
  for (let i = 0; i < 40 && session.creeps.size === 0; i++) tickWaves(runner.ctx, 0.5);
}

describe("enemy feedback cues", () => {
  test("both cues are procedural sounds in the game catalog", () => {
    expect(audio.sounds[ENEMY_KILLED_CUE]?.synth).toBeDefined();
    expect(audio.sounds[ENEMY_LEAKED_CUE]?.synth).toBeDefined();
  });

  test("a creep killed by a tower plays the kill cue and no leak cue", () => {
    releaseFirstWave();
    const creepId = [...session.creeps.keys()][0];
    expect(creepId).toBeDefined();
    runner.ctx.scene.entity.effect({ from: BASE_ENTITY_ID, to: creepId!, effect: "damage", via: { amount: 1000 } });
    expect(session.creeps.has(creepId!)).toBe(false);
    expect(played).toEqual([ENEMY_KILLED_CUE]);
  });

  test("a creep reaching the keep plays the leak cue and no kill cue", () => {
    releaseFirstWave();
    for (let i = 0; i < 400 && played.length === 0; i++) tickWaves(runner.ctx, 0.5);
    expect(played).toContain(ENEMY_LEAKED_CUE);
    expect(played).not.toContain(ENEMY_KILLED_CUE);
  });
});
