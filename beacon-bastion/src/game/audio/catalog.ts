import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { SynthPatch } from "@jgengine/core/audio/synth";

export const ENEMY_KILLED_CUE = "enemy_killed";
export const ENEMY_LEAKED_CUE = "enemy_leaked";

const ENEMY_KILLED_PATCH: SynthPatch = {
  gain: 0.6,
  voices: [
    { kind: "tone", freq: 620, duration: 0.14, gain: 0.5, wave: "triangle", slideTo: 240 },
    { kind: "noise", duration: 0.06, filterFreq: 2600, filterType: "bandpass", gain: 0.2, decay: 1 },
  ],
};

// A low, detuned drop with a thud: the keep taking damage should sound worse than a kill.
const ENEMY_LEAKED_PATCH: SynthPatch = {
  gain: 0.7,
  voices: [
    { kind: "tone", freq: 150, duration: 0.5, gain: 0.45, wave: "sawtooth", slideTo: 60 },
    { kind: "tone", freq: 158, duration: 0.5, gain: 0.3, wave: "square", slideTo: 62 },
    { kind: "noise", duration: 0.2, filterFreq: 500, gain: 0.25, decay: 1 },
  ],
};

// Top-down camera: cues are flat so they do not depend on where the listener sits.
export const audio: {
  sounds: Record<string, SoundDef>;
  buses: Record<string, AudioBusDef>;
} = {
  sounds: {
    [ENEMY_KILLED_CUE]: {
      id: ENEMY_KILLED_CUE,
      synth: ENEMY_KILLED_PATCH,
      bus: "sfx",
      positional: false,
      maxVoices: 4,
    },
    [ENEMY_LEAKED_CUE]: {
      id: ENEMY_LEAKED_CUE,
      synth: ENEMY_LEAKED_PATCH,
      bus: "sfx",
      positional: false,
    },
  },
  buses: {
    sfx: { id: "sfx", gain: 0.6 },
  },
};
