import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { STARTING_GOLD, STARTING_LIVES } from "./entities/base/catalog";
import { TOWER_CATALOG } from "./entities/towers/catalog";
import { firepower, keep, sellAction, towersStanding, upgradeAction } from "./keep";
import { advanceKeep, beaconRunner } from "./testing";

const archer = TOWER_CATALOG.tower_archer!;
const cannon = TOWER_CATALOG.tower_cannon!;

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);
const run = (name: string, input: unknown) => runner.ui.tryInvoke(name, input);

beforeEach(() => {
  runner = beaconRunner("Beacon keep");
});

describe("the keep is one declaration the engine runs", () => {
  test("build, wait, stand, refuse an upgrade for gold, upgrade, leak, sell", () => {
    // A cannon takes its build time: paid and reserved at once, standing only once the order finishes.
    expect(run("beacon.place", { kind: "tower_cannon", slot: "plot-2" })).toMatchObject({ status: "applied" });
    expect(world().num("keep.gold")).toBe(STARTING_GOLD - cannon.cost);
    expect(world().occupant("plot-2")).toBe("tower_cannon-1");
    expect(world().orders("build")[0]).toMatchObject({ label: cannon.label, target: "tower_cannon-1" });
    expect(runner.ctx.scene.entity.get("tower_cannon-1")).toBeNull();
    advanceKeep(runner, 2);
    expect(world().orders("build")[0]?.progress).toBeCloseTo(0.5);
    expect(run("beacon.act", { action: upgradeAction("tower_cannon"), target: "tower_cannon-1" })).toMatchObject({ status: "rejected", reason: "busy" });
    advanceKeep(runner, 2.25);
    expect(world().instance("tower_cannon-1")?.ready).toBe(true);
    expect(runner.ctx.scene.entity.get("tower_cannon-1")).not.toBeNull();
    expect(towersStanding(world())).toBe(1);

    // An archer is instant; then the purse is too thin to upgrade and the refusal says by how much.
    run("beacon.place", { kind: "tower_archer", slot: "plot-1" });
    advanceKeep(runner, 0.25);
    expect(world().num("keep.gold")).toBe(STARTING_GOLD - cannon.cost - archer.cost);
    expect(run("beacon.act", { action: upgradeAction("tower_archer"), target: "tower_archer-2" })).toEqual({
      status: "rejected",
      reason: "cost",
      message: "Upgrade needs 28 more gold",
    });
    expect(world().num("tower_archer-2.level")).toBe(1);

    // Kill bounties ripple into the purse; then the upgrade lands and the tower's numbers rise.
    keep.emit(runner.ctx, { kind: "bounty", scale: 40 });
    expect(world().num("keep.bounty_earned")).toBe(40);
    expect(run("beacon.act", { action: upgradeAction("tower_archer"), target: "tower_archer-2" })).toMatchObject({ status: "applied" });
    expect(world().num("tower_archer-2.level")).toBe(2);
    expect(world().num("tower_archer-2.damage")).toBe(archer.damage * 1.5);
    expect(world().num("keep.gold")).toBe(50 - 38);
    expect(firepower(world())).toBe(cannon.damage + archer.damage * 1.5);
    expect(world().costOf(upgradeAction("tower_archer"), "tower_archer-2")).toEqual({ "keep.gold": -76 });

    // A leak is a ripple on the keep's walls.
    keep.emit(runner.ctx, { kind: "leak", scale: 2 });
    expect(world().num("keep.lives")).toBe(STARTING_LIVES - 2);
    expect(world().log().at(-1)?.text).toBe("Raiders broke through to the keep.");

    // Selling pays back a share of the build and the upgrade, frees the plot and despawns the tower.
    const before = world().num("keep.gold");
    expect(run("beacon.act", { action: sellAction("tower_archer"), target: "tower_archer-2" })).toMatchObject({ status: "applied" });
    expect(world().num("keep.gold")).toBe(before + Math.round((archer.cost + 38) * 0.7));
    expect(world().occupant("plot-1")).toBeNull();
    advanceKeep(runner, 0.25);
    expect(runner.ctx.scene.entity.get("tower_archer-2")).toBeNull();
  });

  test("upgrades stop at level 3 and say so", () => {
    run("beacon.place", { kind: "tower_archer", slot: "plot-1" });
    world().set("keep.gold", 10_000);
    run("beacon.act", { action: upgradeAction("tower_archer"), target: "tower_archer-1" });
    run("beacon.act", { action: upgradeAction("tower_archer"), target: "tower_archer-1" });
    expect(world().num("tower_archer-1.level")).toBe(3);
    expect(run("beacon.act", { action: upgradeAction("tower_archer"), target: "tower_archer-1" })).toMatchObject({ status: "rejected", reason: "locked", message: "Already at the top level" });
  });

  test("cancelling a build still rising pays all of it back", () => {
    run("beacon.place", { kind: "tower_cannon", slot: "plot-3" });
    advanceKeep(runner, 1);
    expect(run("beacon.remove", { id: "tower_cannon-1" })).toMatchObject({ status: "applied" });
    expect(world().num("keep.gold")).toBe(STARTING_GOLD);
    advanceKeep(runner, 5);
    expect(runner.ctx.scene.entity.get("tower_cannon-1")).toBeNull();
  });

  test("the keep's walls falling ends the run once", () => {
    keep.emit(runner.ctx, { kind: "leak", scale: STARTING_LIVES });
    expect(world().fact("keep.fallen")).toBe(true);
    expect(world().fact("keep.banked")).toBe(true);
    keep.emit(runner.ctx, { kind: "leak", scale: 3 });
    expect(world().num("keep.lives")).toBe(0);
  });
});
