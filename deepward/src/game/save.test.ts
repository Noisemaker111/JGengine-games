import { describe, expect, test } from "bun:test";
import { openSave, SAVE_KEY, validHome, type StoragePort } from "./save";
import { depart, newDive, newHome, recoverInterrupted, settle, takeLoot, type ItemKind } from "./state";
import { kindOf, rollItem } from "./items";

function memory(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
function loot(source: string, kind: ItemKind, depth = 1) {
  const result = takeLoot(newDive(1), source, kind, depth);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}
describe("durable Marrow boundary", () => {
  test("a fresh reader sees the actual settled items, never a second award", () => {
    const storage = memory();
    const session = openSave(storage);
    session.commit(depart(session.home));
    session.commit(settle(session.home, loot("ink", "ink", 4), "extracted", "Returned by rail"));
    const reloaded = openSave(storage);
    expect(reloaded.home.stash.map(i => i.id)).toEqual(["1:ink"]);
    expect(kindOf(reloaded.home.stash[0]!)).toBe("ink");
    expect(reloaded.home.stash[0]!.level).toBe(4);
    expect(reloaded.home.stash[0]!.affixes.length).toBeGreaterThanOrEqual(0);
    expect(recoverInterrupted(reloaded.home)).toBe(reloaded.home);
    expect(reloaded.home.extractions).toBe(1);
  });
  test("a reload settles the active Life while preserving the old stash", () => {
    const storage = memory();
    const session = openSave(storage);
    session.commit(depart(session.home));
    const resumed = openSave(storage);
    resumed.commit(recoverInterrupted(resumed.home));
    expect(openSave(storage).home.deaths).toBe(1);
    expect(openSave(storage).home.stash).toEqual([]);
  });
  test("blocked writes keep the departure outstanding and cannot claim extraction", () => {
    const storage = memory();
    const session = openSave(storage);
    session.commit(depart(session.home));
    storage.setItem = () => { throw new Error("quota"); };
    expect(() => session.commit(settle(session.home, newDive(1), "extracted", "Rail"))).toThrow("quota");
    expect(session.home.activeDive).toBe(1);
    expect(session.home.extractions).toBe(0);
  });
  test("an unacknowledged write is resolved by fresh read without duplicating the haul", () => {
    const storage = memory(), session = openSave(storage);
    session.commit(depart(session.home));
    const read = storage.getItem, write = storage.setItem;
    let unreadable = false;
    storage.getItem = key => { if (unreadable) throw new Error("storage unavailable"); return read(key); };
    storage.setItem = (key, value) => { write(key, value); unreadable = true; };
    const haul = loot("wire", "wire");
    expect(() => session.commit(settle(session.home, haul, "extracted", "Rail"))).toThrow("storage unavailable");
    expect(session.home.activeDive).toBe(1);
    unreadable = false;
    const reloaded = openSave(storage);
    expect(reloaded.home.stash.map(i => i.id)).toEqual(["1:wire"]);
    expect(recoverInterrupted(reloaded.home)).toBe(reloaded.home);
  });
  test("stale sessions and damaged or future saves never overwrite durable bytes", () => {
    const storage = memory();
    const first = openSave(storage), stale = openSave(storage);
    first.commit(depart(first.home));
    expect(() => stale.commit(depart(stale.home))).toThrow("another window");
    const legacy = JSON.stringify({
      version: 3, refits: ["tank"], reprintPending: false, revision: 2, nextDive: 2, life: 1, activeDive: null,
      stash: [{ uid: "1:ink", kind: "ink", level: 1 }], extractions: 1, deaths: 0,
      last: { kind: "extracted", dive: 1, count: 1, reason: "Returned by rail", scrip: 45 },
      bank: { banked: 45, haul: 0, deposited: 45, lost: 0, bestHaul: 45, runs: 1 },
      standing: { records: { operator: { marrow: 14 } } },
    });
    for (const raw of ["{", JSON.stringify({ ...newHome(), version: 5 }), JSON.stringify({ ...newHome(), stash: [{ id: "1:wire", baseId: "ink", level: 1 }] }), JSON.stringify({ ...newHome(), revision: "x" })]) {
      storage.setItem(SAVE_KEY, raw);
      expect(() => openSave(storage)).toThrow();
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
    }
    expect(validHome({ ...newHome(), nextDive: 99 })).toBe(false);
  });
  test("a v3 record migrates to rolled instances without writing until the next transition", () => {
    const legacy = JSON.stringify({
      version: 3, refits: ["tank"], reprintPending: false, revision: 2, nextDive: 2, life: 1, activeDive: null,
      stash: [{ uid: "1:ink", kind: "ink", level: 1 }], extractions: 1, deaths: 0,
      last: { kind: "extracted", dive: 1, count: 1, reason: "Returned by rail", scrip: 45 },
      bank: { banked: 45, haul: 0, deposited: 45, lost: 0, bestHaul: 45, runs: 1 },
      standing: { records: { operator: { marrow: 14 } } },
    });
    let bytes = legacy;
    const storage = { getItem: () => bytes, setItem: (_: string, next: string) => { bytes = next; } };
    const session = openSave(storage);
    expect(session.home.version).toBe(4);
    expect(session.home.stash).toHaveLength(1);
    expect(kindOf(session.home.stash[0]!)).toBe("ink");
    expect(session.home.stash[0]!.id).toBe("1:ink");
    expect(session.home.ledger).toEqual({});
    expect(storage.getItem(SAVE_KEY)).toBe(legacy);
    session.commit({ ...session.home, revision: session.home.revision + 1 });
    expect(JSON.parse(bytes).version).toBe(4);
    expect(openSave(storage).home.stash[0]!.baseId).toBe("ink");
  });
  test("a saved instance is checked against the catalog, not a copied shape", () => {
    const item = rollItem("ink", 4, "save:catalog", "purchase-1:ink");
    const home = { ...newHome(), stash: [item], extractions: 0, last: null };
    expect(validHome(home)).toBe(true);
    expect(validHome({ ...home, stash: [{ ...item, level: 99 }] })).toBe(false);
    expect(validHome({ ...home, stash: [{ ...item, baseId: "service-rifle" }] })).toBe(false);
    expect(validHome({ ...home, stash: [{ ...item, rarity: "mythic" }] })).toBe(false);
    expect(validHome({ ...home, ledger: { [item.id]: "salvaged" } })).toBe(false);
    expect(validHome({ ...home, ledger: { other: "lost" } })).toBe(false);
  });
});
