import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/** Original mechanical cues, realized and mixed by the shared Web Audio engine. */
export const audio = {
  buses: { sfx: { id: "sfx", gain: 0.35 } },
  sounds: {
    rail: { id: "rail", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 160, slideTo: 80, duration: 0.35, wave: "triangle" }] } },
    shot: { id: "shot", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.12, filterFreq: 1800 }, { kind: "tone", freq: 110, slideTo: 45, duration: 0.1 }] } },
    reload: { id: "reload", bus: "sfx", synth: { voices: [{ kind: "noise", duration: 0.05, filterFreq: 2600 }, { kind: "noise", duration: 0.05, filterFreq: 1200, delay: 0.16 }] } },
    banked: { id: "banked", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 440, duration: 0.16 }, { kind: "tone", freq: 660, duration: 0.22, delay: 0.12 }] } },
    terminal: { id: "terminal", bus: "sfx", synth: { voices: [{ kind: "tone", freq: 320, duration: 0.06, wave: "triangle" }] } },
  } satisfies Record<string, SoundDef>,
};
