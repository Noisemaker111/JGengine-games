import { describe, expect, test } from "bun:test";

import { tierLabel, waveCompositionLine, waveStatusLine } from "./status";

describe("waveStatusLine", () => {
  test("before the first release the widget says the wave is ready", () => {
    expect(waveStatusLine({ started: false, releasing: false, wave: 1, alive: 0 })).toBe("Wave 1 · ready to release");
  });

  test("while raiders are alive the count is shown with the wave", () => {
    expect(waveStatusLine({ started: true, releasing: true, wave: 1, alive: 12 })).toBe("Wave 1 · 12 raiders left");
    expect(waveStatusLine({ started: true, releasing: false, wave: 2, alive: 1 })).toBe("Wave 2 · 1 raider left");
  });

  test("a running wave with nobody on the field yet is not reported as zero raiders", () => {
    expect(waveStatusLine({ started: true, releasing: true, wave: 1, alive: 0 })).toBe("Wave 1 · raiders incoming");
  });

  test("between waves with an empty field the widget reports it clear", () => {
    expect(waveStatusLine({ started: true, releasing: false, wave: 3, alive: 0 })).toBe("Wave 3 · field clear");
  });
});
