import type { SoundDef } from "@jgengine/core/audio/audioFalloff";

/** Feedback cues for match events. Each is synthesised by the shell on Web Audio, so no sample files ship. */
export const CUE = {
  trained: "cue.trained",
  built: "cue.built",
  unitLost: "cue.unitLost",
} as const;

// Flat one-shots: the RTS camera is far from the field, so cues are not spatialised.
const sounds: Record<string, SoundDef> = {
  // Two rising triangle notes: a unit mustered at the keep.
  [CUE.trained]: {
    id: CUE.trained, bus: "sfx", positional: false, gain: 0.6, priority: 1,
    synth: { voices: [
      { kind: "tone", freq: 660, duration: 0.3, wave: "triangle", gain: 0.35 },
      { kind: "tone", freq: 990, duration: 0.42, wave: "triangle", gain: 0.3, delay: 0.09 },
    ] },
  },
  // A hammer click, then a second strike and a short knock: a building going up.
  [CUE.built]: {
    id: CUE.built, bus: "sfx", positional: false, gain: 0.6, priority: 1,
    synth: { voices: [
      { kind: "noise", duration: 0.09, filterFreq: 2200, filterType: "bandpass", gain: 0.5 },
      { kind: "tone", freq: 190, duration: 0.2, wave: "square", slideTo: 110, gain: 0.22 },
      { kind: "noise", duration: 0.08, filterFreq: 1400, filterType: "bandpass", gain: 0.4, delay: 0.17 },
      { kind: "tone", freq: 260, duration: 0.18, wave: "triangle", gain: 0.3, delay: 0.17 },
    ] },
  },
  // A falling, dull tone over a low rumble. Capped so a rout does not stack it.
  [CUE.unitLost]: {
    id: CUE.unitLost, bus: "sfx", positional: false, gain: 0.5, maxVoices: 2,
    synth: { voices: [
      { kind: "tone", freq: 300, duration: 0.5, wave: "sawtooth", slideTo: 120, gain: 0.16 },
      { kind: "noise", duration: 0.3, filterFreq: 650, gain: 0.22 },
    ] },
  },
};

/** The `audio` seam: sounds for `ctx.game.audio.play(CUE.*)` and an sfx bus the settings menu exposes. */
export const audio = {
  buses: { sfx: { id: "sfx" } },
  sounds,
};
