import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createRuntimeSave, type RuntimeSave } from "@jgengine/core/runtime/runtimeSave";
import { localSaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import { hudStore } from "./hudStore";
import { restoreSession, snapshotSession } from "./session";

const saves = new WeakMap<GameContext, RuntimeSave>();

export function battleSave(ctx: GameContext, backend?: SaveBackend): RuntimeSave {
  const existing = saves.get(ctx);
  if (existing) return existing;
  ctx.game.registerSave?.({
    key: "ember-command.battle.v1",
    snapshot: snapshotSession,
    hydrate: (data) => restoreSession(data as ReturnType<typeof snapshotSession>),
  });
  const save = createRuntimeSave({ target: {
    snapshot: () => ({ ...ctx.snapshot(), "ember-command.battle.v1": snapshotSession(), "ember-command.clock": ctx.time.snapshot(), "ember-command.wallet": { gold: ctx.game.economy.balance(ctx.player.userId, "gold"), lumber: ctx.game.economy.balance(ctx.player.userId, "lumber") } }),
    hydrate: (data) => {
      ctx.hydrate(data);
      // Published 0.18.1 hydrate retains the combat death latch; spawning clears it.
      for (const entity of ctx.scene.entity.list()) {
        const stats = Object.fromEntries(["health", "mana", "xp", "level"].flatMap((id) => {
          const stat = ctx.scene.entity.stats.get(entity.id, id);
          return stat ? [[id, { ...stat }]] : [];
        }));
        if (!stats.health || stats.health.current <= 0) continue;
        ctx.scene.entity.spawn(entity.name, { ...entity, onExisting: "replace" });
        for (const [id, stat] of Object.entries(stats)) ctx.scene.entity.stats.set(entity.id, id, stat);
      }
      restoreSession(data["ember-command.battle.v1"] as ReturnType<typeof snapshotSession>);
      ctx.time.hydrate(data["ember-command.clock"] as ClockSnapshot);
      for (const [currency, amount] of Object.entries(data["ember-command.wallet"] as Record<string, number>)) {
        const current = ctx.game.economy.balance(ctx.player.userId, currency);
        if (current > amount) ctx.game.economy.charge(ctx.player.userId, currency, current - amount);
        else if (current < amount) ctx.game.economy.grant(ctx.player.userId, currency, amount - current);
      }
    },
    subscribe: ctx.subscribe,
  }, backend: backend ?? localSaveBackend(), mode: "manual", key: "ember-command.battle", version: 1 });
  const ready = save.hasSave().then((savedBattle) => hudStore.set({ savedBattle }));
  const controller: RuntimeSave = {
    ...save,
    save: async () => { await ready; await save.save(); },
    checkpoint: async () => { await ready; await save.checkpoint(); },
    load: async () => { await ready; return save.load(); },
  };
  saves.set(ctx, controller);
  return controller;
}
