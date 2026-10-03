import "./index.css";

import { createRoot } from "react-dom/client";

import { GameHost } from "@jgengine/shell/GameHost";

import { lanternThemeStyle } from "./game/ui/theme";

import { game } from "./game.config";

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(
  <div className="lantern-game" style={lanternThemeStyle}><GameHost playable={game} gameId="lantern-reach" editor={() => import("@jgengine/editor")} /></div>,
);
