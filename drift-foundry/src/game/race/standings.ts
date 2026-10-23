import {
  createRaceState,
  firstPastPost,
  raceTrack,
  type Checkpoint,
  type RaceEvent,
  type RaceState,
} from "@jgengine/core/game/race";

import { ROUTE_GATES } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH, EXIT_Z } from "../run/constants";

/**
 * Live position, lap and finish for the four karts on the corridor. The ordering, splits, lap
 * bookkeeping and finish condition are `@jgengine/core/game/race`; this file only names the
 * corridor's checkpoint ring and keeps the player's place to hand to the HUD.
 */

export const PLAYER_RACER_ID = "player";
export const RACE_LAPS = 1;

/** One checkpoint volume per barricade plus the finish line: the corridor's authored milestones. */
const CHECKPOINTS: readonly Checkpoint[] = [
  ...ROUTE_GATES.map((gate) => ({
    id: gate.id,
    center: [0, 0, gate.atZ] as readonly [number, number, number],
    half: [CORRIDOR_DRIVE_HALF_WIDTH, 8, 2] as readonly [number, number, number],
  })),
  { id: "finish", center: [0, 0, EXIT_Z] as readonly [number, number, number], half: [CORRIDOR_DRIVE_HALF_WIDTH, 8, 4] as readonly [number, number, number] },
];

export interface RacerStanding {
  id: string;
  name: string;
  place: number;
  lap: number;
  finished: boolean;
}

export interface RaceSnapshot {
  place: number;
  total: number;
  lap: number;
  laps: number;
  standings: readonly RacerStanding[];
  /** True once the first kart is home; the rest still race for position. */
  finished: boolean;
}

export interface Standings {
  /** Advance the checkpoint ring with this tick's positions; returns the race's events. */
  update(now: number, positions: Record<string, readonly [number, number, number]>): readonly RaceEvent[];
  snapshot(): RaceSnapshot;
  placeOf(id: string): number;
  finishedOf(id: string): boolean;
  reset(): void;
}

export function createStandings(names: Readonly<Record<string, string>>): Standings {
  const ids = Object.keys(names);
  const track = raceTrack({ checkpoints: CHECKPOINTS, laps: RACE_LAPS });
  let race: RaceState = seed();

  function seed(): RaceState {
    const next = createRaceState({ track, win: firstPastPost(1) });
    for (const id of ids) next.addRacer(id);
    return next;
  }

  function snapshot(): RaceSnapshot {
    const standings = race.standings();
    const player = standings.find((entry) => entry.racerId === PLAYER_RACER_ID);
    return {
      place: player?.position ?? ids.length,
      total: ids.length,
      lap: Math.min(RACE_LAPS, player?.lap ?? 1),
      laps: RACE_LAPS,
      standings: standings.map((entry) => ({
        id: entry.racerId,
        name: names[entry.racerId] ?? entry.racerId,
        place: entry.position,
        lap: entry.lap,
        finished: entry.finished,
      })),
      finished: race.finished,
    };
  }

  return {
    update(now, positions) {
      return race.update(now, positions);
    },
    snapshot,
    placeOf(id) {
      return race.progressOf(id)?.position ?? ids.length;
    },
    finishedOf(id) {
      return race.progressOf(id)?.finished ?? false;
    },
    reset() {
      race = seed();
    },
  };
}
