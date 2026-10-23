import { describe, expect, test } from "bun:test";
import { openSave, validHome, type StoragePort } from "./save";
import { buySupply, counterRows, haulScrip, marrowStanding, OPERATOR, priceOf, SCRIP, settleEconomy } from "./counter";
import { depart, newDive, newHome, settle, takeLoot, type Home } from "./state";

function memory(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

function standingAt(score: number): Home {
  const standing = marrowStanding();
  standing.adjust(OPERATOR, "marrow", score);
  return { ...newHome(), standing: standing.snapshot() };
}

describe("Marrow's counter", () => {
  test("standing rises on a return and falls on a lost Life", () => {
    const home = standingAt(0);
    const returned = settleEconomy(home, [{ kind: "wire" }, { kind: "ink" }], "extracted");
    expect(returned.scrip).toBe(57);
    expect(returned.bank.banked).toBe(57);
    expect(marrowStanding(returned.standing).standing(OPERATOR, "marrow")).toBe(14);

    const died = settleEconomy(home, [{ kind: "ink" }], "lost");
    expect(died.scrip).toBe(45);
    expect(died.bank.banked).toBe(0);
    expect(died.bank.lost).toBe(45);
    expect(marrowStanding(died.standing).standing(OPERATOR, "marrow")).toBe(-10);
  });

  test("the shelf opens exactly at the standing it names", () => {
    const before = counterRows(standingAt(14)).find(row => row.supply.kind === "polymer")!;
    expect(before.locked).toBe(true);
    expect(before.needs).toBe(15);
    const at = counterRows(standingAt(15)).find(row => row.supply.kind === "polymer")!;
    expect(at.locked).toBe(false);
    expect(counterRows(standingAt(39)).find(row => row.supply.kind === "cells")!.locked).toBe(true);
    expect(counterRows(standingAt(40)).find(row => row.supply.kind === "cells")!.locked).toBe(false);
  });

  test("prices fall as standing rises, from one authored curve", () => {
    expect(priceOf("wire", 0)).toBe(36);
    expect(priceOf("wire", 40)).toBe(27);
    expect(priceOf("wire", 500)).toBeGreaterThanOrEqual(18);
    expect(priceOf("ink", 80)).toBeLessThan(priceOf("ink", 0));
  });

  test("a locked shelf refuses the purchase and an open one costs scrip", () => {
    const poor = standingAt(0);
    expect(() => buySupply(poor, "ink")).toThrow(/cleared you for/);

    const rich = { ...standingAt(80), bank: { banked: 300, haul: 0, deposited: 0, lost: 0, bestHaul: 0, runs: 0 } };
    const bought = buySupply(rich, "ink");
    expect(bought.bank.banked).toBe(300 - priceOf("ink", 80));
    expect(bought.stash).toHaveLength(1);
    expect(bought.stash[0]!.kind).toBe("ink");
    expect(bought.revision).toBe(rich.revision + 1);
  });

  test("a purchase survives the save's own validation and a reload", () => {
    const storage = memory();
    const session = openSave(storage);
    const rich = { ...session.home, revision: session.home.revision + 1, bank: { ...session.home.bank, banked: 200 } };
    expect(validHome(rich)).toBe(true);
    session.commit(rich);
    session.commit(buySupply(session.home, "wire"));
    const reloaded = openSave(storage);
    expect(reloaded.home.stash).toHaveLength(1);
    expect(reloaded.home.bank.banked).toBe(200 - priceOf("wire", 0));
    expect(reloaded.home.bank.banked).toBeLessThan(200);
  });

  test("a whole dive banks scrip through settle and keeps the haul on a loss", () => {
    const storage = memory();
    const session = openSave(storage);
    session.commit(depart(session.home));
    const dive = takeLoot(takeLoot(newDive(1), "cells", "cells")!, "wire", "wire")!;
    expect(haulScrip(dive.cache)).toBe(30);
    session.commit(settle(session.home, dive, "extracted", "Returned by rail"));
    expect(openSave(storage).home.bank.banked).toBe(30);
    expect(openSave(storage).home.standing.records[OPERATOR]?.marrow).toBe(14);
  });

  test("a lost Life banks nothing and takes its standing with it", () => {
    const storage = memory();
    const session = openSave(storage);
    session.commit(depart(session.home));
    session.commit(settle(session.home, takeLoot(newDive(1), "ink", "ink")!, "lost", "The print took that Life"));
    const reloaded = openSave(storage);
    expect(reloaded.home.bank.banked).toBe(0);
    expect(reloaded.home.bank.lost).toBe(45);
    expect(reloaded.home.stash).toEqual([]);
    expect(reloaded.home.standing.records[OPERATOR]?.marrow).toBe(-10);
  });

  test("the same two shifts produce the same money and standing", () => {
    const play = (): string => {
      const home = standingAt(20);
      const first = settleEconomy(home, [{ kind: "wire" }, { kind: "cells" }], "extracted");
      const second = settleEconomy({ ...home, ...first }, [{ kind: "ink" }], "lost");
      return `${JSON.stringify(second.bank)}:${JSON.stringify(second.standing)}`;
    };
    expect(play()).toBe(play());
  });

  test("scrip is the counter's currency", () => {
    expect(SCRIP.id).toBe("scrip");
    expect(priceOf("cells", 0)).toBe(64);
  });
});
