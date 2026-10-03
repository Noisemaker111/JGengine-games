import { describe, expect, test } from "bun:test";
import { openSave, SAVE_KEY, validHome, type StoragePort } from "./save";
import { depart, newDive, newHome, recoverInterrupted, settle, takeLoot } from "./state";

function memory(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
describe("durable Marrow boundary", () => {
  test("a fresh reader sees the actual settled items, never a second award", () => {
    const storage = memory();
    const session = openSave(storage);
    session.commit(depart(session.home));
    session.commit(settle(session.home, takeLoot(newDive(1), "ink", "ink")!, "extracted", "Returned by rail"));
    const reloaded = openSave(storage);
    expect(reloaded.home.stash).toEqual([{ uid: "1:ink", kind: "ink", level: 1 }]);
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
    const haul = takeLoot(newDive(1), "wire", "wire")!;
    expect(() => session.commit(settle(session.home, haul, "extracted", "Rail"))).toThrow("storage unavailable");
    expect(session.home.activeDive).toBe(1);
    unreadable = false;
    const reloaded = openSave(storage);
    expect(reloaded.home.stash.map(i => i.uid)).toEqual(["1:wire"]);
    expect(recoverInterrupted(reloaded.home)).toBe(reloaded.home);
  });
  test("stale sessions and damaged or future saves never overwrite durable bytes", () => {
    const storage = memory();
    const first = openSave(storage), stale = openSave(storage);
    first.commit(depart(first.home));
    expect(() => stale.commit(depart(stale.home))).toThrow("another window");
    for (const raw of ["{", JSON.stringify({ ...newHome(), version: 3 }), JSON.stringify({ ...newHome(), stash: [{ uid: "1:wire", kind: "wire", level: 1 }] })]) {
      storage.setItem(SAVE_KEY, raw);
      expect(() => openSave(storage)).toThrow();
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
    }
    expect(validHome({ ...newHome(), nextDive: 99 })).toBe(false);
  });
});
