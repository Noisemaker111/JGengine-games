import type { PanelDef } from "@jgengine/core/ui/panelModel";

/**
 * The park's toggleable windows on the engine's `usePanels` manager: the build palette starts open
 * (B toggles it) and the park books open on request (L); ESC closes the top one.
 */
export const PARK_PANELS: readonly PanelDef[] = [
  { id: "build", title: "Build palette", hotkey: "KeyB", initial: true },
  { id: "books", title: "Park books", hotkey: "KeyL" },
];

export const BUILD_PANEL = "build";
