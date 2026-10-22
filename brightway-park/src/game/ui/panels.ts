import type { PanelDef } from "@jgengine/core/ui/panelModel";

/**
 * The park's toggleable windows, declared once for the engine's `usePanels` manager
 * (`@jgengine/react/panels`) so the hotkey, the close key and the open/closed state all come
 * from the shared panel model instead of a local keydown listener.
 *
 * The build palette starts open — that is the park's opening state — and `KeyB` toggles it;
 * ESC closes it. The park keeps its own bottom-bar layout and renders it from the manager.
 */
export const PARK_PANELS: readonly PanelDef[] = [
  { id: "build", title: "Build palette", hotkey: "KeyB", initial: true, closable: true },
];

/** The panel id the build palette renders under. */
export const BUILD_PANEL = "build";
