import { describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { content } from "./content";
import { loop } from "../loop";
import { physics, world } from "../world";
import { collected, initSurvey, noteCount, survey, surveySites, surveyLifecycle } from "./survey";
import type { KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { activeActionCodes, playControlsActive } from "@jgengine/core/game/controlGate";
import { keybinds } from "./keybinds";

function runner(storage: KeyValueStorage | null) {
  const value = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Survey journey", assets: createAssetCatalog(), multiplayer: "off", world, physics, lifecycle: surveyLifecycle }),
    content, loop: { ...loop, onInit: (ctx) => initSurvey(ctx, storage) }, player: { userId: "researcher", isNew: true },
  });
  value.ctx.game.commands.run("start", null);
  return value;
}

function visit(value: ReturnType<typeof runner>, id: string) {
  const site = surveySites.find((entry) => entry.id === id)!;
  value.ctx.scene.entity.update("researcher", { position: [site.position.x, 0, site.position.z] });
  return value.ctx.game.commands.run("survey.interact", null);
}

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}

describe("Field Station survey journey", () => {
  test("menu retains tracker bindings behind its gate; pause freezes hazard and observation commands until resume", () => {
    const value = createHeadlessRunner({
      definition: defineGameDefinition({ name: "Survey lifecycle", assets: createAssetCatalog(), multiplayer: "off", world, physics, lifecycle: surveyLifecycle }),
      content, loop, player: { userId: "researcher", isNew: true }, playerMovement: true,
    });
    expect(survey.read(value.ctx).phase).toBe("menu");
    expect(playControlsActive(value.ctx)).toBe(false);
    expect(activeActionCodes(value.ctx, keybinds).moveForward).toEqual(["KeyW"]);
    value.ctx.game.commands.run("start", null);
    expect(playControlsActive(value.ctx)).toBe(true);
    visit(value, "survey_hazard");
    value.step(0.05);
    const health = value.ctx.scene.entity.stats.get("researcher", "health")!.current;
    value.ctx.game.commands.run("survey.pause", null);
    for (let i = 0; i < 120; i++) value.step(1 / 60, { held: ["moveForward"] });
    expect(value.ctx.scene.entity.stats.get("researcher", "health")!.current).toBe(health);
    expect(playControlsActive(value.ctx)).toBe(false);
    value.ctx.game.commands.run("survey.pause", null);
    expect(playControlsActive(value.ctx)).toBe(true);
  });

  test("requires the actual safe sites, rejects remote/duplicate observations and banks a reload-safe report", () => {
    const storage = memoryStorage();
    const value = runner(storage);
    value.ctx.game.commands.run("survey.interact", null);
    expect(noteCount(survey.read(value.ctx))).toBe(0);
    visit(value, "survey_station");
    expect(survey.read(value.ctx).profile.reports).toBe(0);
    visit(value, "survey_meadow");
    visit(value, "survey_meadow");
    expect(noteCount(survey.read(value.ctx))).toBe(1);
    visit(value, "survey_water");
    visit(value, "survey_station");
    expect(survey.read(value.ctx).profile).toEqual({ reports: 1, bestQuality: 2 });
    expect(noteCount(survey.read(value.ctx))).toBe(0);
    const resumed = runner(storage);
    expect(survey.read(resumed.ctx).profile).toEqual({ reports: 1, bestQuality: 2 });
    expect(noteCount(survey.read(resumed.ctx))).toBe(0);
  });

  test("optional scorch observation improves report quality; lethal authored hazard loses only unbanked notes", () => {
    const value = runner(memoryStorage());
    visit(value, "survey_meadow");
    visit(value, "survey_water");
    visit(value, "survey_hazard");
    expect(collected(survey.read(value.ctx), "hazard")).toBe(true);
    visit(value, "survey_station");
    expect(survey.read(value.ctx).profile.bestQuality).toBe(3);
    visit(value, "survey_meadow");
    visit(value, "survey_hazard");
    value.ctx.scene.entity.stats.set("researcher", "health", { current: 0.5 });
    value.step(0.05);
    expect(value.ctx.scene.entity.stats.get("researcher", "health")?.current).toBe(100);
    expect(survey.read(value.ctx).rescued).toBe(true);
    expect(noteCount(survey.read(value.ctx))).toBe(0);
    expect(survey.read(value.ctx).profile).toEqual({ reports: 1, bestQuality: 3 });
    expect(survey.read(value.ctx).feedback).toContain("2 unfiled observations lost");
  });

  test("denied and corrupt storage preserve play and report session-only persistence truthfully", () => {
    for (const storage of [null, { getItem: () => "{bad", setItem: () => { throw new Error("quota"); }, removeItem: () => {} }]) {
      const value = runner(storage);
      visit(value, "survey_meadow");
      visit(value, "survey_water");
      visit(value, "survey_station");
      expect(survey.read(value.ctx).profile.reports).toBe(1);
      expect(survey.read(value.ctx).feedback).toContain("this session only");
      expect(survey.read(runner(storage).ctx).profile.reports).toBe(0);
    }
  });
});
