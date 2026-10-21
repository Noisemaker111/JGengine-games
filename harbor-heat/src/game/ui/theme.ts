import { hudTheme } from "@jgengine/react/hudTheme";

/** Mainsail dispatch: deep harbor teal panels, cream type, sunset-gold actions, coral alarms. */
export const harborTheme = hudTheme({
  palette: { accent: "#ffc879", accentDeep: "#ad7140", accentGlow: "#ffc87966", accentDim: "#ffc87922", health: "#3fbf5a", shield: "#4fa5e8", xp: "#e8a5ff" },
  surface: { surface: "#102e3be8", surfaceDeep: "#08232d", edge: "#76d4c355", edgeBright: "#76d4c3", text: "#fff0d2", textDim: "#b9cbd0", backdrop: "#08232dc9" },
  status: { danger: "#f88b6b", warning: "#ffb020", success: "#3fbf5a", hostile: "#c23b3b", friendly: "#76d4c3", neutral: "#ffc879" },
  font: { display: "system-ui, sans-serif", body: "system-ui, sans-serif", numeric: "system-ui, sans-serif" },
  frame: { bg: "#102e3b", border: "1px solid #76d4c377", radius: "8px", glow: "0 20px 80px #0008" },
  slot: { bg: "#194451", border: "1px solid #76d4c355", radius: "5px" },
});

/** The hotbar's chunky black-bordered street cards. */
export const hotbarTheme = hudTheme({
  palette: { health: "#e0524a", stamina: "#77c043", xp: "#5ac0e0", accent: "#f0c040", shield: "#5ac0e0" },
  frame: { bg: "linear-gradient(180deg, #5a5a5a, #3a3a3a)", border: "3px solid #2a2a2a", radius: "2px", glow: "3px 3px 0 rgba(0,0,0,0.5)" },
  bar: { frame: "#1e1e1e", radius: "0px", height: "18px", track: "rgba(0,0,0,0.6)", bevel: "inset 0 2px 3px rgba(0,0,0,0.6)", text: "#f4f4f4" },
  slot: { bg: "#4a4a4a", border: "3px solid #2a2a2a", radius: "0px" },
  ring: "rgba(240,192,64,0.5)",
});
