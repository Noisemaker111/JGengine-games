import { describe, expect, test } from "bun:test";

import { EXIT_Z } from "../run/constants";
import { ROUTE_GATES } from "../route/gates";
import { createOpponentField, lineOffsetAt, RIVAL_DEFS, rivalLine } from "./opponents";

const DT = 1 / 60;
const PLAYER_PARKED: readonly [number, number, number] = [0, 0, 4];

function run(field: ReturnType<typeof createOpponentField>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) field.tick(DT, PLAYER_PARKED);
}

describe("drift-foundry rivals", () => {
  test("same seed produces the same race over 1200 ticks", () => {
    const first = createOpponentField({ seed: "grid-a" });
    const second = createOpponentField({ seed: "grid-a" });
    run(first, 1200);
    run(second, 1200);
    expect(first.positions()).toEqual(second.positions());
    // Sanity: the field actually moved a long way, so this is a race and not three parked karts.
    for (const body of first.bodies()) expect(body.position[2]).toBeGreaterThan(40);
  });

  test("a different seed drives a different race", () => {
    const first = createOpponentField({ seed: "grid-a" });
    const second = createOpponentField({ seed: "grid-b" });
    run(first, 600);
    run(second, 600);
    expect(first.positions()).not.toEqual(second.positions());
  });

  test("a rival knocked off its line rejoins the route", () => {
    const field = createOpponentField({ seed: "rejoin" });
    const def = RIVAL_DEFS[0]!;
    run(field, 90);
    const before = field.positions()[def.id]!;
    expect(field.knock(def.id, 6, 0)).toBe(true);
    const knocked = field.positions()[def.id]!;
    expect(Math.abs(knocked[0] - lineOffsetAt(def, knocked[2]))).toBeGreaterThan(5);
    run(field, 180);
    const after = field.positions()[def.id]!;
    expect(after[2]).toBeGreaterThan(before[2]);
    expect(Math.abs(after[0] - lineOffsetAt(def, after[2]))).toBeLessThan(1.5);
  });

  test("every rival opens all eight barricades and reaches the exit", () => {
    const field = createOpponentField({ seed: "full-race" });
    run(field, 120 * 60);
    for (const body of field.bodies()) expect(body.position[2]).toBeGreaterThan(EXIT_Z);
  });

  test("each line is authored against the same route, offset laterally", () => {
    for (const def of RIVAL_DEFS) {
      const line = rivalLine(def);
      expect(line).toHaveLength(ROUTE_GATES.length + 3);
      expect(line[0]![1]).toBeLessThan(ROUTE_GATES[0]!.atZ);
      expect(line[line.length - 2]![1]).toBe(EXIT_Z);
      expect(line[line.length - 1]![1]).toBeGreaterThan(EXIT_Z);
    }
  });
});
