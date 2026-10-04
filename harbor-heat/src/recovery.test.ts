import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "./game.config";
import { content } from "./game/content";
import { registerCommands } from "./game/commands";
import { handrollOf } from "./game/handroll";
import { courierStore, DISPATCH, type CourierService } from "./game/jobs/courier";
import { sessionStore } from "./game/session";
import { BUSTED_HOLD_SEC } from "./game/failStates";
import { loop } from "./loop";

function delivery(service: CourierService) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "recovery-test", isNew: true } });
  const position = [DISPATCH[0], ctx.world.groundHeightAt(...DISPATCH), DISPATCH[1]] as const;
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position, role: "player" });
  ctx.scene.entity.spawn("car_compact", { id: "recovery-car", position, role: "prop" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  ctx.game.economy.grant(ctx.player.userId, "cash", 500);
  handrollOf(ctx).enterVehicle(ctx, "recovery-car");
  ctx.game.commands.run("courier.accept", { service });
  expect(courierStore.read(ctx).phase).toBe("running");
  return ctx;
}

describe("recovery receipts preserve delivery consequences", () => {
  for (const service of ["standard", "express"] as const) {
    for (const recovery of ["clinic", "arrest"] as const) {
      test(`${recovery} states the fee and ${service} parcel consequence`, () => {
        const ctx = delivery(service);
        if (recovery === "clinic") {
          ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: 0 });
          loop.onTick(ctx, 1 / 60);
        } else {
          handrollOf(ctx).exitVehicle(ctx);
          const position = ctx.scene.entity.get(ctx.player.userId)!.position;
          ctx.scene.entity.spawn("cop_patrol", { id: "recovery-cop", position, role: "npc" });
          handrollOf(ctx).addHeat(ctx, 200);
          loop.onTick(ctx, BUSTED_HOLD_SEC + 0.1);
        }
        const parcel = courierStore.read(ctx);
        const notice = sessionStore.read(ctx).notice;
        const express = service === "express";
        expect(parcel.phase).toBe("lost");
        expect(parcel.failureReason).toBe("recovery");
        expect(parcel.reward).toBe(0);
        expect(parcel.credReward).toBe(0);
        expect(notice).toContain("Parcel delivery ended with no delivery pay");
        expect(notice).toContain(express ? "$100 bond forfeited" : "no bond was charged");
        expect(notice).toContain(recovery === "clinic" ? "$150 fee" : "$300 fine");
        expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(500 - (express ? 100 : 0) - (recovery === "clinic" ? 150 : 300));
        ctx.game.commands.run("session.dismiss", {});
        ctx.game.commands.run("courier.return", {});
        expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(500 - (express ? 100 : 0) - (recovery === "clinic" ? 150 : 300));
      });
    }
  }
});
