import { describe, expect, test } from "bun:test";
import { isScatterPath, readScatterPalette } from "@jgengine/core/world";

import { editorLayers } from "../editorLayers";
import { scatterModels } from "./models";

describe("scatter palette coverage", () => {
  test("every item the authored forest paths scatter maps to a catalog model", () => {
    const items = new Set<string>();
    for (const path of editorLayers.paths) {
      if (!isScatterPath(path)) continue;
      for (const entry of readScatterPalette(path.meta)) items.add(entry.item);
    }
    expect(items.size).toBeGreaterThan(0);
    for (const item of items) {
      expect(scatterModels[item], `scatter item "${item}" has no scatterModels mapping`).toBeDefined();
    }
  });

  test("scatter models are nature-pack GLBs sized to their proxy heights", () => {
    for (const [item, model] of Object.entries(scatterModels)) {
      expect(model.url, item).toContain("quaternius-stylized-nature/");
      expect(model.targetHeight ?? 0, item).toBeGreaterThan(0);
    }
  });
});
