import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { CLOSE_FRACTION, DAY_LENGTH, OPEN_FRACTION, guestCap } from "./catalog";
import { resetPark } from "./parkReset";
import { savePark } from "./persistence";
import { captureParkThumb } from "./parkProfile";
import { refreshParkSlot } from "./parkSlot";
import { parkFocus } from "./ui/menu/ParkMenu";
import { session } from "./session";
import { syncAmbience } from "./audio";
import { currentMetrics, tickRating } from "./sim/economy";
import { spawnGuests, tickGuests, tickRidePark } from "./sim/guests";
import { tickStaff } from "./staff";
import { tickScenario } from "./scenarios";

/** What a staged park should look like when the capture takes it. */
export type StageMode = "full";

const STEP = 1 / 20;

function updateOpenState(ctx: GameContext): void {
  const fraction = ctx.time.calendar().dayFraction;
  const wantOpen = !session.gameOver && fraction >= OPEN_FRACTION && fraction <= CLOSE_FRACTION;
  if (wantOpen === session.open) return;
  session.open = wantOpen;
  ctx.game.notices.push({ text: wantOpen ? `Day ${session.day} — gates open!` : "Gates closed for the night", tone: "info" });
  if (wantOpen) ctx.game.audio.play("gates");
}

/**
 * One tick of a live park, shared by the frame loop and the staging that fast-forwards a day, so
 * both advance exactly the same systems.
 */
export function stepPark(ctx: GameContext, dt: number): void {
  syncAmbience(ctx);
  if (!session.started || session.gameOver || dt <= 0) return;
  updateOpenState(ctx);
  const metrics = currentMetrics();
  // The rides run their own cycles and lines; their boardings, breakdowns and repairs land on
  // the guests and the till through the sink in `sim/guests`.
  tickRidePark(ctx, dt);
  spawnGuests(ctx, dt, metrics.totalAppeal);
  tickStaff(ctx, dt);
  tickGuests(ctx, dt, metrics.tracks);
  tickRating(ctx, dt, metrics);
  tickScenario(ctx, dt);
  // The blue ribbon is free play's own goal; a scenario has its own win and fail states.
  if (session.scenario === null && !session.won && metrics.rides >= 3 && session.rating >= 220 &&
      session.happinessAvg >= 50 && session.litter <= 40 &&
      session.day > 1 && session.revenueYesterday >= session.upkeepYesterday) {
    session.won = true;
    ctx.time.pause();
    setGamePhase(ctx, "paused");
    syncAmbience(ctx);
    ctx.game.audio.play("ribbon");
    savePark(ctx);
  }
}

/**
 * Dev-only staging for the state that needs a played day: a park at capacity, gates open, the
 * authored starter rides running lines and guests standing in them. Play reaches this by opening
 * the gates and waiting most of a day; `shoot --state full-park` jumps here instead.
 */
export function stagePark(ctx: GameContext, mode: StageMode): void {
  void mode;
  // Past the open fraction so the gates, the spawner and the HUD all read "open", not "closed for
  // the night" over a full park.
  advance(ctx, DAY_LENGTH * 0.27);
  resetPark(ctx, { guests: guestCap(session.rating) });
  session.started = true;
  // Let the seeded crowd spread out, board and line up; queues only exist once guests reach a ride.
  advance(ctx, 30);
}

function advance(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    ctx.sim.advance(STEP, (dt) => stepPark(ctx, dt));
  }
}

export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("park.stage", {
    apply(state, input) {
      stagePark(state, input.mode ?? "full");
      return state;
    },
  });
  // The menu states a capture host reaches: keep the park, stand at the gate.
  ctx.game.commands.define("menu.saveDoc", {
    apply(state) {
      void captureParkThumb().then(() => {
        savePark(state);
        refreshParkSlot();
      });
      return state;
    },
  });
  ctx.game.commands.define("menu.title", {
    apply(state) {
      parkFocus.id = null;
      session.started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
  ctx.game.commands.define("menu.saves", {
    apply(state) {
      parkFocus.id = "saves";
      session.started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
  ctx.game.commands.define("menu.new", {
    apply(state) {
      parkFocus.id = "new";
      session.started = false;
      setGamePhase(state, "menu");
      return state;
    },
  });
}


