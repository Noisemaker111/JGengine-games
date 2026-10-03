import { describe, expect, test } from "bun:test";
import { ageDive, depart, fits, newDive, newHome, pack, recoverInterrupted, settle, takeLoot } from "./state";

describe("Bellwether extraction invariants", () => {
  test("a settled haul is unique; the next Life loses only its carried cache", () => {
    const first = depart(newHome());
    const dive = takeLoot(newDive(first.activeDive!), "wire", "wire")!;
    expect(takeLoot(dive, "wire", "wire")).toBeNull();
    const home = settle(first, dive, "extracted", "Rail return");
    expect(home.stash.map(i => i.uid)).toEqual(["1:wire"]);
    expect(() => settle(home, dive, "extracted", "Again")).toThrow();
    const away = depart(home);
    const lost = settle(away, takeLoot(newDive(2), "ink", "ink")!, "lost", "Fitter");
    expect(lost.stash).toEqual(home.stash);
    expect(lost.life).toBe(2);
  });
  test("reload of an outstanding departure resolves loss once", () => {
    const recovered = recoverInterrupted(depart(newHome()));
    expect(recovered.activeDive).toBeNull();
    expect(recovered.deaths).toBe(1);
    expect(recovered.last!.count).toBeNull();
    expect(recoverInterrupted(recovered)).toBe(recovered);
  });
  test("packing consumes footprints and rejects overlapping or out-of-bounds placement", () => {
    const ink = pack([], { uid: "1:ink", kind: "ink", level: 1 })!;
    expect(fits([ink], { uid: "1:cells", kind: "cells", level: 1, x: 0, y: 0, rotated: false })).toBe(false);
    expect(fits([], { ...ink, x: 3 })).toBe(false);
    expect(pack([ink], { uid: "1:fitter", kind: "service-rifle", level: 1 })).not.toBeNull();
  });
  test("air exhaustion bleeds only time actually spent without air", () => {
    const dive = { ...newDive(1), oxygen: 0.5 };
    expect(ageDive(dive, 1, false).health).toBe(94);
    expect(ageDive(ageDive(dive, 0.5, false), 0.5, false).health).toBe(94);
  });
});
