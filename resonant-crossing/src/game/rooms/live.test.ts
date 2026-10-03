import { describe, expect, test } from "bun:test";
import { createDocumentLiveSync, createEditorSession, installDocumentLiveSync } from "@jgengine/core/editor/index";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { buildResonantCrossingEditorLayers } from "../../editorLayers";
import { game } from "../../game.config";
import { duetStore } from "../stores";
import { ROOMS, refreshRoomsFromDocument } from "./catalog";
import { syncAuthoredRooms } from "./live";

describe("authored editor revisions in a running expedition", () => {
  test("edit, undo and redo rebuild the room from the same document without resuming a pause", () => {
    const original = buildResonantCrossingEditorLayers();
    const session = createEditorSession(original);
    const sync = createDocumentLiveSync(original);
    const uninstall = installDocumentLiveSync(sync);
    const unsubscribe = session.subscribe(() => sync.replaceDocument(session.getState().document));
    const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "author", isNew: true } });
    try {
      game.loop.onInit(ctx);
      game.loop.onNewPlayer(ctx);
      ctx.game.commands.run("duet.start", {});
      ctx.game.commands.run("pause", {});
      syncAuthoredRooms(ctx);
      const grid = original.grids![0]!;
      const wall = ROOMS[0]!.walls[0]!;
      const col = wall.x - grid.origin.x, row = wall.z - grid.origin.z;
      session.dispatch({ type: "paintGridCells", id: grid.id, cells: [{ col, row, value: "." }] });
      syncAuthoredRooms(ctx);
      expect(ROOMS[0]!.floor).toContainEqual(wall);
      expect(ctx.scene.object.get("wall:0")?.position).not.toEqual([wall.x, 0, wall.z]);
      expect(duetStore.read(ctx).status).toBe("paused");
      session.dispatch({ type: "undo" });
      syncAuthoredRooms(ctx);
      expect(ROOMS[0]!.walls).toContainEqual(wall);
      session.dispatch({ type: "redo" });
      syncAuthoredRooms(ctx);
      expect(ROOMS[0]!.floor).toContainEqual(wall);
    } finally {
      unsubscribe(); uninstall(); refreshRoomsFromDocument(original);
    }
  });

  test("an invalid authored campaign keeps the previous room and explains the rejected edit", () => {
    const original = buildResonantCrossingEditorLayers();
    const sync = createDocumentLiveSync(original);
    const uninstall = installDocumentLiveSync(sync);
    const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "author", isNew: true } });
    try {
      game.loop.onInit(ctx);
      game.loop.onNewPlayer(ctx);
      const before = ROOMS[0];
      sync.replaceDocument({ ...original, grids: original.grids!.slice(1) });
      syncAuthoredRooms(ctx);
      expect(ROOMS[0]).toBe(before);
      expect(duetStore.read(ctx).toast).toContain("Scene edit rejected");
      expect(duetStore.read(ctx).status).toBe("ready");
    } finally { uninstall(); refreshRoomsFromDocument(original); }
  });
});
