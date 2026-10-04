import { describe, expect, test } from "bun:test";
import { pointInVolume } from "@jgengine/core/scene/authoredTriggers";
import { editorLayers } from "./editorLayers";
import { world } from "./world";

describe("authored field survey", () => {
  test("all observation points have a bounded interaction radius and a visible studio landmark", () => {
    const points = editorLayers.markers.filter((marker) => marker.kind === "survey_point");
    expect(points.map((point) => point.id).sort()).toEqual([
      "survey_hazard", "survey_meadow", "survey_station", "survey_water",
    ]);
    const station = points.find((point) => point.meta?.role === "station")!;
    const bookcase = editorLayers.markers.find((marker) => marker.id === "bookcase_1")!;
    expect(station.position).toEqual(bookcase.position);
    for (const point of points) {
      expect(Number(point.meta?.triggerRadius)).toBeGreaterThan(0);
      expect(Number(point.meta?.triggerRadius)).toBeLessThanOrEqual(3);
    }
    expect(editorLayers.volumes.some((volume) => volume.id === "pond_1" && volume.kind === "water")).toBe(true);
    expect(editorLayers.volumes.some((volume) => volume.id === "meadow_1" && volume.kind === "grass_field")).toBe(true);
    expect(editorLayers.volumes.some((volume) => volume.id === "hazard_scorch" && volume.kind === "soil")).toBe(true);
  });

  test("safe observations stay outside the hazard and the optional sample requires entering it", () => {
    const hazard = editorLayers.volumes.find((volume) => volume.id === "hazard_zone")!;
    expect(hazard.shape).toBe("cylinder");
    if (hazard.shape !== "cylinder") throw new Error("Survey hazard must have a radial boundary");
    for (const marker of editorLayers.markers.filter((point) => point.kind === "survey_point")) {
      const position = { ...marker.position, y: hazard.center.y };
      const distance = Math.hypot(position.x - hazard.center.x, position.z - hazard.center.z);
      const radius = Number(marker.meta?.triggerRadius);
      if (marker.meta?.sample === "hazard") {
        expect(pointInVolume(hazard, position)).toBe(true);
        expect(distance + radius).toBeLessThan(hazard.radius);
      } else {
        expect(distance - radius).toBeGreaterThan(hazard.radius);
      }
    }
  });

  test("the live world consumes authored daylight while retaining the meadow contrast", () => {
    expect(world.sky?.preset).toBe(editorLayers.environment?.preset);
    expect(world.sky?.horizonColor).toBe(editorLayers.environment?.horizonColor);
    expect(world.sky?.sunIntensity).toBe(editorLayers.environment?.sunIntensity);
    expect(world.sky?.fog).toEqual(editorLayers.environment?.fog);
    const yard = editorLayers.volumes.find((volume) => volume.id === "base_turf")!;
    const meadow = editorLayers.volumes.find((volume) => volume.id === "meadow_1")!;
    expect(Number(yard.meta?.bladeHeight)).toBeLessThan(Number(meadow.meta?.bladeHeight));
    expect(Number(yard.meta?.density)).toBeLessThan(Number(meadow.meta?.density));
  });
});
