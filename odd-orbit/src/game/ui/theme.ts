import { hudTheme } from "@jgengine/react/hudTheme";

/** Odd Orbit's dusk-lilac habitat palette; the shell applies it at the HUD root. */
export const orbitTheme = hudTheme({
  palette: { accent: "#f5a8dc", accentDeep: "#914870", accentGlow: "#e690bf44", health: "#8edaba" },
  surface: { surface: "#342547", surfaceDeep: "#20172d", edge: "#765778", edgeBright: "#f5a8dc", text: "#fff0d5", textDim: "#c9b6ce", backdrop: "#1a1029de" },
  status: { warning: "#ffca81", danger: "#ff969b", success: "#8edaba", friendly: "#8edaba" },
  font: { display: "'Trebuchet MS', sans-serif", body: "'Segoe UI', sans-serif", numeric: "'Segoe UI', sans-serif" },
  frame: { radius: "4px 20px 4px 4px", bg: "#342547", border: "1px solid #765778", glow: "0 6px 18px #170d2866" },
});

/** Frame panels take their padding from style.css (it changes with the compact layout), not the frame's inline default. */
export const CSS_PADDING = { padding: undefined };
