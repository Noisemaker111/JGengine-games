import { describe, expect, test } from "bun:test";

import { findEditorVolume } from "@jgengine/core/editor/document";
import { collectAuthoredTriggers, getTriggerAction, pointInVolume } from "@jgengine/core/scene/authoredTriggers";

import { editorLayers } from "../editorLayers";
import { player } from "./entities/players/catalog";
import { healthDelta } from "./health";
import { HAZARD_ACTION } from "./triggers";

describe("studio-showcase health loop", () => {
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
