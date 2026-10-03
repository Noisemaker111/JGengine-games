import { getGridCell, gridCellToWorld, type EditorDocument, type EditorGridLayer } from "@jgengine/core/editor/index";
import { buildResonantCrossingEditorLayers } from "../../editorLayers";
import type { Dir, HeroId, V2 } from "../types";

export interface Plate {
  readonly id: string;
  readonly cell: V2;
}

export interface Receiver {
  readonly id: string;
  readonly cell: V2;
}

export interface Gate {
  readonly id: string;
  readonly cells: readonly V2[];
  readonly plates: readonly string[];
  readonly receivers: readonly string[];
  readonly relays?: readonly string[];
}

export interface SpikeGroup {
  readonly id: string;
  readonly cells: readonly V2[];
  readonly retractedBy: string | null;
  readonly retractedByRelay?: string;
}

export interface Relay {
  readonly id: string;
  readonly label: string;
  readonly plates: readonly string[];
  readonly receivers: readonly string[];
  readonly requires: readonly string[];
}

export type SolutionOp =
  | { kind: "move"; hero: HeroId; target: string; offset?: V2 }
  | { kind: "prism"; dir: Dir }
  | { kind: "anchor" };

export interface RoomDef {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly floor: readonly V2[];
  readonly walls: readonly V2[];
  readonly spawn: Record<HeroId, V2>;
  readonly exit: Record<HeroId, V2>;
  readonly plates: readonly Plate[];
  readonly receivers: readonly Receiver[];
  readonly gates: readonly Gate[];
  readonly spikes: readonly SpikeGroup[];
  readonly emitters: readonly V2[];
  readonly relays?: readonly Relay[];
  readonly roleHints?: Record<HeroId, string>;
  readonly hint?: string;
  readonly style?: string;
  readonly solution?: readonly SolutionOp[];
}

interface RoomMetadata {
  objective: string;
  style?: string;
  roleHints?: Record<HeroId, string>;
  hint?: string;
  relays?: Relay[];
  solution?: SolutionOp[];
  links?: {
    gates?: Record<string, { plates?: string[]; receivers?: string[]; relays?: string[] }>;
    spikes?: Record<string, { retractedBy?: string; retractedByRelay?: string }>;
  };
}

const PLATE_GLYPHS = "123456789";
const RECEIVER_GLYPHS = "rstuvw";
const GATE_GLYPHS = "GHIJK";
const SPIKE_GLYPHS = "XYZ";

export function parseRoom(layer: EditorGridLayer): RoomDef {
  const id = layer.id.replace(/^room_/, "");
  const meta = layer.meta as unknown as RoomMetadata;
  if (!meta || typeof meta.objective !== "string") throw new Error(`room ${id}: missing authored objective`);
  if (layer.cellSize !== 1 || (layer.axes !== undefined && layer.axes !== "xz") ||
      !Number.isInteger(layer.origin.x) || !Number.isInteger(layer.origin.z))
    throw new Error(`room ${id}: requires unit XZ cells and an integer origin`);
  const width = layer.cols;
  const height = layer.rows;

  const floor: V2[] = [];
  const walls: V2[] = [];
  const emitters: V2[] = [];
  const spawn: Partial<Record<HeroId, V2>> = {};
  const exit: Partial<Record<HeroId, V2>> = {};
  const plates: Plate[] = [];
  const receivers: Receiver[] = [];
  const gateCells = new Map<string, V2[]>();
  const spikeCells = new Map<string, V2[]>();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const raw = getGridCell(layer, col, row);
      const glyph = raw === "" ? "#" : raw;
      const position = gridCellToWorld(layer, col, row);
      const cell: V2 = { x: position.x, z: position.z };
      if (glyph === "#" || glyph === " ") {
        walls.push(cell);
        continue;
      }
      // everything non-wall is walkable floor
      floor.push(cell);
      if (glyph === ".") continue;
      if (glyph === "L" || glyph === "A") {
        const hero = glyph === "L" ? "lumen" : "anchor";
        if (spawn[hero]) throw new Error(`room ${id}: duplicate ${hero} spawn`);
        spawn[hero] = cell;
      } else if (glyph === "o" || glyph === "0") {
        const hero = glyph === "o" ? "lumen" : "anchor";
        if (exit[hero]) throw new Error(`room ${id}: duplicate ${hero} exit`);
        exit[hero] = cell;
      }
      else if (glyph === "E") emitters.push(cell);
      else if (PLATE_GLYPHS.includes(glyph)) {
        if (plates.some(plate => plate.id === `p${glyph}`)) throw new Error(`room ${id}: duplicate plate p${glyph}`);
        plates.push({ id: `p${glyph}`, cell });
      }
      else if (RECEIVER_GLYPHS.includes(glyph)) {
        if (receivers.some(receiver => receiver.id === `r_${glyph}`)) throw new Error(`room ${id}: duplicate receiver r_${glyph}`);
        receivers.push({ id: `r_${glyph}`, cell });
      }
      else if (GATE_GLYPHS.includes(glyph)) push(gateCells, glyph, cell);
      else if (SPIKE_GLYPHS.includes(glyph)) push(spikeCells, glyph, cell);
      else throw new Error(`room ${id}: unknown glyph "${glyph}"`);
    }
  }

  const gates: Gate[] = [...gateCells.entries()].map(([glyph, cells]) => ({
    id: `g_${glyph}`,
    cells,
    plates: meta.links?.gates?.[glyph]?.plates ?? [],
    receivers: meta.links?.gates?.[glyph]?.receivers ?? [],
    relays: meta.links?.gates?.[glyph]?.relays ?? [],
  }));
  const spikes: SpikeGroup[] = [...spikeCells.entries()].map(([glyph, cells]) => ({
    id: `s_${glyph}`,
    cells,
    retractedBy: meta.links?.spikes?.[glyph]?.retractedBy ?? null,
    retractedByRelay: meta.links?.spikes?.[glyph]?.retractedByRelay,
  }));

  if (spawn.lumen === undefined || spawn.anchor === undefined)
    throw new Error(`room ${id}: missing a hero spawn (L/A)`);
  if (exit.lumen === undefined || exit.anchor === undefined)
    throw new Error(`room ${id}: missing an exit pad (o/0)`);

  const relayIds = new Set<string>();
  const plateIds = new Set(plates.map(plate => plate.id));
  const receiverIds = new Set(receivers.map(receiver => receiver.id));
  const references = (owner: string, values: readonly string[] | undefined, available: Set<string>) => {
    if (values === undefined) return;
    if (!Array.isArray(values) || values.some(value => typeof value !== "string" || !available.has(value)))
      throw new Error(`room ${id}: ${owner} references an unknown signal or invalid list`);
  };
  if (meta.relays !== undefined && !Array.isArray(meta.relays)) throw new Error(`room ${id}: invalid relays`);
  for (const relay of meta.relays ?? []) {
    if (!relay || typeof relay.id !== "string" || typeof relay.label !== "string" || relayIds.has(relay.id))
      throw new Error(`room ${id}: invalid or duplicate relay`);
    if (!Array.isArray(relay.plates) || !Array.isArray(relay.receivers) || !Array.isArray(relay.requires) || relay.plates.length + relay.receivers.length === 0)
      throw new Error(`room ${id}: relay ${relay.id} requires live inputs`);
    references(relay.id, relay.plates, plateIds);
    references(relay.id, relay.receivers, receiverIds);
    references(relay.id, relay.requires, relayIds);
    relayIds.add(relay.id);
  }
  for (const gate of gates) {
    references(gate.id, gate.plates, plateIds);
    references(gate.id, gate.receivers, receiverIds);
    references(gate.id, gate.relays, relayIds);
    if (gate.plates.length + gate.receivers.length + (gate.relays?.length ?? 0) === 0)
      throw new Error(`room ${id}: gate ${gate.id} has no requirements`);
  }
  for (const spike of spikes) {
    if (spike.retractedBy !== null) references(spike.id, [spike.retractedBy], new Set([...plateIds, ...receiverIds]));
    if (spike.retractedByRelay !== undefined) references(spike.id, [spike.retractedByRelay], relayIds);
  }

  return {
    id,
    name: layer.label ?? id,
    objective: meta.objective,
    floor,
    walls,
    spawn: { lumen: spawn.lumen, anchor: spawn.anchor },
    exit: { lumen: exit.lumen, anchor: exit.anchor },
    plates,
    receivers,
    gates,
    spikes,
    emitters,
    relays: meta.relays,
    roleHints: meta.roleHints,
    hint: meta.hint,
    style: meta.style,
    solution: meta.solution,
  };
}

function push(map: Map<string, V2[]>, key: string, cell: V2): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [cell]);
  else list.push(cell);
}

export function roomsFromDocument(document: EditorDocument): RoomDef[] {
  return (document.grids ?? []).filter(layer => layer.kind === "room").map(parseRoom);
}

let authoredDocument = buildResonantCrossingEditorLayers();

export function getAuthoredDocument(): EditorDocument { return authoredDocument; }
export const ROOM_GRIDS: readonly EditorGridLayer[] = authoredDocument.grids ?? [];
export const ROOMS: RoomDef[] = roomsFromDocument(authoredDocument);
export const ROOM_COUNT = ROOMS.length;

export function refreshRoomsFromDocument(document: EditorDocument): void {
  const next = roomsFromDocument(document);
  if (next.length === 0) throw new Error("Authored campaign contains no rooms");
  ROOMS.splice(0, ROOMS.length, ...next);
  authoredDocument = document;
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export function roomBounds(room: RoomDef): RoomBounds {
  const cells = [...room.floor, ...room.walls];
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX + 1,
    depth: maxZ - minZ + 1,
  };
}
