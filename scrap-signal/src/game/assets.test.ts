import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "bun:test";
import { CLIFF_MAPS, GROUND_MAPS, PANEL_MAPS, SCRAP_METAL_MAPS } from "./assets";

test("render materials request only maps provisioned by their published asset packs", () => {
  for (const maps of [GROUND_MAPS, CLIFF_MAPS, PANEL_MAPS, SCRAP_METAL_MAPS]) {
    for (const [role, url] of Object.entries(maps)) {
      if (role === "ktx2") continue;
      expect(existsSync(resolve(import.meta.dir, "../..", `public${url}`))).toBe(true);
    }
  }
  expect(PANEL_MAPS.ao).toBeUndefined();
});
