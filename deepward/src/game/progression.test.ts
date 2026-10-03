import { describe, expect, test } from "bun:test";
import { installRefit, refitMissing } from "./progression";
import { acknowledgeReprint, depart, newDive, newHome, settle, takeLoot } from "./state";
import { openSave, SAVE_KEY, validHome, type StoragePort } from "./save";

function banked() {
  const home = depart(newHome());
  const dive = takeLoot(takeLoot(takeLoot(newDive(1), "wire", "wire")!, "polymer", "polymer")!, "cells", "cells")!;
  return settle(home, dive, "extracted", "Rail");
}
function memory(home = banked()): StoragePort {
  let bytes = JSON.stringify(home);
  return { getItem: () => bytes, setItem: (_, value) => { bytes = value; } };
}
describe("Marrow refits and reprint ownership", () => {
  test("competing recipes spend exact instances once without changing the input", () => {
    const original = banked(), tank = installRefit(original, "tank");
    expect(original.stash.length).toBe(3);
    expect(tank.stash).toEqual([original.stash.find(i => i.kind === "cells")!]);
    expect(tank.refits).toEqual(["tank"]);
    expect(refitMissing(tank, "reserve")).toEqual([{ itemId: "wire", count: 1 }]);
    expect(() => installRefit(tank, "reserve")).toThrow("Not enough");
    expect(() => installRefit(tank, "tank")).toThrow("already installed");
    const reserve = installRefit(original, "reserve");
    expect(reserve.stash.map(i => i.kind)).toEqual(["polymer"]);
    expect(newDive(2, reserve).reserve).toBe(30);
    expect(newDive(2, reserve).oxygen).toBe(110);
    expect(newDive(2, tank).oxygen).toBe(145);
    expect(newDive(2, tank).tankSeconds).toBe(145);
    expect(newDive(2, tank).reserve).toBe(18);
  });
  test("empty shelves, unknown recipes and active expeditions cannot spend", () => {
    expect(() => installRefit(newHome(), "tank")).toThrow("Not enough");
    expect(() => installRefit(banked(), "bogus" as "tank")).toThrow("Unknown");
    expect(() => installRefit(depart(banked()), "tank")).toThrow("Return");
  });
  test("purchase acknowledgement follows atomic verified persistence; failed and stale writers retain their view", () => {
    const storage = memory(), session = openSave(storage), stale = openSave(storage);
    session.commit(installRefit(session.home, "tank"));
    expect(openSave(storage).home.refits).toEqual(["tank"]);
    expect(() => stale.commit(installRefit(stale.home, "reserve"))).toThrow("another window");
    const blockedStorage = memory(), blocked = openSave(blockedStorage);
    blockedStorage.setItem = () => { throw new Error("quota"); };
    expect(() => blocked.commit(installRefit(blocked.home, "tank"))).toThrow("quota");
    expect(blocked.home.refits).toEqual([]);
    expect(blocked.home.stash.length).toBe(3);
  });
  test("upgrades and old stash survive loss; reprint blocks departure and persists exactly once", () => {
    const storage = memory(installRefit(banked(), "tank")), session = openSave(storage);
    session.commit(depart(session.home));
    session.commit(settle(session.home, takeLoot(newDive(2, session.home), "ink", "ink")!, "lost", "No air"));
    const reloaded = openSave(storage);
    expect(reloaded.home.deaths).toBe(1);
    expect(reloaded.home.refits).toEqual(["tank"]);
    expect(reloaded.home.stash.map(i => i.kind)).toEqual(["cells"]);
    expect(() => depart(reloaded.home)).toThrow("Acknowledge");
    reloaded.commit(acknowledgeReprint(reloaded.home));
    expect(openSave(storage).home.reprintPending).toBe(false);
    expect(() => acknowledgeReprint(reloaded.home)).toThrow();
    expect(newDive(depart(reloaded.home).activeDive!, reloaded.home).oxygen).toBe(145);
  });
  test("durable flags reject duplicate or unknown upgrades and impossible pending reprints", () => {
    expect(validHome({ ...banked(), refits: ["tank", "tank"] })).toBe(false);
    expect(validHome({ ...banked(), refits: ["cheat"] })).toBe(false);
    expect(validHome({ ...banked(), reprintPending: true })).toBe(false);
    expect(validHome({ ...depart(banked()), reprintPending: true })).toBe(false);
  });
  test("v1 migration preserves loaded bytes until the next durable transition", () => {
    const { refits, reprintPending, ...current } = banked();
    const legacy = JSON.stringify({ ...current, version: 1 });
    let bytes = legacy;
    const storage = { getItem: () => bytes, setItem: (_: string, value: string) => { bytes = value; } };
    const session = openSave(storage);
    expect(session.home.version).toBe(2);
    expect(session.home.refits).toEqual([]);
    expect(storage.getItem(SAVE_KEY)).toBe(legacy);
    session.commit(installRefit(session.home, "tank"));
    expect(JSON.parse(bytes).version).toBe(2);
    expect(openSave(storage).home.stash.length).toBe(1);
  });
});
