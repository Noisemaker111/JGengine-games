import { deriveHudTheme, hudThemeVars } from "@jgengine/react/hudTheme";

// Frontier field kit: etched brass, soot-dark leather, warm parchment, restrained green vitals.
const seed = deriveHudTheme({ accent: "#d8b66c", surface: "#192320", text: "#f3e7cb", health: "#7fb06d", mana: "#6babc7", xp: "#ba9b60", danger: "#de7966", fontDisplay: '"Cinzel", Georgia, serif' });
export const lanternTheme = {
  ...seed,
  font: { display: '"Cinzel", Georgia, serif', body: '"Alegreya Sans", "Segoe UI", sans-serif', numeric: '"Segoe UI", sans-serif' },
  surface: { ...seed.surface, surface: "#18221ff2", surfaceDeep: "#0d1513", edge: "#625b40", edgeBright: "#bca16b", textDim: "#bdb69f" },
  frame: { bg: "linear-gradient(135deg, #23302bf5, #101b17f5)", border: "1px solid #a18a59", radius: "2px", glow: "0 3px 14px #0008, inset 0 1px #efe0af20" },
  bar: { ...seed.bar, track: "#080f0d", frame: "#625b40", height: "18px", radius: "1px", text: "#fff8e8" },
};
export const lanternThemeStyle = hudThemeVars(lanternTheme);

export const PANEL = "lantern-panel";

export const PANEL_TITLE =
  "lantern-title flex items-center justify-between gap-4 border-b border-[#716449] px-4 py-2.5 text-[15px]";

export const CLOSE_BUTTON =
  "rounded-[3px] border border-[#716449] bg-[#1a1410] px-2 py-0.5 text-[#c9b27a] hover:text-[#f1d593]";

export const BUTTON = "lantern-btn px-3 py-1 text-xs font-semibold";

export const QUALITY_COLORS: Record<string, string> = {
  poor: "text-stone-400",
  common: "text-stone-100",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-purple-400",
};

export const RESOURCE_COLORS: Record<string, string> = {
  mana: "bg-[#6babc7]",
  rage: "bg-[#c87158]",
  energy: "bg-[#dbc16e]",
};

export function copperLabel(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const rest = copper % 100;
  if (gold > 0) return `${gold}g ${silver}s ${rest}c`;
  if (silver > 0) return `${silver}s ${rest}c`;
  return `${rest}c`;
}

/* UI ART DIRECTION
 * Player fantasy: a named adventurer carrying a field kit along an unsafe frontier road.
 * Tone: warm lantern light against deep woodland ink; practical, watchful, welcoming.
 * Shape/material: squared brass rails and etched edges over dark leather; quiet corner notches.
 * Type: Cinzel for names and headings, Alegreya Sans for prose, Segoe UI for measured values.
 * Motion: short hover/press response; reduced-motion support; existing game sound feedback.
 * Icons: GameIcon silhouettes and painted IconTreatment faces, with text and key legends.
 * Hierarchy: health/target, abilities, current objectives, then journal/map/chat reference.
 * Avoid: equal-weight dashboard cards, empty persistent logs, raw ids, tiny desktop HUD on phones.
 */
