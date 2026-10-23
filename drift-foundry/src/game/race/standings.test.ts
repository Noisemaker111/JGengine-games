import { describe, expect, test } from "bun:test";

import { EXIT_Z } from "../run/constants";
import { createStandings, PLAYER_RACER_ID } from "./standings";

const NAMES = { [PLAYER_RACER_ID]: "YOU", rival_a: "A", rival_b: "B", rival_c: "C" } as const;

/** Walk every racer's z through the corridor so each checkpoint volume is actually entered. */
function driveTo(standings: ReturnType<typeof createStandings>, zs: Record<string, number>, from: number, to: number): void {
  for (let z = from; z <= to; z += 1) {
    const positions: Record<string, readonly [number, number, number]> = {};
    for (const [id, target] of Object.entries(zs)) positions[id] = [0, 0, Math.min(target, z)];
    standings.update(Math.max(0, z - from), positions);
  }
}

describe("drift-foundry standings", () => {
  test("the player starts last on the grid and takes the lead when it drives past", () => {
    const standings = createStandings(NAMES);
    standings.update(0, {
      [PLAYER_RACER_ID]: [0, 0, 4],
      rival_a: [0, 0, 12],
      rival_b: [0, 0, 17],
      rival_c: [0, 0, 24],
    });
    expect(standings.placeOf(PLAYER_RACER_ID)).toBe(4);

    standings.update(1, {
      [PLAYER_RACER_ID]: [0, 0, 100],
      rival_a: [0, 0, 12],
      rival_b: [0, 0, 17],
      rival_c: [0, 0, 24],
    });
    expect(standings.placeOf(PLAYER_RACER_ID)).toBe(1);
    expect(standings.snapshot().total).toBe(4);
    expect(standings.snapshot().lap).toBe(1);
    expect(standings.snapshot().laps).toBe(1);
  });

  test("crossing the arch closes the lap, finishes the racer, and freezes their place", () => {
    const standings = createStandings(NAMES);
    driveTo(standings, { [PLAYER_RACER_ID]: 0, rival_a: 470, rival_b: 470, rival_c: 470 }, 0, 4);
    // The rivals are parked at the arch but have not walked the checkpoint ring, so only the player runs.
    driveTo(standings, { [PLAYER_RACER_ID]: EXIT_Z + 4, rival_a: 0, rival_b: 0, rival_c: 0 }, 4, EXIT_Z + 4);
    expect(standings.finishedOf(PLAYER_RACER_ID)).toBe(true);
    expect(standings.placeOf(PLAYER_RACER_ID)).toBe(1);
    const snapshot = standings.snapshot();
    expect(snapshot.standings.find((entry) => entry.id === PLAYER_RACER_ID)?.name).toBe("YOU");
    expect(snapshot.standings.find((entry) => entry.id === PLAYER_RACER_ID)?.finished).toBe(true);
  });

  test("reset puts the field back on the grid", () => {
    const standings = createStandings(NAMES);
    driveTo(standings, { [PLAYER_RACER_ID]: EXIT_Z + 4, rival_a: 0, rival_b: 0, rival_c: 0 }, 0, EXIT_Z + 4);
    expect(standings.finishedOf(PLAYER_RACER_ID)).toBe(true);
    standings.reset();
    expect(standings.finishedOf(PLAYER_RACER_ID)).toBe(false);
    expect(standings.snapshot().finished).toBe(false);
  });
});
