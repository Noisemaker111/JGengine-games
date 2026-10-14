import { describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../game.config";
import { loop } from "../loop";
import { audio, CUE } from "./audio";
import { content } from "./content";
import { session } from "./session";

const runner = () => createHeadlessRunner({ definition: game.game, content, loop, maxStepSeconds: 1 });
const cuesOf = (live: ReturnType<typeof runner>) => {
  const cues: string[] = [];
  live.ctx.game.events.on("audio.play", ({ sound }) => cues.push(sound));
  return cues;
};

describe("park audio cues", () => {
  test("every cue the park plays is defined in the sfx catalog", () => {
    for (const id of Object.values(CUE)) {
      expect(audio.sounds[id]?.id).toBe(id);
      expect(audio.sounds[id]?.bus).toBe("sfx");
      expect(audio.sounds[id]?.synth).toBeDefined();
    }
  });

  test("each guest ticket sale plays the ticket cue, one per sale", () => {
    const live = runner();
    live.ui.invoke("park.start");
    const cues = cuesOf(live);
    for (let frame = 0; frame < 90; frame++) live.step(1);
    expect(session.guestsToday).toBeGreaterThan(0);
    expect(cues.filter(cue => cue === CUE.ticketSold)).toHaveLength(session.guestsToday);
    expect(cues.every(cue => cue === CUE.ticketSold)).toBe(true);
  });

  test("a built ride plays the ride cue; a path does not", () => {
    const live = runner();
    live.ui.invoke("park.start");
    const cues = cuesOf(live);
    const before = session.placed.size;
    live.ui.invoke("pickCarousel");
    live.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    expect(session.placed.size).toBe(before + 1);
    expect(cues).toEqual([CUE.rideBuilt]);
    live.ui.invoke("build.select", { id: "path_walk" });
    live.ui.invoke("park.pointer", { point: [-44, 0, -28], object: null, entity: null });
    expect(session.placed.size).toBe(before + 2);
    expect(cues).toEqual([CUE.rideBuilt]);
  });

  test("an unaffordable build plays the refusal cue and places nothing", () => {
    const live = runner();
    live.ui.invoke("park.start");
    const cues = cuesOf(live);
    session.cash = 0;
    const before = session.placed.size;
    live.ui.invoke("pickCarousel");
    live.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    expect(session.placed.size).toBe(before);
    expect(cues).toEqual([CUE.purchaseRefused]);
  });
});
