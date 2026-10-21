import { hudTheme } from "@jgengine/react/hudTheme";

/** Row Six pit chrome: welded steel-blue plates, foundry gold, teal launch marks, plain condensed type. */
export const driftTheme = hudTheme({
  palette: { accent: "#edc565", accentDeep: "#b8913a", accentGlow: "#edc56555", accentDim: "#edc5651f" },
  surface: {
    surface: "#142329",
    surfaceDeep: "#101e24",
    edge: "#758d9650",
    edgeBright: "#758d96",
    text: "#eee0c4",
    textDim: "#b7c3c0",
    backdrop: "#101e24ef",
  },
  status: { danger: "#ff4934", warning: "#edc565", success: "#5de0ce", friendly: "#5de0ce" },
  font: { display: "Arial, Helvetica, sans-serif", body: "Arial, Helvetica, sans-serif", numeric: "Arial, Helvetica, sans-serif" },
  frame: { bg: "#142329dd", border: "1px solid #758d9650", radius: "3px", glow: "none" },
  slot: { bg: "#16282e", border: "1px solid #758d9670", radius: "3px" },
  state: { focusRing: "0 0 0 3px #5de0ce" },
});
