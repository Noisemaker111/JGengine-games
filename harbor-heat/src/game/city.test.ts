import { describe, expect, test } from "bun:test";
import { validateMissionCatalog } from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import { createWorldModel } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../editorLayers";
import { city } from "./city";

const markers = missionMarkers(editorLayers);

describe("Mainsail's world model", () => {
  test("every job's mission is valid against the authored scene markers", () => {
    const missions = Object.values(city.jobs ?? {}).map((job) => job.mission);
    expect(validateMissionCatalog(missions, { markerIds: Object.keys(markers) }).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("the story opens with one thing to do and Marco on the phone", () => {
    const world = createWorldModel(city, { markers });
    expect(world.next()?.jobId).toBe("welcome");
    expect(world.contacts().map((contact) => contact.name)).toEqual(["Marco Vance"]);
  });

  test("clearing the docks hands Port Carmine over, changes what Marco says and introduces Dee", () => {
    const world = createWorldModel(city, { markers });
    world.set("jobs.welcome", "done");
    world.startJob("dock_sweep");
    world.signal("go");
    world.signal("clear");
    expect(world.fact("port.owner")).toBe("player");
    expect(world.says("marco")[0]).toContain("ledger");
    expect(world.contacts().map((contact) => contact.id)).toEqual(["marco", "dee"]);
    expect(world.says("dee")[0]).toContain("quiet");
    expect(world.job("clean_hands")?.status).toBe("available");
  });

  test("shooting a cop spreads: heat, a scared block, an angry HHPD and Dee cutting you off", () => {
    const heat: number[] = [];
    const world = createWorldModel(city, { markers, onOutput: (name, amount) => name === "heat" && heat.push(amount) });
    world.set("jobs.welcome", "done");
    world.set("jobs.dock_sweep", "done");
    expect(world.job("clean_hands")?.status).toBe("available");
    world.emit({ kind: "cop_down", place: "downtown", faction: "hhpd" });
    expect(heat).toEqual([110]);
    expect(world.num("downtown.fear")).toBe(35);
    expect(world.num("hhpd.mood")).toBe(-25);
    expect(world.says("dee")[0]).toBe("You shot a cop. Don't call me again.");
    expect(world.job("clean_hands")?.status).toBe("locked");
    expect(world.log().at(-1)?.text).toBe("Officer down in Downtown Vice.");
  });
});
