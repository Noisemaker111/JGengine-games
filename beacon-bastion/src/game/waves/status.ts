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

/** How hard the director is leaning, in one word per pressure tier. */
export function tierLabel(tier: number): string {
  if (tier >= 2) return "hammering";
  if (tier === 1) return "leaning";
  return "probing";
}

/**
 * The wave the director actually sent, by unit: pressure-added units appear here because they are
 * in the composition, not in a separate note. Units are grouped and ordered by id so the line does
 * not shuffle between reads.
 */
export function waveCompositionLine(units: readonly string[], tier: number): string {
  if (units.length === 0) return `Director ${tierLabel(tier)} · no host on the field`;
  const counts = new Map<string, number>();
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([unit, count]) => `${count} ${unit.replace("raider_", "")}${count === 1 ? "" : "s"}`);
  return `Director ${tierLabel(tier)} · ${parts.join(", ")}`;
}
