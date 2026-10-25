import { librarySurfaceParameters, librarySurfaceScan } from "@jgengine/assets/catalogs/materialLibrary";
import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "../assets";
import { BUILDING_SPECS } from "./buildings";
import { CAR_MODEL_NAME, CAST } from "./cast";
import { LIBRARY_PROPS } from "./props";

const CITY = "kaykit-city-builder";
const SPACE = "kaykit-space-base";
const DUNGEON = "kaykit-dungeon";

/** Lacquered body paint: the clearcoat is what separates a car from a clay toy. */
const GLOSS = librarySurfaceParameters("paint/gloss");
/** The unit building every lot scales to its own width, depth and storey height. */
const CITY_BLOCK_URL = new URL("../../art/city-block.glb", import.meta.url).href;

/**
 * Traffic is the library's Khronos CarConcept (CC-BY 4.0) at its real 4.4 m length, resprayed per
 * kind: only the two body-paint materials take the colour, so glass, lights, tyres and trim keep
 * their own finish. Police and the shuttle stay on the city kit until the library has a cruiser and
 * a bus (`libraryModelGap("bus")`).
 */
const CAR_PAINT = ["Paint 1 Carmine", "Paint 2 Carmine"];
function car(color: string): ModelConfig {
  return { ...libraryModel(CAR_MODEL_NAME), material: { ...GLOSS, color, materials: CAR_PAINT } };
}

const castModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(Object.entries(CAST).map(([id, name]) => [id, libraryModel(name)])),
  car_compact: car("#f2c14e"),
  car_muscle: car("#b8282e"),
  car_sport: car("#2fa8b8"),
  car_suv: car("#59664a"),
};

export const entityModels: Record<string, ModelConfig> = {
  ...resolveModelPlan(assets, {
  car_cop: {
    model: `${CITY}/car_police`,
    fallbackModel: `${CITY}/car_taxi`,
    style: { targetHeight: 1.4, material: GLOSS },
  },
  car_bus: {
    // Large boxy truck body as an island shuttle bus; scaled up to bus height. Never Kenney.
    model: `${SPACE}/spacetruck_large`,
    fallbackModel: `${SPACE}/spacetruck`,
    style: { targetHeight: 3.3, material: { color: "#e0a53c" } },
  },
  air_helicopter: {
    model: `${SPACE}/lander_B`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 2.2, material: { color: "#e7e9ee", metalness: 0.55, roughness: 0.32 } },
  },
  air_trainer: {
    model: `${SPACE}/lander_A`,
    fallbackModel: `${CITY}/car_sedan`,
    style: { targetHeight: 1.8, material: { color: "#f4d35e", metalness: 0.28, roughness: 0.45 } },
  },
  air_prop: {
    model: `${SPACE}/spacetruck`,
    fallbackModel: `${CITY}/car_stationwagon`,
    style: { targetHeight: 2, material: { color: "#e85d4a", metalness: 0.35, roughness: 0.38 } },
  },
  air_jet: {
    model: `${SPACE}/spacetruck_large`,
    fallbackModel: `${CITY}/car_police`,
    style: { targetHeight: 1.65, material: { color: "#697582", metalness: 0.72, roughness: 0.25 } },
  },
  air_vtol: {
    model: `${SPACE}/lander_base`,
    fallbackModel: `${CITY}/car_police`,
    style: { targetHeight: 1.9, material: { color: "#3d5a45", metalness: 0.68, roughness: 0.3 } },
  },
  }),
  ...castModels,
};

/**
 * The palm is one authored GLB drawn at three street sizes, so all three species share its two
 * detail levels. `mainsail-palm-far.glb` keeps every frond vertex (the crown is the look) and
 * collapses only the trunk rings and coconuts; past 60 m a palm is a silhouette, and the engine's
 * per-instance switch holds an instance on its level for 6 m either side of the boundary.
 */
const PALM_URL = new URL("../../art/mainsail-palm.glb", import.meta.url).href;
const PALM_FAR_URL = new URL("../../art/mainsail-palm-far.glb", import.meta.url).href;
const PALM_VARIANTS = { levels: [{ url: PALM_URL, maxDistance: 60 }, { url: PALM_FAR_URL }] } as const;

/**
 * Street-tree planting cycle — `setup.ts` walks it so no two neighbours match.
 */
export const PALM_IDS: readonly string[] = [
  "obj_palm",
  "obj_palm_tall",
  "obj_palm_low",
  "obj_palm",
  "obj_palm_low",
  "obj_palm_tall",
];

const objectPlan: Record<string, ModelPick> = {
  obj_gunshop_sign: {
    model: `${CITY}/trafficlight_A`,
    fallbackModel: `${DUNGEON}/banner_red`,
    style: { targetHeight: 2.4 },
  },
  obj_safehouse_sign: {
    model: `${DUNGEON}/banner_green`,
    fallbackModel: `${DUNGEON}/banner_red`,
    style: { targetHeight: 2.4 },
  },
  obj_hhpd_sign: {
    model: `${DUNGEON}/banner_blue`,
    fallbackModel: `${DUNGEON}/banner_red`,
    style: { targetHeight: 2.4 },
  },
  // Emissive, not just pink: the bloom stage needs something above threshold to glow around, and a
  // storefront sign is the only light source a daylit street legitimately has.
  obj_neon: {
    model: `${DUNGEON}/banner_red`,
    fallbackModel: `${CITY}/trafficlight_B`,
    style: { targetHeight: 3.4, material: { color: "#ff5aa8", emissive: "#ff2f95", emissiveIntensity: 1.5 } },
  },
  // Street signal rather than a second banner: at kerb height a hanging cloth reads as a stick, and
  // a lit signal head is the piece of furniture a junction is actually missing.
  obj_signal: {
    model: `${CITY}/trafficlight_B`,
    fallbackModel: `${CITY}/trafficlight_A`,
    style: { targetHeight: 3.6, material: { emissive: "#2fd8b0", emissiveIntensity: 0.55 } },
  },
  obj_cargo: {
    model: `${SPACE}/containers_B`,
    fallbackModel: `${CITY}/box_B`,
    style: { targetHeight: 2.4, material: { color: "#c08a3c" } },
  },
};

/**
 * Each cast is the unit block with one scanned facade on its walls; the roof keeps its own membrane.
 * Native size (no `targetHeight`): every placement scales it to its lot through `visual.scale`.
 */
const BUILDING_MODELS: Record<string, ModelConfig> = Object.fromEntries(
  BUILDING_SPECS.map((b) => [
    b.id,
    {
      url: CITY_BLOCK_URL,
      anchor: "origin",
      material: { scan: librarySurfaceScan(b.facade, { tint: 1 }), materials: ["facade"] },
    } satisfies ModelConfig,
  ]),
);

export const objectModels: Record<string, ModelConfig> = (() => {
  const plan = resolveModelPlan(assets, objectPlan);
  return {
    ...plan,
    ...LIBRARY_PROPS,
    ...BUILDING_MODELS,
    // Driveways are the unit block flattened to a slab, in the sidewalk's concrete.
    obj_driveway: {
      url: CITY_BLOCK_URL,
      anchor: "origin",
      material: { color: "#c4beb2", scan: librarySurfaceScan("concrete/smooth", { tint: 0 }) },
    },
    obj_flametree: { url: PALM_URL, targetHeight: 6.8, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm_planter: { url: PALM_URL, targetHeight: 5.8, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm: { url: PALM_URL, targetHeight: 7.6, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm_tall: { url: PALM_URL, targetHeight: 9, anchor: "origin", variants: PALM_VARIANTS },
    obj_palm_low: { url: PALM_URL, targetHeight: 6.2, anchor: "origin", variants: PALM_VARIANTS },
    obj_dispatch: { url: new URL("../../art/dispatch-booth.glb", import.meta.url).href, anchor: "origin" },
    obj_delivery_1: { url: new URL("../../art/parcel-tower-1.glb", import.meta.url).href, anchor: "origin" },
    obj_delivery_2: { url: new URL("../../art/parcel-tower-2.glb", import.meta.url).href, anchor: "origin" },
    obj_delivery_3: { url: new URL("../../art/parcel-tower-3.glb", import.meta.url).href, anchor: "origin" },
  };
})();
