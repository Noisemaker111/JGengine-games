import type { HudAnchor } from "@jgengine/core/ui/hudLayout";

/** Every live HUD block, its anchor and its lane. One owner: the UI spreads these onto `HudPanel`. */
export interface HudPanelClaim {
  id: HudPanelId;
  anchor: HudAnchor;
  lane: string;
  order: number;
  /** Measured rendered size at 1600x900 and at 844x390 (the two acceptance sizes), in HUD pixels. */
  measured: { wide: { w: number; h: number }; compact: { w: number; h: number } };
}
export type HudPanelId = "title" | "shift" | "air" | "vitals" | "home" | "haul" | "radio" | "prompt";

/*
 * Marrow's live chrome is one lane per column: the shift plate and its docket stack in the
 * top-left lane, the buttons and the tank in the top-right lane, the rail feed at the bottom.
 * The engine resolves the columns, so a panel added to a lane can only take free space.
 */
export const HUD_PANELS: readonly HudPanelClaim[] = [
  { id: "title", anchor: "top-left", lane: "rail", order: 0, measured: { wide: { w: 277, h: 76 }, compact: { w: 227, h: 59 } } },
  { id: "vitals", anchor: "top-left", lane: "rail", order: 1, measured: { wide: { w: 194, h: 120 }, compact: { w: 174, h: 108 } } },
  { id: "home", anchor: "top-left", lane: "rail", order: 1, measured: { wide: { w: 290, h: 343 }, compact: { w: 290, h: 165 } } },
  { id: "shift", anchor: "top-right", lane: "rail", order: 0, measured: { wide: { w: 304, h: 36 }, compact: { w: 305, h: 36 } } },
  { id: "air", anchor: "top-right", lane: "rail", order: 1, measured: { wide: { w: 188, h: 110 }, compact: { w: 152, h: 96 } } },
  { id: "haul", anchor: "bottom-right", lane: "rail", order: 0, measured: { wide: { w: 188, h: 150 }, compact: { w: 152, h: 132 } } },
  { id: "radio", anchor: "bottom", lane: "rail", order: 0, measured: { wide: { w: 480, h: 53 }, compact: { w: 480, h: 51 } } },
  { id: "prompt", anchor: "bottom", lane: "rail", order: 1, measured: { wide: { w: 333, h: 22 }, compact: { w: 334, h: 22 } } },
];

const byId = new Map(HUD_PANELS.map(claim => [claim.id, claim] as const));
/** The panel props for one block; the claim table is the source, not the call site. */
export function placement(id: HudPanelId): { id: string; anchor: HudAnchor; lane: string; order: number } {
  const claim = byId.get(id);
  if (claim === undefined) throw new Error(`deepward: no HUD lane declared for "${id}"`);
  return { id: claim.id, anchor: claim.anchor, lane: claim.lane, order: claim.order };
}
