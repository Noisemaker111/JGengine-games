import { decodeEditorDocument, type EditorDocument } from "@jgengine/core/editor/index";
import scene from "./editor.scene.json";

export function buildResonantCrossingEditorLayers(): EditorDocument {
  const result = decodeEditorDocument(structuredClone(scene));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
}

export const editorLayers = buildResonantCrossingEditorLayers;
