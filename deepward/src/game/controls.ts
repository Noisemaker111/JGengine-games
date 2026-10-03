import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { distance, EXIT, EXIT_REACH, GARAGE, GARAGE_REACH, HOME_SPAWN, inside, lineOfSight, PRINT_ID, PRINT_SPAWN, RECEIVING_BACK_Z, SALVAGE, STASH, STASH_REACH, STEAM, VAULT_SPAWN, walkable, type Point } from "../world";
import { acknowledgeReprint, ageDive, depart, fits, ITEMS, newDive, newHome, pack, recoverInterrupted, reloadWeapon, RIFLE, settle, SIDEARM, takeLoot, type Dive, type Home, type ItemKind, type Result } from "./state";
import { installRefit, REFITS, type RefitId } from "./progression";
import { openSave, type SaveSession } from "./save";
import { advanceRoute, createNavigator } from "./navigation";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW", "ArrowUp"], moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"], moveRight: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft"],
  deepwardInteract: ["KeyE"], deepwardFire: ["mouse0"], deepwardReload: ["KeyR"], deepwardCache: ["Tab"],
};
export interface View {
  home: Home; dive: Dive | null; mode: "home" | "dive" | "saving" | "blocked" | "reprinting";
  panel: "stash" | "cache" | null; paused: boolean; hint: string; error: string;
  pending: { kind: Result["kind"]; reason: string } | null;
  trace: { from: Point; to: Point; remaining: number } | null;
}
export const viewStore = defineStore<View>("deepward.session", () => ({ home: newHome(), dive: null, mode: "home", panel: null, paused: false, hint: "Walk to the Garage. E to take the rail to Bellwether.", error: "", pending: null, trace: null }));
const runtime = perContext(() => ({ save: null as SaveSession | null, aim: [0, 0, -1] as Point, worldItems: new Map<string, string>(), navigation: createNavigator() }));
const message = (e: unknown): string => e instanceof Error ? e.message : String(e);
export function setAim(ctx: GameContext, direction: Point): void { runtime(ctx).aim = direction; }
function playerAt(ctx: GameContext): Point | null { return ctx.scene.entity.get(ctx.player.userId)?.position ?? null; }
function playable(ctx: GameContext): boolean {
  const view = viewStore.read(ctx);
  return !view.paused && view.panel === null && (view.mode === "home" || view.mode === "dive");
}
function ungrab(): void { if (typeof document !== "undefined") document.exitPointerLock?.(); }
function freeze(ctx: GameContext): void { ctx.time.pause(); setGamePhase(ctx, "paused"); ungrab(); }
function run(ctx: GameContext): void { setGamePhase(ctx, "playing"); ctx.time.play(); }
function teleport(ctx: GameContext, at: Point): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: at, rotationY: Math.PI, dt: 0 });
}
function spawnLoot(ctx: GameContext, source: string, kind: ItemKind, at: Point, diveId: number): void {
  const records = runtime(ctx).worldItems;
  if (records.has(source)) return;
  const item = ctx.scene.worldItem.spawn({ itemId: kind, position: at, rarity: ITEMS[kind].rarity.toLowerCase(), baseType: kind, source: `${diveId}:${source}` });
  records.set(source, item.instanceId);
}
function clearLoot(ctx: GameContext): void {
  const records = runtime(ctx).worldItems;
  for (const instanceId of records.values()) ctx.scene.worldItem.consume(instanceId);
  records.clear();
  runtime(ctx).navigation = createNavigator();
}
function syncPrint(ctx: GameContext, dive: Dive | null): void {
  const present = ctx.scene.entity.get(PRINT_ID);
  if (dive === null || dive.print.health <= 0) {
    if (present !== null) ctx.scene.entity.despawn(PRINT_ID);
    return;
  }
  const p = dive.print;
  if (present === null) ctx.scene.entity.spawn("fitter", { id: PRINT_ID, position: p.at, role: "npc" });
  else ctx.scene.entity.setPose(PRINT_ID, { position: p.at, rotationY: Math.atan2((playerAt(ctx)?.[0] ?? 0) - p.at[0], (playerAt(ctx)?.[2] ?? 0) - p.at[2]), dt: 0 });
  ctx.scene.entity.stats.set(PRINT_ID, "health", { current: p.health });
}
function syncPlayer(ctx: GameContext, dive: Dive | null): void {
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: dive?.health ?? 100 });
  ctx.scene.entity.stats.set(ctx.player.userId, "oxygen", { current: dive?.oxygen ?? 110, max: dive?.tankSeconds ?? 110 });
  ctx.scene.entity.stats.set(ctx.player.userId, "ammo", { current: dive?.magazine ?? 6 });
}
export function nearby(ctx: GameContext): { label: string; id: string; kind?: ItemKind; at: Point } | null {
  const v = viewStore.read(ctx), at = playerAt(ctx);
  if (at === null) return null;
  if (v.mode === "home") {
    if (distance(at, GARAGE) <= GARAGE_REACH) return { label: "E · Ride to Bellwether / full tank", id: "garage", at: GARAGE };
    if (distance(at, STASH) <= STASH_REACH) return { label: "E · Inspect Marrow's persistent stash", id: "stash", at: STASH };
    return null;
  }
  const dive = v.dive;
  if (v.mode !== "dive" || dive === null) return null;
  if (distance(at, EXIT) <= EXIT_REACH) return { label: "E · Return by rail / bank carried haul", id: "exit", at: EXIT };
  const choices: { label: string; id: string; kind: ItemKind; at: Point }[] = SALVAGE.map(s => ({ ...s, label: `E · Search ${ITEMS[s.kind].name} / 1.4s` }));
  if (dive.print.drop !== null) choices.push({ label: "E · Take the Fitter's service rifle / 1.4s", id: "fitter", kind: "service-rifle", at: dive.print.drop });
  return choices.filter(s => {
    const instanceId = runtime(ctx).worldItems.get(s.id);
    return instanceId !== undefined && ctx.scene.worldItem.get(instanceId) !== null && !dive.collected.includes(s.id) && distance(at, s.at) <= 2.1 && lineOfSight(at, s.at);
  }).sort((a, b) => distance(at, a.at) - distance(at, b.at))[0] ?? null;
}
function begin(ctx: GameContext): void {
  const v = viewStore.read(ctx), at = playerAt(ctx), save = runtime(ctx).save;
  if (!playable(ctx) || v.mode !== "home" || at === null || distance(at, GARAGE) > GARAGE_REACH || save === null) return;
  try {
    const home = depart(v.home);
    save.commit(home); // A failed departure never enters the vault.
    const dive = newDive(home.activeDive!, home);
    viewStore.write(ctx, { ...v, home, dive, mode: "dive", panel: null, pending: null, error: "", trace: null, hint: "Bellwether / last shift. The rail behind you is the only way home." });
    teleport(ctx, VAULT_SPAWN);
    clearLoot(ctx);
    for (const loot of SALVAGE) spawnLoot(ctx, loot.id, loot.kind, loot.at, dive.id);
    syncPrint(ctx, dive);
    syncPlayer(ctx, dive);
  } catch (error) { viewStore.update(ctx, s => ({ ...s, error: message(error) })); }
}
function finish(ctx: GameContext, kind: Result["kind"], reason: string): void {
  const v = viewStore.read(ctx);
  if (v.dive === null || (v.mode !== "dive" && v.mode !== "saving")) return;
  viewStore.write(ctx, { ...v, mode: "saving", pending: { kind, reason }, panel: null, paused: false });
  freeze(ctx);
  try {
    const save = runtime(ctx).save;
    if (save === null) throw new Error("Persistent storage unavailable");
    const home = settle(v.home, v.dive, kind, reason);
    save.commit(home);
    if (kind === "lost") {
      viewStore.write(ctx, { ...v, home, mode: "reprinting", pending: null, paused: false, panel: null, error: "", trace: null, hint: "Signal ended. The carried haul is lost; Marrow is preparing the next Life." });
      return; // Preserve the failed expedition view until the player acknowledges its consequence.
    }
    clearLoot(ctx);
    syncPrint(ctx, null);
    teleport(ctx, HOME_SPAWN);
    syncPlayer(ctx, null);
    viewStore.write(ctx, { ...v, home, dive: null, mode: "home", pending: null, paused: false, panel: null, error: "", trace: null,
      hint: kind === "extracted" ? `Haul committed to Marrow / ${home.last!.count} items. Walk left to the stash.` : "Halloway: the printer has you. Your old stash is safe; that Life's haul is gone." });
    run(ctx);
  } catch (error) {
    viewStore.update(ctx, s => ({ ...s, error: message(error), hint: "Return has not been acknowledged. Retry or reload the saved record." }));
  }
}
function interact(ctx: GameContext): void {
  if (!playable(ctx)) return;
  const target = nearby(ctx), v = viewStore.read(ctx);
  if (target === null) return;
  if (target.id === "garage") { begin(ctx); return; }
  if (target.id === "stash") {
    viewStore.update(ctx, s => ({ ...s, panel: "stash" })); freeze(ctx); return;
  }
  if (target.id === "exit") {
    if (v.dive?.health !== undefined && v.dive.health > 0) finish(ctx, "extracted", "Returned to the receiving rail with air and haul.");
    return;
  }
  const dive = v.dive, at = playerAt(ctx);
  if (dive === null || at === null || target.kind === undefined) return;
  if (dive.channel !== null) {
    viewStore.update(ctx, s => ({ ...s, dive: { ...dive, channel: null }, hint: "Search cancelled." })); return;
  }
  if (pack(dive.cache, { uid: `${dive.id}:${target.id}`, kind: target.kind, level: 1 }) === null) {
    viewStore.update(ctx, s => ({ ...s, hint: "Cache has no room. Tab to repack or leave an item behind." })); return;
  }
  viewStore.update(ctx, s => ({ ...s, dive: { ...dive, channel: { id: target.id, remaining: 1.4, anchor: at } }, hint: "Searching / stay still. The Fitter can hear you." }));
}
function fire(ctx: GameContext): void {
  const v = viewStore.read(ctx), at = playerAt(ctx), dive = v.dive;
  if (!playable(ctx) || v.mode !== "dive" || dive === null || at === null || dive.health <= 0 || dive.reload > 0 || dive.shotCooldown > 0) return;
  if (dive.magazine === 0) { viewStore.update(ctx, s => ({ ...s, hint: "Empty magazine / R to reload." })); return; }
  const weapon = dive.hand === "sidearm" ? SIDEARM : RIFLE;
  const direction = runtime(ctx).aim;
  const from: Point = [at[0], 1.62, at[2]], enemy: Point = [dive.print.at[0], 1.1, dive.print.at[2]];
  const delta = [enemy[0] - from[0], enemy[1] - from[1], enemy[2] - from[2]];
  const along = delta[0]! * direction[0] + delta[1]! * direction[1] + delta[2]! * direction[2];
  const miss = Math.hypot(delta[0]! - along * direction[0], delta[1]! - along * direction[1], delta[2]! - along * direction[2]);
  const hit = dive.print.health > 0 && along > 0 && along < weapon.range && miss <= 0.65 && lineOfSight(at, dive.print.at);
  const health = hit ? Math.max(0, dive.print.health - weapon.damage) : dive.print.health;
  const to: Point = hit ? enemy : [from[0] + direction[0] * weapon.range, from[1] + direction[1] * weapon.range, from[2] + direction[2] * weapon.range];
  const next = { ...dive, magazine: dive.magazine - 1, shotCooldown: weapon.interval, flash: 0.12, channel: null,
    print: { ...dive.print, health, mode: health > 0 ? "calling" as const : "route" as const, drop: health === 0 ? dive.print.at : dive.print.drop } };
  viewStore.write(ctx, { ...v, dive: next, trace: { from, to, remaining: 0.09 }, hint: hit ? health === 0 ? "Fitter stopped. Its visible service rifle is yours to carry." : `Hit / Fitter integrity ${health}/80` : "Shot missed / prints follow the sound." });
  if (health === 0 && dive.print.health > 0) spawnLoot(ctx, "fitter", "service-rifle", dive.print.at, dive.id);
  syncPrint(ctx, next);
  syncPlayer(ctx, next);
}
function reload(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (playable(ctx) && v.mode === "dive" && v.dive !== null) viewStore.write(ctx, { ...v, dive: reloadWeapon(v.dive) });
}
function toggleCache(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (v.mode !== "dive" || v.paused) return;
  const panel = v.panel === "cache" ? null : "cache";
  // Packing costs real tank time: an open cache blocks locomotion but never pauses the dive.
  viewStore.write(ctx, { ...v, panel, dive: v.dive === null ? null : { ...v.dive, channel: null } });
  if (panel !== null) ungrab();
}
export function registerControls(ctx: GameContext): void {
  ctx.game.commands.define("deepward.depart", { apply: begin });
  ctx.game.commands.define<{ id: RefitId }>("deepward.refit", { apply(state, input) {
    const v = viewStore.read(state), save = runtime(state).save;
    if (v.mode !== "home" || v.panel !== "stash" || save === null) return;
    try {
      const home = installRefit(v.home, input.id);
      save.commit(home);
      viewStore.write(state, { ...v, home, error: "", hint: `${REFITS[input.id].name} installed. ${REFITS[input.id].effect}. Spent salvage is gone from the stash.` });
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  ctx.game.commands.define("deepward.acknowledgeReprint", { apply(state) {
    const v = viewStore.read(state), save = runtime(state).save;
    if (v.mode !== "reprinting" || save === null) return;
    try {
      const home = acknowledgeReprint(v.home);
      save.commit(home);
      clearLoot(state); syncPrint(state, null); teleport(state, HOME_SPAWN); syncPlayer(state, null);
      viewStore.write(state, { ...v, home, dive: null, mode: "home", error: "", hint: "Halloway: the printer has you. Banked stash and installed refits survived. Choose the next departure." });
      run(state);
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  // Published shell dispatches each press/repeat to the bound action's command name.
  // UI commands share the apply functions. Only fire also consumes held input,
  // through its existing cooldown; discrete actions stay on the shell's press path.
  ctx.game.commands.define("deepwardInteract", { apply: interact });
  ctx.game.commands.define("deepwardFire", { apply: fire });
  ctx.game.commands.define("deepwardReload", { apply: reload });
  ctx.game.commands.define("deepwardCache", { apply: toggleCache });
  ctx.game.commands.define("deepward.interact", { apply: interact });
  ctx.game.commands.define("deepward.fire", { apply: fire });
  ctx.game.commands.define("deepward.reload", { apply: reload });
  ctx.game.commands.define("deepward.cache", { apply: toggleCache });
  ctx.game.commands.define("deepward.close", { apply(state) {
    const v = viewStore.read(state);
    viewStore.write(state, { ...v, panel: null, paused: false });
    if (v.mode === "home" || v.mode === "dive") run(state);
  } });
  ctx.game.commands.define("deepward.pause", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode !== "home" && v.mode !== "dive") return;
    if (v.panel !== null) { state.game.commands.run("deepward.close", {}); return; }
    viewStore.write(state, { ...v, paused: !v.paused, dive: v.dive === null ? null : { ...v.dive, channel: null } });
    if (v.paused) run(state); else freeze(state);
  } });
  ctx.game.commands.define("deepward.retrySave", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode === "saving" && v.pending !== null) finish(state, v.pending.kind, v.pending.reason);
  } });
  ctx.game.commands.define<{ uid: string; x?: number; y?: number; rotate?: boolean }>("deepward.pack", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.panel !== "cache" || dive === null || v.mode !== "dive") return;
    const item = dive.cache.find(i => i.uid === input.uid);
    if (item === undefined) return;
    const next = { ...item, x: input.x ?? item.x, y: input.y ?? item.y, rotated: input.rotate ? !item.rotated : item.rotated };
    if (!Number.isInteger(next.x) || !Number.isInteger(next.y) || !fits(dive.cache, next)) { viewStore.update(state, s => ({ ...s, hint: "That footprint will not fit there." })); return; }
    viewStore.write(state, { ...v, dive: { ...dive, cache: dive.cache.map(i => i.uid === next.uid ? next : i) } });
  } });
  ctx.game.commands.define<{ uid: string }>("deepward.discard", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.panel !== "cache" || dive === null || v.mode !== "dive") return;
    const item = dive.cache.find(i => i.uid === input.uid);
    if (item === undefined) return;
    viewStore.write(state, { ...v, dive: { ...dive, cache: dive.cache.filter(i => i.uid !== input.uid), hand: item.kind === "service-rifle" ? "sidearm" : dive.hand }, hint: `${ITEMS[item.kind].name} left behind. It cannot be reclaimed this dive.` });
  } });
  ctx.game.commands.define<{ hand: "sidearm" | "service-rifle" }>("deepward.equip", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.mode !== "dive" || dive === null || dive.reload > 0 || (input.hand !== "sidearm" && input.hand !== "service-rifle")) return;
    if (input.hand === "service-rifle" && !dive.cache.some(i => i.kind === "service-rifle")) return;
    viewStore.write(state, { ...v, dive: { ...dive, hand: input.hand, shotCooldown: 0.5 }, hint: "One hand / equipped. Both guns share the same ammo pool." });
  } });
}
export function initialize(ctx: GameContext): void {
  registerControls(ctx);
  try {
    if (typeof localStorage === "undefined") throw new Error("Marrow needs browser local storage before a dive can start.");
    const save = openSave(localStorage);
    runtime(ctx).save = save;
    const recovered = recoverInterrupted(save.home);
    if (recovered !== save.home) save.commit(recovered);
    viewStore.update(ctx, v => ({ ...v, home: save.home, mode: save.home.reprintPending ? "reprinting" : "home", hint: recovered.last?.reason ?? v.hint }));
  } catch (error) { viewStore.update(ctx, v => ({ ...v, mode: "blocked", error: message(error) })); }
}
export function seatPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("diver", { id: ctx.player.userId, position: HOME_SPAWN, rotationY: Math.PI, role: "player" });
  syncPlayer(ctx, null);
  run(ctx);
  if (viewStore.read(ctx).mode === "blocked" || viewStore.read(ctx).mode === "reprinting") freeze(ctx);
}
/** Called only by a storage change event, never by a polling loop. */
export function storageChanged(ctx: GameContext): void {
  try {
    if (runtime(ctx).save?.isCurrent() !== false) return;
  } catch { /* inaccessible storage also stops play */ }
  viewStore.update(ctx, s => ({ ...s, mode: "blocked", error: "Marrow changed in another window. Reload to use its saved state." }));
  freeze(ctx);
}
export function tick(ctx: GameContext, dt: number): void {
  const v = viewStore.read(ctx);
  if (v.paused || v.mode === "saving" || v.mode === "blocked" || !(dt > 0)) return;
  const at = playerAt(ctx);
  if (v.mode !== "dive" || v.dive === null || at === null || v.paused) return;
  const steam = v.dive.elapsed % 8 < 3 && inside(at[0], at[2], STEAM);
  let dive = ageDive(v.dive, dt, steam);
  let hint = steam ? "Hot suppressant / leave the striped floor!" : v.hint;
  let p = { ...dive.print, cooldown: Math.max(0, dive.print.cooldown - dt) };
  if (p.health > 0) {
    const range = distance(at, p.at), sees = range < 12 && at[2] < RECEIVING_BACK_Z && lineOfSight(at, p.at);
    const noisy = dive.channel !== null && range < 15 && lineOfSight(at, p.at);
    if (p.mode === "winding") {
      p.attack = Math.max(0, p.attack - dt);
      if (p.attack === 0) {
        if (range < 2.3 && lineOfSight(at, p.at)) {
          dive = { ...dive, health: Math.max(0, dive.health - 22), hurt: 0.4, channel: null };
          hint = "Fitter rifle butt / 22 damage. Back away during its raised-arm windup.";
        }
        p.mode = "calling"; p.cooldown = 1.2;
      }
    } else if (sees || noisy || (p.mode === "calling" && range < 18 && lineOfSight(at, p.at) && at[2] < RECEIVING_BACK_Z)) {
      p.mode = "calling";
      if (range < 1.9 && p.cooldown === 0) { p.mode = "winding"; p.attack = 0.7; hint = "Fitter raises its rifle / step back!"; }
      else if (range >= 1.9) {
        p.at = advanceRoute(runtime(ctx).navigation, p.at, at, Math.min(range - 1.7, dt * 2.5), "vault");
      }
    } else {
      p.mode = "route";
      const goal: Point = [PRINT_SPAWN[0] + Math.sin(dive.elapsed * 0.4), PRINT_SPAWN[1], PRINT_SPAWN[2] + Math.sin(dive.elapsed * 0.3) * 2];
      const remaining = distance(p.at, goal);
      if (remaining > 0) {
        p.at = advanceRoute(runtime(ctx).navigation, p.at, goal, dt * 2.5, "vault");
      }
    }
  }
  dive = { ...dive, print: p };
  if (dive.channel !== null) {
    const ch = dive.channel, target = ch.id === "fitter" ? { kind: "service-rifle" as const, at: p.drop } : SALVAGE.find(s => s.id === ch.id);
    if (target === undefined || target.at === null || distance(at, ch.anchor) > 0.3 || distance(at, target.at) > 2.1 || !lineOfSight(at, target.at) || dive.health < v.dive.health || dive.health <= 0) {
      dive = { ...dive, channel: null }; hint = "Search interrupted / stay still and clear of danger.";
    } else if (ch.remaining <= dt) {
      const collected = takeLoot(dive, ch.id, target.kind);
      const instanceId = runtime(ctx).worldItems.get(ch.id);
      if (collected !== null && instanceId !== undefined && ctx.scene.worldItem.consume(instanceId) !== null) {
        runtime(ctx).worldItems.delete(ch.id);
        dive = collected; hint = `${ITEMS[target.kind].name} in cache. It becomes permanent only after rail return.`;
      }
      else { dive = { ...dive, channel: null }; hint = "Cache has no space for that footprint."; }
    } else dive = { ...dive, channel: { ...ch, remaining: ch.remaining - dt } };
  }
  const trace = v.trace !== null && v.trace.remaining > dt ? { ...v.trace, remaining: v.trace.remaining - dt } : null;
  viewStore.write(ctx, { ...v, dive, hint, trace });
  syncPrint(ctx, dive); syncPlayer(ctx, dive);
  if (dive.health <= 0) finish(ctx, "lost", dive.oxygen === 0 ? "Tank exhausted. Bellwether kept the carried haul." : "The Life ended in Bellwether. The carried haul was lost.");
  // Array bindings deliver brief presses but have no shell repeat policy. Age
  // cooldown first, then share fire's gates for held input and the press command.
  else if (ctx.input.isDown("deepwardFire")) fire(ctx);
}

/** Read-only metrics for the published driver's standalone capture bridge. */
export function captureProbe(ctx: GameContext): Record<string, number> {
  const v = viewStore.read(ctx), at = playerAt(ctx);
  return { x: at?.[0] ?? 0, z: at?.[2] ?? 0, inDive: v.mode === "dive" ? 1 : 0,
    reprinting: v.mode === "reprinting" ? 1 : 0, oxygen: v.dive?.oxygen ?? 0,
    tankSeconds: v.dive?.tankSeconds ?? 0, reserve: v.dive?.reserve ?? 0,
    carried: v.dive?.cache.length ?? 0, stash: v.home.stash.length,
    tankRefit: v.home.refits.includes("tank") ? 1 : 0, reserveRefit: v.home.refits.includes("reserve") ? 1 : 0,
    deaths: v.home.deaths, returns: v.home.extractions };
}
