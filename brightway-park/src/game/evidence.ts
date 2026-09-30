import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { session } from "./session";

export function traceNative(kind: string, details: unknown = null): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_PARK_EVIDENCE !== "1") return;
  void fetch("/__brightway/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, details }) }).catch(() => {});
}

export function tracePark(ctx: GameContext, kind: string, details: unknown = null): void {
  traceNative(kind, { details, clock: ctx.time.snapshot(), cash: session.cash, ticket: session.ticketPrice,
    guests: session.guests.size, builds: [...session.placed.values()], selected: session.selectedObject,
    tool: session.selectedTool, day: session.day, won: session.won, gameOver: session.gameOver });
}
