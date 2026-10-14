import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";

/** Cue ids the sim and build commands play. The shell ignores unknown ids, so tests pin each one to the catalog. */
export const CUE = {
  ticketSold: "ticket_sold",
  rideBuilt: "ride_built",
  purchaseRefused: "purchase_refused",
} as const;

/** Original procedural cues on one sfx bus, so the Sound settings control them. */
export const audio: {
  buses: Record<string, AudioBusDef>;
  sounds: Record<string, SoundDef>;
} = {
  buses: { sfx: { id: "sfx", gain: 0.5 } },
  sounds: {
    // A short two-note chime. Sales can arrive several times a second, so the voice cap keeps it from stacking.
    [CUE.ticketSold]: { id: CUE.ticketSold, bus: "sfx", positional: false, maxVoices: 2, synth: { voices: [
      { kind: "tone", freq: 1320, duration: 0.14, gain: 0.3, wave: "triangle" },
      { kind: "tone", freq: 1760, duration: 0.18, gain: 0.22, wave: "triangle", delay: 0.05 },
    ] } },
    [CUE.rideBuilt]: { id: CUE.rideBuilt, bus: "sfx", positional: false, maxVoices: 1, synth: { voices: [
      { kind: "tone", freq: 523, duration: 0.2, gain: 0.3, wave: "triangle" },
      { kind: "tone", freq: 659, duration: 0.2, gain: 0.3, wave: "triangle", delay: 0.09 },
      { kind: "tone", freq: 784, duration: 0.36, gain: 0.3, wave: "triangle", delay: 0.18 },
    ] } },
    [CUE.purchaseRefused]: { id: CUE.purchaseRefused, bus: "sfx", positional: false, maxVoices: 1, synth: { voices: [
      { kind: "tone", freq: 170, duration: 0.22, gain: 0.12, wave: "square", slideTo: 120 },
      { kind: "noise", duration: 0.06, filterFreq: 600, gain: 0.2 },
    ] } },
  },
};
