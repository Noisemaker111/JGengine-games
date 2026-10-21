export interface WaveStatusInput {
  /** Whether the player has released at least one wave. */
  started: boolean;
  /** True while the current wave's release window is spawning raiders. */
  releasing: boolean;
  /** 1-based wave number shown to the player. */
  wave: number;
  /** Raiders currently alive on the approach. */
  alive: number;
}

/** One line for the wave widget that says what the field is doing right now. */
export function waveStatusLine({ started, releasing, wave, alive }: WaveStatusInput): string {
  if (!started) return `Wave ${wave} · ready to release`;
  if (alive === 0) return releasing ? `Wave ${wave} · raiders incoming` : `Wave ${wave} · field clear`;
  return `Wave ${wave} · ${alive} ${alive === 1 ? "raider" : "raiders"} left`;
}
