import { getDocumentLiveSync, type DocumentLiveSync, type EditorDocument } from "@jgengine/core/editor/index";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { loadCurrentRoom } from "../runtime";
import { duetStore, raiseToast } from "../stores";
import { ROOMS, refreshRoomsFromDocument, roomsFromDocument } from "./catalog";

const observed = perContext<{ bus: DocumentLiveSync | null; revision: number }>(() => ({ bus: null, revision: -1 }));
const campaignIds = ROOMS.map(room => room.id);

export function validateLiveCampaign(document: EditorDocument): void {
  const rooms = roomsFromDocument(document);
  if (rooms.length !== campaignIds.length || rooms.some((room, index) => room.id !== campaignIds[index])) {
    throw new Error("Keep campaign room ids and order when editing a running expedition.");
  }
}

/** Rebuild the current chamber once per authored revision, including editor undo and redo. */
export function syncAuthoredRooms(ctx: GameContext): void {
  const bus = getDocumentLiveSync();
  if (bus === null) return;
  const seen = observed(ctx);
  const revision = bus.getRevision();
  if (seen.bus === bus && seen.revision === revision) return;
  seen.bus = bus;
  seen.revision = revision;
  try {
    const document = bus.getDocument();
    validateLiveCampaign(document);
    refreshRoomsFromDocument(document);
    const status = duetStore.read(ctx).status;
    loadCurrentRoom(ctx);
    if (status === "ready" || status === "paused" || status === "complete") {
      duetStore.update(ctx, state => ({ ...state, status }));
      setGamePhase(ctx, status === "ready" ? "menu" : status === "paused" ? "paused" : "ended");
    }
    raiseToast(ctx, "Authored scene updated. Chamber restarted with the new circuit.");
  } catch (error) {
    raiseToast(ctx, `Scene edit rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
}
