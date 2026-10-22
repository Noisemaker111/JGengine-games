import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { findLibraryMaterial, libraryMaterialMaps } from "@jgengine/assets/catalogs/materialLibrary";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";

/** Preferred CC0 packs — pull + reindex to light up MODEL_PLAN ids. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "quaternius-modular-scifi",
    "quaternius-stylized-nature",
    "kaykit-furniture",
    "kaykit-space-base",
  ],
});

/**
 * The ambientCG scan under the habitat floor and the ground beyond it. The shared library names the
 * surface (`ground/gravel`); this id is only what `bun run provision` pulls and what resolves the
 * one map role the library does not publish (see {@link libraryGroundMaps}).
 */
const GROUND_MATERIAL_SOURCE = "ambientcg-gravel002";

/** Every pack this game pulls — the credits screen is generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [
  "quaternius-modular-scifi",
  "quaternius-stylized-nature",
  "kaykit-adventurers",
  "kaykit-furniture",
  "kaykit-space-base",
  "ambientcg-metalplates001",
  GROUND_MATERIAL_SOURCE,
];

const materials = buildMaterialCatalog({ basePath: "/materials" });

/** The scan's own resolution — the only place the `displacement` URL comes from. */
function groundScanDisplacement(): string {
  const maps = materials.resolve(GROUND_MATERIAL_SOURCE)?.maps;
  if (maps === undefined) throw new Error(`odd-orbit: unknown material source "${GROUND_MATERIAL_SOURCE}"`);
  return maps.displacement;
}

/**
 * Terrain detail maps for a named material from the shared library: the scanned ambientCG maps
 * `assets pull` writes, ready for `terrain({ detail: { material: { maps } } })`.
 *
 * `TerrainMaterialMaps` requires a `displacement` URL that the terrain shader never samples, and the
 * library publishes no displacement role, so that one URL comes from the material catalog's own
 * resolution of the same source. Delete the second lookup when the library exposes it.
 */
export function libraryGroundMaps(name: string): TerrainMaterialMaps {
  const entry = findLibraryMaterial(name);
  if (entry === null) throw new Error(`odd-orbit: unknown library material "${name}"`);
  if (entry.source !== GROUND_MATERIAL_SOURCE) {
    throw new Error(`odd-orbit: "${name}" is not the habitat's authored ground scan (${GROUND_MATERIAL_SOURCE})`);
  }
  const maps = libraryMaterialMaps(entry, { basePath: "/materials" });
  const { color, normal, roughness, ao } = maps;
  if (color === undefined || normal === undefined) {
    throw new Error(`odd-orbit: library material "${name}" is missing a color or normal map`);
  }
  return {
    color: color.url,
    normal: normal.url,
    ...(roughness === undefined ? {} : { roughness: roughness.url }),
    ...(ao === undefined ? {} : { ao: ao.url }),
    displacement: groundScanDisplacement(),
  };
}
