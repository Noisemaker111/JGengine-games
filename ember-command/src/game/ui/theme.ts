import { hudTheme } from "@jgengine/react/hudTheme";

/** Ember Command's forged-teal and brass field-desk palette; the shell applies it at the HUD root. */
export const emberTheme = hudTheme({
  palette: { accent: "#efc878", accentDeep: "#b88947", accentGlow: "#ecc98555", accentDim: "#efc87822" },
  surface: { surface: "#1c2b2cf2", surfaceDeep: "#121e21", edge: "#bca16d88", edgeBright: "#ffda83", text: "#f3e6c7", textDim: "#c3d3cf", backdrop: "#07161de8" },
  status: { warning: "#e9c57e", danger: "#ff7a5c", success: "#5cd66a", hostile: "#ff7a5c", friendly: "#7db4ff" },
  font: { display: 'Georgia, "Times New Roman", serif', body: 'Georgia, "Times New Roman", serif', numeric: 'Georgia, "Times New Roman", serif' },
  frame: { bg: "linear-gradient(145deg, #303b39f5, #121e21f5)", border: "1px solid #bca16d88", radius: "6px", glow: "inset 0 2px #ecd49f33, inset 0 -3px #080f13aa, 0 8px 25px #0008" },
});
