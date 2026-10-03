import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";

import { editorLayers } from "./editorLayers";
import { createCoursePlayable } from "./game.config";
import { createCourseCreator } from "./game/creator";
import { courseTheme } from "./game/ui/theme";
import "./index.css";

const loadEditor = () => import("@jgengine/editor");

function CourseApp() {
  const [creatorOpen, setCreatorOpen] = useState(false);
  const creator = useMemo(() => createCourseCreator(localStorage), []);
  const playable = useMemo(() => createCoursePlayable(editorLayers, { onCreate: () => setCreatorOpen(true) }), []);
  return <div className="course-app" style={courseTheme}><GameHost playable={playable} gameId="cloud-course" editor={loadEditor} creator={creator} creatorOpen={creatorOpen} onCreatorOpenChange={setCreatorOpen} /></div>;
}

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<CourseApp />);
