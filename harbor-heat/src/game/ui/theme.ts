import { hudTheme } from "@jgengine/react/hudTheme";
import { customizeKit } from "@jgengine/react/uiKit";
import { UI_KITS } from "@jgengine/react/uiKits";

/** Mainsail at sundown: harbor-teal ink on cream card stock, an amber dispatch accent, coral alarms. */
const TEAL = "#0e2c38";
const CREAM = "#fff0d2";
const AMBER = "#ffb020";
const CORAL = "#ef5a3c";

/**
 * Inkline drawn as a Mainsail dispatch poster: the ink is deep harbor teal instead of black, every
 * caption tab is a sunset band (amber into orange into coral), halftone dots are warm, and type is the
 * condensed street-sign face of the boulevard.
 */
export const harborKit = customizeKit(UI_KITS.ink, {
  name: "Harbor Heat",
  tokens: {
    ink: TEAL,
    line: TEAL,
    surface: CREAM,
    surfaceAlt: "#f4d9a6",
    accent: AMBER,
    accentInk: TEAL,
    good: "#2fb39a",
    warn: "#ff8a3d",
    bad: CORAL,
    scrim: "rgba(8, 35, 45, 0.62)",
    halftone: "rgba(239, 90, 60, 0.2)",
    fontDisplay: "Impact, \"Haettenschweiler\", \"Arial Narrow Bold\", sans-serif",
    fontBody: "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  },
  css: `
[data-jg-kit] .jgk-ink-title { background: linear-gradient(100deg, var(--kit-accent) 64%, var(--kit-warn) 64% 80%, var(--kit-bad) 80%); }
[data-jg-kit] .jgk-ink-panel[data-variant="hud"] { margin-top: 20px; max-width: min(380px, 88vw); }
[data-jg-kit] .jgk-ink-panel[data-variant="hud"] .jgk-ink-panel-body { font-size: calc(13px * var(--kit-text)); }
@media (max-width: 600px) {
  [data-jg-kit] .jgk-ink-menu[data-variant] .jgk-ink-menu-item { min-width: 0; padding: 6px 14px 4px; font-size: 19px; }
}
.hh-field { display: grid; gap: 6px; max-width: 420px; font: 700 12px var(--kit-font-body); letter-spacing: .14em; text-transform: uppercase; }
.hh-field input { padding: 8px 12px; border: 3px solid var(--kit-line); background: var(--kit-surface); color: var(--kit-ink); font: 400 26px var(--kit-font-display); letter-spacing: .04em; box-shadow: 4px 4px 0 var(--kit-line); transform: skewX(-6deg); outline: none; }
.hh-field input:focus-visible { outline: 3px dashed var(--kit-accent); outline-offset: 4px; }
`,
});

/** The same palette for the shell parts a kit does not draw (settings, touch dock, menu header). */
export const harborTheme = hudTheme({
  palette: { accent: AMBER, accentDeep: "#ad7140", accentGlow: "#ffb02066", accentDim: "#ffb02022", health: "#3fbf5a", shield: "#4fa5e8", xp: "#e8a5ff" },
  surface: { surface: "#102e3be8", surfaceDeep: "#08232d", edge: "#76d4c355", edgeBright: "#76d4c3", text: CREAM, textDim: "#b9cbd0", backdrop: "#08232dc9" },
  status: { danger: CORAL, warning: AMBER, success: "#3fbf5a", hostile: "#c23b3b", friendly: "#76d4c3", neutral: "#ffc879" },
  font: { display: "\"Arial Black\", Impact, sans-serif", body: "\"Arial Narrow\", \"Segoe UI\", sans-serif", numeric: "system-ui, sans-serif" },
  frame: { bg: "#102e3b", border: "1px solid #76d4c377", radius: "8px", glow: "0 20px 80px #0008" },
  slot: { bg: "#194451", border: "1px solid #76d4c355", radius: "5px" },
});
