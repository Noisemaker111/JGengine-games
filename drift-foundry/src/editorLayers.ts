import { normalizeEditorLayers, type EditorDocument, type EditorLayersInput } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
