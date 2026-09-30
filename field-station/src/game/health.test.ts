import { describe, expect, test } from "bun:test";

import { findEditorVolume } from "@jgengine/core/editor/document";
import { collectAuthoredTriggers, getTriggerAction, pointInVolume } from "@jgengine/core/scene/authoredTriggers";

import { editorLayers } from "../editorLayers";
import { player } from "./entities/players/catalog";
import { healthDelta } from "./health";
import { HAZARD_ACTION } from "./triggers";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { content } from "./content";
import { loop } from "../loop";
import { world, physics } from "../world";
import { BASE, decodeCheckpoint, expedition, expeditionLifecycle, SAMPLE_SECONDS, STATIONS } from "./expedition";

describe("field-station health loop", () => {
  test("actual authored trigger loop drains, regenerates and respawns with full health", () => {
    const runner = createHeadlessRunner({
      definition: defineGameDefinition({ name: "Studio health journey", lifecycle: expeditionLifecycle, assets: createAssetCatalog(), multiplayer: "off", world, physics }),
      content, loop, player: { userId: "health-journey", isNew: true },
    });
    const { ctx } = runner;
    const id = ctx.player.userId;
    ctx.game.commands.run("start", {});
    const spawn = ctx.scene.entity.get(id)!.position;
    const zone = findEditorVolume(editorLayers, "hazard_zone")!;
    const tick = (count: number) => { for (let i = 0; i < count; i++) runner.step(0.05); };
    ctx.scene.entity.update(id, { position: [zone.center.x, 0, zone.center.z] });
    tick(20);
    expect(ctx.scene.entity.stats.get(id, "health")!.current).toBeCloseTo(82);
    ctx.game.commands.run("survey.pause", {});
    tick(20);
    expect(ctx.scene.entity.stats.get(id, "health")!.current).toBeCloseTo(82);
    expect(expedition.read(ctx).phase).toBe("paused");
    ctx.game.commands.run("survey.resume", {});
    ctx.scene.entity.update(id, { position: [...spawn] });
    tick(20);
    expect(ctx.scene.entity.stats.get(id, "health")!.current).toBeCloseTo(90);
    ctx.scene.entity.update(id, { position: [zone.center.x, 0, zone.center.z] });
    ctx.scene.entity.stats.set(id, "health", { current: 0.5 });
    tick(1);
    expect(ctx.scene.entity.stats.get(id, "health")!.current).toBe(100);
    expect(ctx.scene.entity.get(id)!.position).toEqual(spawn);
    expect(expedition.read(ctx).phase).toBe("lost");
    ctx.game.commands.run("restart", {});
    expect(expedition.read(ctx).phase).toBe("playing");
  });

  test("actual survey loop requires uninterrupted proximity and archives all three readings at base", () => {
    const runner = createHeadlessRunner({
      definition: defineGameDefinition({ name: "Survey journey", lifecycle: expeditionLifecycle, assets: createAssetCatalog(), multiplayer: "off", world, physics }),
      content, loop, player: { userId: "survey-journey", isNew: true },
    });
    const { ctx } = runner;
    const id = ctx.player.userId;
    const hold = (seconds: number) => { ctx.input.publish(["interact"]); for (let i = 0; i < Math.ceil(seconds / 0.05); i++) runner.step(0.05); };
    ctx.game.commands.run("start", {});
    const water = STATIONS[0];
    ctx.scene.entity.update(id, { position: [water.x, 0, water.z] });
    hold(1);
    ctx.input.publish([]);
    runner.step(0.05);
    expect(expedition.read(ctx).progress).toBe(0);
    hold(1.6);
    expect(expedition.read(ctx).collected).toEqual([]);
    ctx.input.publish([]);
    runner.step(0.05);
    for (const station of STATIONS) {
      ctx.scene.entity.update(id, { position: [station.x, 0, station.z] });
      ctx.scene.entity.stats.set(id, "health", { current: 100 });
      hold(SAMPLE_SECONDS + 0.1);
      ctx.input.publish([]);
      runner.step(0.05);
    }
    expect(expedition.read(ctx).collected).toEqual(STATIONS.map(s => s.id));
    expect(expedition.read(ctx).phase).toBe("playing");
    ctx.scene.entity.update(id, { position: [BASE.x, 0, BASE.z] });
    hold(SAMPLE_SECONDS + 0.1);
    expect(expedition.read(ctx).phase).toBe("won");
    expect(ctx.scene.entity.get(id)!.movement.frozen).toBe(true);
  });

  test("checkpoint boundary accepts the versioned log and rejects corrupted data", () => {
    const valid = { version: 1, collected: ["water"], elapsed: 10, position: [6, 0, 6], health: 75, completed: false };
    expect(decodeCheckpoint(JSON.stringify(valid))).toEqual(valid);
    for (const bad of [null, "{", JSON.stringify({ ...valid, health: 0 }), JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, collected: ["water", "water"] }), JSON.stringify({ ...valid, position: [6, "0", 6] })]) expect(decodeCheckpoint(bad)).toBeNull();
  });

  test("drains inside a hazard and regenerates outside it", () => {
    expect(healthDelta({ inHazard: true, damagePerSecond: 18, regenPerSecond: 8, dt: 0.5 })).toBe(-9);
    expect(healthDelta({ inHazard: false, damagePerSecond: 18, regenPerSecond: 8, dt: 0.5 })).toBe(4);
  });

  test("player regenerates slower than the hazard drains, so standing inside still costs health", () => {
    const hazard = collectAuthoredTriggers(editorLayers).find((trigger) => trigger.action === HAZARD_ACTION);
    expect(hazard).toBeDefined();
    expect(Number(hazard!.params.damagePerSecond)).toBeGreaterThan(player.regenPerSecond);
  });

  test("hazard action is registered for zone enter events", () => {
    const action = getTriggerAction(HAZARD_ACTION);
    expect(action).toBeDefined();
    expect(action!.events).toEqual(["enter"]);
  });

  test("hazard zone is authored with a visible soil footprint and does not cover the spawn", () => {
    const zone = findEditorVolume(editorLayers, "hazard_zone");
    const scorch = findEditorVolume(editorLayers, "hazard_scorch");
    expect(zone?.meta?.action).toBe(HAZARD_ACTION);
    expect(scorch?.kind).toBe("soil");
    expect(scorch?.center.x).toBe(zone?.center.x);
    expect(scorch?.center.z).toBe(zone?.center.z);
    const spawn = editorLayers.markers.find((marker) => marker.kind === "player_spawn");
    expect(spawn).toBeDefined();
    expect(pointInVolume(zone!, spawn!.position)).toBe(false);
    expect(pointInVolume(zone!, { x: zone!.center.x, y: 0, z: zone!.center.z })).toBe(true);
  });
});
