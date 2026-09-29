import { findEditorVolume } from "@jgengine/core/editor/document";
import { pointInVolume } from "@jgengine/core/scene/authoredTriggers";
import type { GameContext } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { player } from "./entities/players/catalog";
import { announce, clearHazard, currentHazard } from "./triggers";

const FLOAT_TEXT_INTERVAL_SECONDS = 1;

export interface HealthTickInput {
  inHazard: boolean;
  damagePerSecond: number;
  regenPerSecond: number;
  dt: number;
}

/** Signed health change for one tick: drain inside a hazard, otherwise regenerate. */
export function healthDelta(input: HealthTickInput): number {
  return input.inHazard ? -input.damagePerSecond * input.dt : input.regenPerSecond * input.dt;
}

let pendingDamage = 0;
let sinceFloatText = 0;

function resetDamageFeedback(): void {
  pendingDamage = 0;
  sinceFloatText = 0;
}

/** Drain or regenerate the local player's health each tick; respawn at zero. Call from onTick. */
export function tickHealth(ctx: GameContext, dt: number): void {
  const id = ctx.player.userId;
  const entity = ctx.scene.entity.get(id);
  const health = ctx.scene.entity.stats.get(id, "health");
  if (entity === null || health === null) return;

  let hazard = currentHazard();
  if (hazard !== null) {
    const volume = findEditorVolume(editorLayers, hazard.sourceId);
    const [x, y, z] = entity.position;
    if (volume === undefined || !pointInVolume(volume, { x, y, z })) {
      clearHazard();
      hazard = null;
      announce("Clear of the hazard — health regenerating", "good");
    }
  }

  const delta = healthDelta({
    inHazard: hazard !== null,
    damagePerSecond: hazard?.damagePerSecond ?? 0,
    regenPerSecond: player.regenPerSecond,
    dt,
  });
  if (delta === 0 || (delta > 0 && health.current >= health.max)) return;
  ctx.scene.entity.stats.delta(id, "health", delta);
  if (delta > 0) return;

  pendingDamage -= delta;
  sinceFloatText += dt;
  if (sinceFloatText >= FLOAT_TEXT_INTERVAL_SECONDS) {
    ctx.scene.entity.floatText({ instanceId: id, amount: Math.round(pendingDamage), kind: "damage" });
    resetDamageFeedback();
  }

  const after = ctx.scene.entity.stats.get(id, "health");
  if (after === null || after.current > after.min) return;
  ctx.scene.entity.resetToSpawn(id);
  ctx.scene.entity.stats.set(id, "health", { current: after.max });
  clearHazard();
  resetDamageFeedback();
  announce("Downed — back at spawn with full health", "warn");
}
