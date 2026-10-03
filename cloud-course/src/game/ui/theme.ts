import { hudTheme, hudThemeVars } from "@jgengine/react/hudTheme";

export const courseTheme = hudThemeVars(hudTheme({
  palette: { accent: "#17b9c9", accentDeep: "#087985", accentGlow: "#17b9c950" },
  surface: { surface: "#fff8df", surfaceDeep: "#ebdcac", edge: "#252647", edgeBright: "#353962", text: "#252647", textDim: "#5e5c75", backdrop: "#252647b0" },
  font: { display: "Arial Black, system-ui, sans-serif", body: "system-ui, sans-serif", numeric: "ui-monospace, monospace" },
  frame: { bg: "#fff8df", border: "3px solid #252647", radius: "10px", glow: "5px 5px 0 #252647" },
}));
