import { describe, expect, test } from "bun:test";

import { ROOMS } from "./catalog";
import { deriveRoomState, type HeroCells, type Latch } from "./engine";
import type { RoomDef } from "./catalog";
import { withAnchor, withPrism } from "../stores";

const room1 = ROOMS[0]!; // hold-the-line: gate G needs plate p1
const room2 = ROOMS[1]!; // first-light: gate H needs receiver r_r

const EMPTY: Latch = { anchorCell: null, prism: null };

function heroesAt(lumen: HeroCells["lumen"], anchor: HeroCells["anchor"]): HeroCells {
  return { lumen, anchor };
}

describe("deriveRoomState — plates and gates", () => {
  const off = heroesAt({ x: -3, z: 0 }, { x: -3, z: 0 });

  test("weight gate stays shut with no plate held", () => {
    const state = deriveRoomState(room1, EMPTY, off);
    expect(state.openGates).toHaveLength(0);
    expect(state.pressedPlates).toHaveLength(0);
  });

  test("a latched weight opens the gate it wires to", () => {
    const plate = room1.plates[0]!;
    const state = deriveRoomState(room1, { anchorCell: plate.cell, prism: null }, off);
    expect(state.pressedPlates).toContain(plate.id);
    expect(state.openGates).toContain(room1.gates[0]!.id);
  });

  test("standing a hero on the plate presses it too", () => {
    const plate = room1.plates[0]!;
    const state = deriveRoomState(room1, EMPTY, heroesAt(plate.cell, { x: -3, z: 0 }));
    expect(state.pressedPlates).toContain(plate.id);
  });
});

describe("deriveRoomState — beams and receivers", () => {
  test("an east-facing prism powers the receiver in its line and opens the light gate", () => {
    const receiver = room2.receivers[0]!;
    const state = deriveRoomState(
      room2,
      { anchorCell: null, prism: { cell: { x: -3, z: -1 }, dir: "east" } },
      heroesAt({ x: -3, z: -1 }, { x: -3, z: 1 }),
    );
    expect(state.poweredReceivers).toContain(receiver.id);
    expect(state.openGates).toContain(room2.gates[0]!.id);
    expect(state.beamPath.length).toBeGreaterThan(0);
  });

  test("a prism facing away from the receiver powers nothing", () => {
    const state = deriveRoomState(
      room2,
      { anchorCell: null, prism: { cell: { x: -3, z: -1 }, dir: "west" } },
      heroesAt({ x: -3, z: -1 }, { x: -3, z: 1 }),
    );
    expect(state.poweredReceivers).toHaveLength(0);
    expect(state.openGates).toHaveLength(0);
  });
});

describe("deriveRoomState — solved", () => {
  test("solved only when both heroes sit on their own exit pads", () => {
    const half = deriveRoomState(room1, EMPTY, heroesAt(room1.exit.lumen, { x: 0, z: 0 }));
    expect(half.solved).toBe(false);
    const full = deriveRoomState(room1, EMPTY, heroesAt(room1.exit.lumen, room1.exit.anchor));
    expect(full.solved).toBe(true);
  });
});

describe("staged cooperative relays", () => {
  const plate = room1.plates[0]!;
  const receiver = room2.receivers[0]!;
  const room: RoomDef = { ...room2, plates: [plate],
    relays: [
      { id: "relay1", label: "First transfer", plates: [plate.id], receivers: [receiver.id], requires: [] },
      { id: "relay2", label: "Final transfer", plates: [plate.id], receivers: [receiver.id], requires: ["relay1"] },
    ],
    gates: [{ ...room2.gates[0]!, plates: [plate.id], receivers: [receiver.id], relays: ["relay2"] }],
  };
  const heroes = room.spawn;
  const both: Latch = { anchorCell: plate.cell, prism: { cell: room.spawn.lumen, dir: "east" } };

  test("a relay needs simultaneous light and weight, then remembers the crossing", () => {
    expect(deriveRoomState(room, { ...both, prism: null }, heroes).completedRelays).toEqual([]);
    expect(deriveRoomState(room, { ...both, anchorCell: null }, heroes).completedRelays).toEqual([]);
    const first = deriveRoomState(room, both, heroes);
    expect(first.completedRelays).toEqual(["relay1"]);
    expect(first.readyRelay).toBe("relay1");
    expect(first.openGates).toEqual([]);
    const remembered = deriveRoomState(room, { ...EMPTY, completedRelays: first.completedRelays }, heroes);
    expect(remembered.completedRelays).toEqual(["relay1"]);
    expect(remembered.nextRelay).toBe("relay2");
  });

  test("one evaluation cannot skip stages; a later stage rejects missing prerequisites", () => {
    const first = deriveRoomState(room, both, heroes);
    const second = deriveRoomState(room, { ...both, completedRelays: first.completedRelays }, heroes);
    expect(second.completedRelays).toEqual(["relay1", "relay2"]);
    expect(second.openGates).toContain(room.gates[0]!.id);
    const onlyLater = { ...room, relays: [room.relays![1]!] };
    expect(deriveRoomState(onlyLater, both, heroes).completedRelays).toEqual([]);
  });

  test("relocating either device shuts live final gates without erasing secured stages", () => {
    const complete = { ...both, completedRelays: ["relay1", "relay2"] };
    for (const moved of [withPrism(complete, { cell: room.spawn.lumen, dir: "west" }), withAnchor(complete, room.spawn.anchor)]) {
      const state = deriveRoomState(room, moved, heroes);
      expect(state.completedRelays).toEqual(["relay1", "relay2"]);
      expect(state.openGates).toEqual([]);
    }
  });

  test("both exit poses cannot bypass unfinished relays; unrelated relay ids do not leak rooms", () => {
    expect(deriveRoomState(room, EMPTY, room.exit).solved).toBe(false);
    const state = deriveRoomState(room, { ...EMPTY, completedRelays: ["relay1", "relay2", "foreign"] }, room.exit);
    expect(state.solved).toBe(true);
    expect(state.completedRelays).toEqual(["relay1", "relay2"]);
  });
});
