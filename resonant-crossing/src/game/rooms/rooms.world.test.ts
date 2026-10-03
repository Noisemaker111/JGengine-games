import { describe, expect, test } from "bun:test";
import { createEditorHost } from "@jgengine/editor/session";
import { decodeEditorDocument } from "@jgengine/core/editor/index";
import { buildResonantCrossingEditorLayers } from "../../editorLayers";
import { cellKey, type HeroId, type V2 } from "../types";
import { ROOMS, ROOM_COUNT, roomsFromDocument, type RoomDef } from "./catalog";
import { activeSpikeCells, deriveRoomState, isWalkable, type HeroCells, type Latch } from "./engine";

function targetCell(room: RoomDef, target: string): V2 {
  const [kind, id] = target.split(":");
  const cell = kind === "exit" ? room.exit[id as HeroId]
    : kind === "plate" ? room.plates.find(p => p.id === id)?.cell
    : room.receivers.find(r => r.id === id)?.cell;
  if (!cell) throw new Error(`Missing authored solution target ${target}`);
  return cell;
}

function route(room: RoomDef, latch: Latch, heroes: HeroCells, hero: HeroId, target: V2): V2[] {
  const state = deriveRoomState(room, latch, heroes);
  const spikes = activeSpikeCells(room, state);
  const queue: V2[][] = [[heroes[hero]]];
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!;
    const cell = path.at(-1)!;
    if (cellKey(cell) === cellKey(target)) return path.slice(1);
    for (const delta of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
      const next = { x: cell.x + delta.x, z: cell.z + delta.z };
      const key = cellKey(next);
      if (visited.has(key) || !isWalkable(room, state, next) || spikes.has(key)) continue;
      visited.add(key);
      queue.push([...path, next]);
    }
  }
  throw new Error(`${room.id}: ${hero} cannot reach ${cellKey(target)}`);
}

describe("authored campaign", () => {
  test("four rooms retain their public ids and two distinct deeper topologies", () => {
    expect(ROOM_COUNT).toBe(4);
    expect(ROOMS.map(r => r.id)).toEqual(["hold-the-line", "first-light", "interlock", "crosswire"]);
    expect(ROOMS[2]!.style).toBe("corridor-circuit");
    expect(ROOMS[3]!.style).toBe("branching-courtyard");
    expect(ROOMS[3]!.floor.length).toBeGreaterThan(ROOMS[2]!.floor.length);
    expect(ROOMS[2]!.relays?.length).toBe(2);
    expect(ROOMS[3]!.relays?.length).toBe(3);
  });

  for (const [roomId, index, col, row] of [["interlock", 2, 5, 3], ["crosswire", 3, 7, 3]] as const) test(`${roomId}: an editor paint persists, roundtrips, and changes runtime placement`, () => {
    const host = createEditorHost({ gameId: "resonant-crossing", layers: buildResonantCrossingEditorLayers() });
    try {
      const response = host.api.handle({ method: "paint_grid_cells", id: `room_${roomId}`, cells: [{ col, row, value: "#" }] });
      expect(response.ok).toBe(true);
      const exported = host.api.handle({ method: "export_document" });
      if (!exported.ok) throw new Error(exported.error);
      const decoded = decodeEditorDocument(JSON.parse((exported.result as { json: string }).json));
      if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
      const painted = roomsFromDocument(decoded.document).find(r => r.id === roomId)!;
      expect(painted.floor.length).toBe(ROOMS[index]!.floor.length - 1);
      expect(host.api.handle({ method: "undo" }).ok).toBe(true);
      expect(roomsFromDocument(host.session.getState().document)[index]!.floor.length).toBe(ROOMS[index]!.floor.length);
      expect(host.api.handle({ method: "redo" }).ok).toBe(true);
      expect(roomsFromDocument(host.session.getState().document)[index]!.floor.length).toBe(painted.floor.length);
    } finally { host.dispose(); }
  });

  test("bad authored placement and circuit wiring report room diagnostics", () => {
    const invalid = (change: (document: ReturnType<typeof buildResonantCrossingEditorLayers>) => void, message: string) => {
      const document = buildResonantCrossingEditorLayers();
      change(document);
      expect(() => roomsFromDocument(document)).toThrow(message);
    };
    invalid(document => { document.grids![2]!.cellSize = 2; }, "unit XZ cells");
    invalid(document => { document.grids![2]!.cells["4,3"] = "L"; }, "duplicate lumen spawn");
    invalid(document => { document.grids![2]!.cells["1,1"] = "."; }, "missing a hero spawn");
    invalid(document => { document.grids![2]!.meta!.links = { gates: { G: { plates: ["p9"] }, H: { plates: ["p2"] } } }; }, "unknown signal");
    invalid(document => { (document.grids![2]!.meta!.relays as { requires: string[] }[])[0]!.requires = ["relay2"]; }, "unknown signal");
  });

  for (const room of ROOMS.filter(room => (room.relays?.length ?? 0) > 0)) {
    test(`${room.id}: each later relay requires a new prism line`, () => {
      const aimMoves = room.solution!.filter(op => op.kind === "move" && op.target.startsWith("receiver:"));
      const prismOps = room.solution!.filter(op => op.kind === "prism");
      for (let stage = 1; stage < room.relays!.length; stage++) {
        const previousMove = aimMoves[stage - 1]!;
        const previousPrism = prismOps[stage - 1]!;
        if (previousMove.kind !== "move" || previousPrism.kind !== "prism") throw new Error("Invalid authored aim plan");
        const signal = targetCell(room, previousMove.target);
        const prismCell = { x: signal.x + previousMove.offset!.x, z: signal.z + previousMove.offset!.z };
        const relay = room.relays![stage]!;
        const plate = room.plates.find(plate => plate.id === relay.plates[0])!.cell;
        const completed = room.relays!.slice(0, stage).map(relay => relay.id);
        const state = deriveRoomState(room, { prism: { cell: prismCell, dir: previousPrism.dir }, anchorCell: plate, completedRelays: completed },
          { lumen: prismCell, anchor: plate });
        for (const receiver of relay.receivers) expect(state.poweredReceivers).not.toContain(receiver);
        expect(state.completedRelays).toEqual(completed);
        if (room.id === "crosswire" && stage === 1) expect(state.activeSpikes).toContain("s_X");
      }
    });
  }

  for (const room of ROOMS) {
    test(`${room.id}: authored references are complete`, () => {
      const floor = new Set(room.floor.map(cellKey));
      for (const hero of ["lumen", "anchor"] as const) {
        expect(floor.has(cellKey(room.spawn[hero]))).toBe(true);
        expect(floor.has(cellKey(room.exit[hero]))).toBe(true);
      }
      const plateIds = new Set(room.plates.map(p => p.id));
      const receiverIds = new Set(room.receivers.map(r => r.id));
      const relayIds = new Set(room.relays?.map(r => r.id));
      for (const requirement of [...room.gates, ...(room.relays ?? [])]) {
        expect(requirement.plates.length + requirement.receivers.length + ("relays" in requirement ? requirement.relays?.length ?? 0 : 0)).toBeGreaterThan(0);
        for (const id of requirement.plates) expect(plateIds.has(id)).toBe(true);
        for (const id of requirement.receivers) expect(receiverIds.has(id)).toBe(true);
        for (const id of "relays" in requirement ? requirement.relays ?? [] : requirement.requires) expect(relayIds.has(id)).toBe(true);
      }
      for (const spike of room.spikes) {
        if (spike.retractedBy) expect(plateIds.has(spike.retractedBy) || receiverIds.has(spike.retractedBy)).toBe(true);
        if (spike.retractedByRelay) expect(relayIds.has(spike.retractedByRelay)).toBe(true);
      }
    });

    test(`${room.id}: authored communication plan completes all stages`, () => {
      const heroes: HeroCells = { lumen: { ...room.spawn.lumen }, anchor: { ...room.spawn.anchor } };
      let latch: Latch = { anchorCell: null, prism: null, completedRelays: [] };
      const retain = () => {
        const state = deriveRoomState(room, latch, heroes);
        latch = { ...latch, completedRelays: state.completedRelays };
        return state;
      };
      expect(room.solution?.length).toBeGreaterThan(0);
      let prismStage = 0;
      for (const op of room.solution!) {
        if (op.kind === "prism") latch = { ...latch, prism: { cell: { ...heroes.lumen }, dir: op.dir } };
        else if (op.kind === "anchor") latch = { ...latch, anchorCell: { ...heroes.anchor } };
        else {
          const point = targetCell(room, op.target);
          const target = { x: point.x + (op.offset?.x ?? 0), z: point.z + (op.offset?.z ?? 0) };
          for (const next of route(room, latch, heroes, op.hero, target)) {
            const state = retain();
            expect(isWalkable(room, state, next)).toBe(true);
            expect(activeSpikeCells(room, state).has(cellKey(next))).toBe(false);
            heroes[op.hero] = next;
            retain();
          }
        }
        const state = retain();
        if (op.kind === "prism" && room.relays?.length) {
          expect(state.poweredReceivers).toEqual(room.relays[prismStage++]!.receivers);
        }
      }
      expect(retain().solved).toBe(true);
      expect(latch.completedRelays).toHaveLength(room.relays?.length ?? 0);
    });
  }
});
