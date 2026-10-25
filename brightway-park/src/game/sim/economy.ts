import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { park, type ParkMetrics } from "../park";
import { syncAmbience } from "../audio";
import { closeParkDay } from "../daySession";
import { milestoneContents, milestonesCrossed } from "../milestones";
import { ratingTarget } from "./rating";

/**
 * The park's day, on the world. Money moves continuously (the `upkeep_*` flows and the `pay`
 * ripple), so midnight only restocks the stalls (their `restock_*` action), takes the loan's
 * instalment (the `loan_due` ripple), files the day's takings and checks the till.
 */

const BANKRUPT_LIMIT = 3;

/** Close the day at midnight: restock, the loan, the day's summary, and the bankruptcy count. */
export function closeDay(ctx: GameContext): void {
  const w = park.of(ctx);
  if (w.fact("park.game_over") === true) return;
  for (const instance of w.instances()) {
    const restock = `restock_${instance.kind}`;
    if (w.def.actions?.[restock] !== undefined && w.num(`${instance.id}.sold`) > 0 && w.canAct(restock, instance.id) === null) {
      w.act(restock, instance.id);
    }
  }
  if (w.emit({ kind: "loan_due" }) !== null) {
    const owed = w.num("park.loan_owed");
    ctx.game.notices.push({ text: owed > 0 ? `Loan instalment paid · $${Math.round(owed)} still owed` : "Loan paid off — the park owes nothing", tone: owed > 0 ? "info" : "success" });
  }

  const revenue = w.num("park.revenue_today");
  const spent = w.num("park.spent_today");
  // The day's net shows on the next gate-open banner; no toast for it.
  ctx.game.audio.play("settle");
  w.change({
    "park.revenue_yesterday": revenue - w.num("park.revenue_yesterday"),
    "park.upkeep_yesterday": spent - w.num("park.upkeep_yesterday"),
    "park.revenue_today": -revenue,
    "park.spent_today": -spent,
    "park.guests_today": -w.num("park.guests_today"),
  });

  if (w.num("park.cash") < 0) {
    w.change({ "park.bankrupt_days": 1 });
    const days = w.num("park.bankrupt_days");
    if (days >= BANKRUPT_LIMIT) {
      w.set("park.game_over", true);
      w.set("park.open", false);
      ctx.time.pause();
      setGamePhase(ctx, "ended");
      syncAmbience(ctx);
      ctx.game.audio.play("bankrupt");
    } else {
      ctx.game.notices.push({ text: `In the red — ${BANKRUPT_LIMIT - days} day(s) to recover`, tone: "warn" });
    }
  } else if (w.num("park.bankrupt_days") > 0) {
    w.change({ "park.bankrupt_days": -w.num("park.bankrupt_days") });
  }

  // The day's boundary is the session loop's: closing it republishes the day number.
  closeParkDay(ctx);
}

/**
 * The rating eases toward its target; its best-ever value is `park.peak`, which the locked kinds'
 * `when` reads, so crossing a milestone and the build palette opening are one write.
 */
export function tickRating(ctx: GameContext, dt: number, metrics: ParkMetrics): void {
  const w = park.of(ctx);
  const target = ratingTarget(metrics, w.num("park.mood"), w.num("park.guests_today"), w.num("park.litter"));
  const before = w.num("park.rating");
  const rating = before + (target - before) * (1 - Math.exp(-dt * 0.25));
  w.set("park.rating", rating);
  const peak = w.num("park.peak");
  if (rating <= peak) return;
  w.set("park.peak", rating);
  for (const milestone of milestonesCrossed(peak, rating)) {
    const contents = milestoneContents(milestone.unlock);
    ctx.game.notices.push({ text: `Unlocked ${contents.length > 0 ? contents.join(" & ") : milestone.label}`, tone: "success" });
    ctx.game.audio.play("milestone");
  }
}
