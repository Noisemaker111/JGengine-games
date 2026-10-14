import type { SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { RunCue } from "../run/session";

/** Procedural pit-radio callouts and tire slip, synthesised by the shell: no sample files. */
const sounds = {
  surge_callout: {
    id: "surge_callout",
    bus: "sfx",
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 880, duration: 0.11, wave: "square", gain: 0.35 },
        { kind: "tone", freq: 880, duration: 0.11, wave: "square", gain: 0.35, delay: 0.16 },
        { kind: "tone", freq: 660, duration: 0.22, wave: "square", gain: 0.35, delay: 0.32 },
      ],
    },
  },
  gate_callout: {
    id: "gate_callout",
    bus: "sfx",
    positional: false,
    synth: {
      voices: [
        { kind: "noise", duration: 0.09, filterFreq: 3000, filterType: "bandpass", gain: 0.3 },
        { kind: "tone", freq: 660, duration: 0.14, wave: "triangle", gain: 0.6 },
        { kind: "tone", freq: 990, duration: 0.22, wave: "triangle", gain: 0.6, delay: 0.12 },
      ],
    },
  },
  tire_slip: {
    id: "tire_slip",
    bus: "sfx",
    positional: false,
    synth: {
      voices: [
        { kind: "tone", freq: 1500, slideTo: 1100, duration: 0.32, wave: "sawtooth", gain: 0.12 },
        { kind: "noise", duration: 0.3, filterFreq: 2600, filterType: "bandpass", gain: 0.4 },
      ],
    },
  },
} satisfies Record<string, SoundDef>;

/** Which catalog sound voices each run cue. */
export const RUN_CUE_SOUND: Record<RunCue, keyof typeof sounds> = {
  surge: "surge_callout",
  gate: "gate_callout",
  slip: "tire_slip",
};

export const audio = {
  buses: { sfx: { id: "sfx", gain: 0.5 } },
  sounds,
};
