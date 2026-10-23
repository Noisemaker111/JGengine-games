import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { DamageRuntime } from "@jgengine/core/combat/damageRuntime";
import type { WeaponAmmo, WeaponSystem } from "@jgengine/core/combat/weaponSystem";
import { weaponIntervalMs } from "@jgengine/core/combat/weaponDefinition";
import { distance, depthAt, EXIT, EXIT_REACH, GARAGE, GARAGE_REACH, HOME_SPAWN, inside, lineOfSight, PRINT_ID, PRINT_SPAWN, RECEIVING_BACK_Z, SALVAGE, STASH, STASH_REACH, STEAM, VAULT_SPAWN, walkable, type Point } from "../world";
import { acknowledgeReprint, ageDive, depart, fits, ITEMS, ledgerOf, newDive, newHome, pack, peekLoot, recoverInterrupted, settle, takeLoot, type Dive, type Home, type ItemKind, type Result } from "./state";
import { installRefit, REFITS, type RefitId } from "./progression";
import { buySupply, dismantle } from "./counter";
import { canCache, loadOf } from "./haul";
import { itemValue, kindOf } from "./items";
import { createDeepwardDamage, createDeepwardWeapon, MAGAZINE, weaponDefinition, weaponReadout } from "./combat";
import { openSave, type SaveSession } from "./save";
import { advanceRoute, createNavigator } from "./navigation";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW", "ArrowUp"], moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"], moveRight: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft"],
  deepwardInteract: ["KeyE"], deepwardFire: ["mouse0"], deepwardReload: ["KeyR"], deepwardCache: ["Tab"],
};
/** What a HUD ammo line reads from the held weapon: the shared runtime's own ammo record. */
export interface AmmoReadout {
  loaded: number; capacity: number; reserve: number;
  reloading: boolean; reloadProgress: number;
}
export interface View {
  home: Home; dive: Dive | null; mode: "home" | "dive" | "saving" | "blocked" | "reprinting" | "loading";
  panel: "stash" | "cache" | null; paused: boolean; hint: string; error: string;
  rifleUid: string | null;
  ammo: AmmoReadout | null;
  pending: { kind: Result["kind"]; reason: string } | null;
  trace: { from: Point; to: Point; remaining: number } | null;
}
export const viewStore = defineStore<View>("deepward.session", () => ({ home: newHome(), dive: null, mode: "home", panel: null, paused: false, hint: "Walk to the Garage. E to take the rail to Bellwether.", error: "", pending: null, trace: null, rifleUid: null, ammo: null }));
const runtime = perContext(() => ({ save: null as SaveSession | null, aim: [0, 0, -1] as Point, worldItems: new Map<string, string>(), navigation: createNavigator(), airBeat: -1, damage: null as DamageRuntime | null, weapon: null as WeaponSystem | null, armed: null as string | null, wantShot: false }));
/** Station bed is muted while the game is frozen; it is a retained loop, so only its gain changes. */
const BED_GAIN = 0.45;
const message = (e: unknown): string => e instanceof Error ? e.message : String(e);
export function setAim(ctx: GameContext, direction: Point): void {
  runtime(ctx).aim = direction;
  // The shared weapon aims in yaw/pitch; this is the same camera vector the local shot path read.
  const pitch = Math.asin(Math.max(-1, Math.min(1, direction[1])));
  runtime(ctx).weapon?.setAim(Math.atan2(direction[0], direction[2]), pitch);
}
function playerAt(ctx: GameContext): Point | null { return ctx.scene.entity.get(ctx.player.userId)?.position ?? null; }
function damageOf(ctx: GameContext): DamageRuntime {
  const state = runtime(ctx);
  state.damage ??= createDeepwardDamage(ctx.rng);
  return state.damage;
}
/** The held weapon, retuned to the hand in force so ammo, cadence and reload carry across a swap. */
function arm(ctx: GameContext, dive: Dive): WeaponSystem {
  const state = runtime(ctx), definition = weaponDefinition(dive);
  if (state.weapon === null) {
    state.weapon = createDeepwardWeapon(definition, {
      rng: ctx.rng, damage: damageOf(ctx),
      at: () => playerAt(ctx),
      print: () => viewStore.read(ctx).dive?.print ?? null,
    });
  } else if (state.armed !== definition.id) state.weapon.retune(definition);
  state.armed = definition.id;
  return state.weapon;
}
/** Ammo as a HUD line reads it, from the shared magazine rather than a copy on the dive. */
export function ammoOf(weapon: WeaponSystem): AmmoReadout {
  const ammo: WeaponAmmo = weapon.ammo();
  return {
    loaded: ammo.loaded ?? MAGAZINE, capacity: ammo.capacity ?? MAGAZINE, reserve: ammo.reserve ?? 0,
    reloading: ammo.reload === "reloading", reloadProgress: ammo.reloadFraction,
  };
}
/** A hand swap costs one cycle: the new hand's rate gate restarts, the same wait the L1 had. */
function restartCadence(weapon: WeaponSystem): void {
  const state = weapon.snapshot();
  weapon.restore({ ...state, cadenceElapsedMs: 0, pendingPull: false });
}
/** Forget the dive's weapon: a new Life starts with a fresh magazine in the issued hand. */
function disarm(ctx: GameContext): void {
  const state = runtime(ctx);
  state.weapon?.dispose();
  state.weapon = null; state.armed = null;
}
/**
 * Cool a released trigger. The shared runtime advances its rate gate only while the trigger is down,
 * and this game fires on the press: without this the gun would need to be held before every shot.
 * Removing it needs an engine-side cadence tick on a released trigger, so it is written as the one
 * state edit that does - see the open seam in the PR.
 */
function cool(weapon: WeaponSystem, dt: number): void {
  if (!(dt > 0)) return;
  const state = weapon.snapshot();
  const interval = weaponIntervalMs(weapon.definition());
  if (state.trigger || state.cadenceElapsedMs >= interval) return;
  weapon.restore({ ...state, cadenceElapsedMs: Math.min(interval, state.cadenceElapsedMs + dt * 1000) });
}

function playable(ctx: GameContext): boolean {
  const view = viewStore.read(ctx);
  return !view.paused && view.panel === null && (view.mode === "home" || view.mode === "dive");
}
function ungrab(): void { if (typeof document !== "undefined") document.exitPointerLock?.(); }
function freeze(ctx: GameContext): void { ctx.time.pause(); setGamePhase(ctx, "paused"); ctx.game.audio.setLoop("bed", { gain: 0 }); ungrab(); }
function run(ctx: GameContext): void { setGamePhase(ctx, "playing"); ctx.game.audio.setLoop("bed", { gain: BED_GAIN }); ctx.time.play(); }
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
  disarm(ctx);
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
  const weapon = runtime(ctx).weapon;
  ctx.scene.entity.stats.set(ctx.player.userId, "ammo", { current: dive === null || weapon === null ? MAGAZINE : ammoOf(weapon).loaded });
}
/** The authored depth behind a carried source: a salvage locker keeps its room, a stopped Fitter its own floor. */
function sourceDepth(ctx: GameContext, dive: Dive, source: string, kind: ItemKind): number {
  if (source === "fitter") return depthAt(dive.print.drop ?? dive.print.at, "vault");
  const locker = SALVAGE.find(entry => entry.id === source);
  return locker === undefined ? 1 : depthAt(locker.at, "vault");
}
export function nearby(ctx: GameContext): { label: string; id: string; kind?: ItemKind; at: Point } | null {  const v = viewStore.read(ctx), at = playerAt(ctx);
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
    const rifle = v.rifleUid === null ? null : v.home.stash.find(item => item.id === v.rifleUid && kindOf(item) === "service-rifle") ?? null;
    const home = depart(v.home, v.rifleUid);
    save.commit(home); // A failed departure never enters the vault.
    const dive = newDive(home.activeDive!, home, rifle);
    clearLoot(ctx);
    const ammo = ammoOf(arm(ctx, dive));
    viewStore.write(ctx, { ...v, home, dive, mode: "dive", panel: null, pending: null, error: "", trace: null, rifleUid: null, ammo, hint: rifle === null ? "Bellwether / salvage shift. Empty cache; issue sidearm. The rail behind you is the only way home." : "Bellwether / armed shift. Your banked rifle is now at risk and takes three cache squares. Return it by rail to keep it." });
    teleport(ctx, VAULT_SPAWN);
    for (const loot of SALVAGE) spawnLoot(ctx, loot.id, loot.kind, loot.at, dive.id);
    syncPrint(ctx, dive);
    syncPlayer(ctx, dive);
    ctx.game.audio.play("rail");
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
    if (kind === "extracted") ctx.game.audio.play("banked");
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
    ctx.game.audio.play("terminal");
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
  const pending = peekLoot(dive, target.id, target.kind, sourceDepth(ctx, dive, target.id, target.kind));
  const weight = canCache(dive.cache, pending);
  if (!weight.ok) { ctx.game.notices.push({ text: weight.message, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: weight.message, error: "" })); return; }
  if (pack(dive.cache, pending) === null) {
    const message = `The cache grid has no room for ${ITEMS[target.kind].name}. Tab to repack or leave an item behind.`;
    ctx.game.notices.push({ text: message, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: message, error: "" })); return;
  }
  viewStore.update(ctx, s => ({ ...s, dive: { ...dive, channel: { id: target.id, remaining: 1.4, anchor: at } }, hint: "Searching / stay still. The Fitter can hear you." }));
}
/**
 * Advance the held weapon by `dt` and fold what it fired back into the dive. The shared runtime
 * owns cadence, reload, ammo and the damage call; the game owns the trigger, the world query and
 * what a hit means for the Fitter.
 */
function shoot(ctx: GameContext, dive: Dive, dt: number, hint: string): { dive: Dive; hint: string; trace: View["trace"] } {
  const weapon = arm(ctx, dive);
  cool(weapon, dt);
  const result = weapon.tick(dt);
  if (result.shots.length === 0) return { dive, hint, trace: null };
  ctx.game.audio.play("shot");
  const shot = result.shots[result.shots.length - 1]!;
  const delivery = weapon.definition().delivery;
  const impact = result.impacts[result.impacts.length - 1];
  const landed = impact?.distance ?? (delivery.kind === "hitscan" ? delivery.maxRange : 0);
  const direction = shot.directions[0]!;
  // The tracer ends where the pellet did: on the Fitter, or at the weapon's reach.
  const to: Point = [shot.origin[0] + direction[0] * landed, shot.origin[1] + direction[1] * landed, shot.origin[2] + direction[2] * landed];
  let health = dive.print.health;
  for (const hit of result.impacts) health = Math.max(0, health - hit.resolution.damage);
  const next: Dive = { ...dive, flash: 0.12, channel: null,
    print: { ...dive.print, health, mode: health > 0 ? "calling" as const : "route" as const, drop: health === 0 ? dive.print.at : dive.print.drop } };
  return { dive: next, trace: { from: shot.origin, to, remaining: 0.09 },
    hint: health < dive.print.health ? health === 0 ? "Fitter stopped. Its visible service rifle is yours to carry." : `Hit / Fitter integrity ${health}/80` : "Shot missed / prints follow the sound." };
}
function fire(ctx: GameContext): void {
  const v = viewStore.read(ctx), dive = v.dive;
  if (!playable(ctx) || v.mode !== "dive" || dive === null || dive.health <= 0) return;
  const weapon = arm(ctx, dive);
  if (weapon.ammo().loaded === 0) { ctx.game.notices.push({ text: "Empty magazine / R to reload.", tone: "deny" }); viewStore.update(ctx, s => ({ ...s, ammo: ammoOf(weapon) })); return; }
  // A press fires on the press frame when the gun is ready; a press still cooling is dropped, as before.
  weapon.setTrigger(true);
  const shot = shoot(ctx, dive, 0, v.hint);
  if (!ctx.input.isDown("deepwardFire")) weapon.setTrigger(false);
  viewStore.write(ctx, { ...v, dive: shot.dive, hint: shot.hint, ammo: ammoOf(weapon), trace: shot.trace ?? v.trace });
  if (shot.dive.print.health === 0 && dive.print.health > 0) spawnLoot(ctx, "fitter", "service-rifle", dive.print.at, dive.id);
  syncPrint(ctx, shot.dive);
  syncPlayer(ctx, shot.dive);
}
function reload(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (!playable(ctx) || v.mode !== "dive" || v.dive === null) return;
  const weapon = arm(ctx, v.dive);
  runtime(ctx).wantShot = false;
  if (weapon.reload()) ctx.game.audio.play("reload");
  viewStore.update(ctx, s => ({ ...s, ammo: ammoOf(weapon) }));
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
  ctx.game.commands.define<{ uid: string | null }>("deepward.prepareRifle", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || v.panel !== "stash") return;
    if (input.uid !== null && (!ledgerOf(v.home).canUse(input.uid) || !v.home.stash.some(item => item.id === input.uid && kindOf(item) === "service-rifle"))) {
      viewStore.update(state, s => ({ ...s, error: "That service rifle is no longer banked" })); return;
    }
    viewStore.write(state, { ...v, rifleUid: input.uid, error: "", hint: input.uid === null ? "Salvage shift selected. The rifle stays safe in Marrow; all twelve cache squares are available." : "Armed shift selected. The rifle leaves the stash only when departure is saved. It costs three cache squares and is lost with your Life." });
  } });
  ctx.game.commands.define<{ id: RefitId }>("deepward.refit", { apply(state, input) {
    const v = viewStore.read(state), save = runtime(state).save;
    if (v.mode !== "home" || v.panel !== "stash" || save === null) return;
    try {
      const home = installRefit(v.home, input.id);
      save.commit(home);
      viewStore.write(state, { ...v, home, error: "", hint: `${REFITS[input.id].name} installed. ${REFITS[input.id].effect}. Spent salvage is gone from the stash.` });
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  ctx.game.commands.define<{ kind: ItemKind }>("deepward.buy", { apply(state, input) {
    const v = viewStore.read(state), save = runtime(state).save;
    if (v.mode !== "home" || v.panel !== "stash" || save === null) return;
    try {
      const home = buySupply(v.home, input.kind);
      save.commit(home);
      viewStore.write(state, { ...v, home, error: "", hint: `${ITEMS[input.kind].name} bought at the counter. It is in the stash and survives your death.` });
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  ctx.game.commands.define<{ id: string }>("deepward.dismantle", { apply(state, input) {
    const v = viewStore.read(state), save = runtime(state).save;
    if (v.mode !== "home" || v.panel !== "stash" || save === null) return;
    try {
      const result = dismantle(v.home, input.id);
      save.commit(result.home);
      viewStore.write(state, { ...v, home: result.home, rifleUid: result.home.stash.some(item => item.id === v.rifleUid) ? v.rifleUid : null, error: "",
        hint: `Broken down for ${result.scrip} scrip. The instance is spent; it cannot be prepared or paid for again.` });
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
  // Capture and UI share the stash sheet the world interaction opens.
  ctx.game.commands.define("deepward.enter", { apply(state) { enterFromTitle(state); } });
  ctx.game.commands.define("deepward.openStash", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || v.paused) return;
    viewStore.write(state, { ...v, panel: "stash", paused: true });
  } });
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
  ctx.game.commands.define<{ paused?: boolean }>("deepward.pause", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" && v.mode !== "dive") return;
    if (v.panel !== null) { state.game.commands.run("deepward.close", {}); return; }
    const paused = input.paused ?? !v.paused;
    viewStore.write(state, { ...v, paused, dive: v.dive === null ? null : { ...v.dive, channel: null } });
    if (paused) freeze(state); else run(state);
  } });
  ctx.game.commands.define("deepward.retrySave", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode === "saving" && v.pending !== null) finish(state, v.pending.kind, v.pending.reason);
  } });
  ctx.game.commands.define<{ uid: string; x?: number; y?: number; rotate?: boolean }>("deepward.pack", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.panel !== "cache" || dive === null || v.mode !== "dive") return;
    const item = dive.cache.find(i => i.id === input.uid);
    if (item === undefined) return;
    const next = { ...item, x: input.x ?? item.x, y: input.y ?? item.y, rotated: input.rotate ? !item.rotated : item.rotated };
    if (!Number.isInteger(next.x) || !Number.isInteger(next.y) || !fits(dive.cache, next)) { state.game.notices.push({ text: "That footprint will not fit there.", tone: "deny" }); return; }
    viewStore.write(state, { ...v, dive: { ...dive, cache: dive.cache.map(i => i.id === next.id ? next : i) } });
  } });
  ctx.game.commands.define<{ uid: string }>("deepward.discard", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.panel !== "cache" || dive === null || v.mode !== "dive") return;
    const item = dive.cache.find(i => i.id === input.uid);
    if (item === undefined) return;
    viewStore.write(state, { ...v, dive: { ...dive, cache: dive.cache.filter(i => i.id !== input.uid), hand: kindOf(item) === "service-rifle" ? "sidearm" : dive.hand }, hint: `${ITEMS[kindOf(item)].name} left behind. It cannot be reclaimed this dive.` });
  } });
  ctx.game.commands.define<{ hand: "sidearm" | "service-rifle" }>("deepward.equip", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.mode !== "dive" || dive === null || (input.hand !== "sidearm" && input.hand !== "service-rifle")) return;
    const weapon = arm(state, { ...dive, hand: input.hand });
    if (weapon.ammo().reload !== "idle") return;
    if (input.hand === "service-rifle" && !dive.cache.some(i => kindOf(i) === "service-rifle")) return;
    restartCadence(weapon);
    viewStore.write(state, { ...v, dive: { ...dive, hand: input.hand }, ammo: ammoOf(weapon), hint: "One hand / equipped. Both guns share the same ammo pool." });
  } });
}
export function initialize(ctx: GameContext): void {
  registerControls(ctx);
  ctx.game.audio.loop("bed", "bed");
  ctx.game.audio.setLoop("bed", { gain: BED_GAIN });
  try {
    loadRecord(ctx);
  } catch (error) { viewStore.update(ctx, v => ({ ...v, mode: "blocked", error: message(error) })); }
}

/** Read the on-disk Marrow record into the live view - boot and the title's Continue share it. */
function loadRecord(ctx: GameContext): void {
  if (typeof localStorage === "undefined") throw new Error("Marrow needs browser local storage before a dive can start.");
  const save = openSave(localStorage);
  runtime(ctx).save = save;
  const recovered = recoverInterrupted(save.home);
  if (recovered !== save.home) save.commit(recovered);
  viewStore.update(ctx, v => ({ ...v, home: save.home, dive: null, panel: null, pending: null, error: "", trace: null,
    mode: save.home.reprintPending ? "reprinting" : "home", hint: recovered.last?.reason ?? v.hint }));
}

/** Stand in front of Marrow with the world frozen: nothing runs until a shift is chosen. */
export function openTitle(ctx: GameContext): void {
  ctx.time.pause();
  setGamePhase(ctx, "menu");
  ctx.game.audio.setLoop("bed", { gain: 0 });
  ungrab();
}

/** Leave the title for the loaded record: the rail is live again. */
export function enterFromTitle(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (v.mode === "blocked" || v.mode === "reprinting") return;
  run(ctx);
}

/** Re-read the saved record from disk - the title's Continue reads the document, not a flag. */
export function continueSaved(ctx: GameContext): void {
  try { loadRecord(ctx); }
  catch (error) { viewStore.update(ctx, v => ({ ...v, mode: "blocked", error: message(error) })); }
  const mode = viewStore.read(ctx).mode;
  if (mode === "blocked" || mode === "reprinting") { freeze(ctx); return; }
  run(ctx);
}

export function seatPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("diver", { id: ctx.player.userId, position: HOME_SPAWN, rotationY: Math.PI, role: "player" });
  syncPlayer(ctx, null);
  openTitle(ctx);
  const mode = viewStore.read(ctx).mode;
  if (mode === "blocked" || mode === "reprinting") freeze(ctx);
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
  // Low-air escalation: one chirp every half second once the tank is under 20 seconds.
  const runState = runtime(ctx);
  if (dive.oxygen > 0 && dive.oxygen < 20) {
    const beat = Math.floor(dive.elapsed * 2);
    if (beat !== runState.airBeat) { runState.airBeat = beat; ctx.game.audio.play("lowAir"); }
  } else runState.airBeat = -1;
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
      if (range < 1.9 && p.cooldown === 0) { p.mode = "winding"; p.attack = 0.7; hint = "Fitter raises its rifle / step back!"; ctx.game.audio.play("windup"); }
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
      const depth = sourceDepth(ctx, dive, ch.id, target.kind);
      const looted = takeLoot(dive, ch.id, target.kind, depth);
      const instanceId = runtime(ctx).worldItems.get(ch.id);
      if (looted.ok && instanceId !== undefined && ctx.scene.worldItem.consume(instanceId) !== null) {
        runtime(ctx).worldItems.delete(ch.id);
        dive = looted.dive; hint = `${ITEMS[target.kind].name} in cache. It becomes permanent only after rail return.`;
      }
      else if (!looted.ok) { dive = { ...dive, channel: null }; ctx.game.notices.push({ text: looted.message, tone: "deny" }); }
      else { dive = { ...dive, channel: null }; ctx.game.notices.push({ text: "The cache grid has no space for that footprint.", tone: "deny" }); }
    } else dive = { ...dive, channel: { ...ch, remaining: ch.remaining - dt } };
  }
  let trace = v.trace !== null && v.trace.remaining > dt ? { ...v.trace, remaining: v.trace.remaining - dt } : null;
  let ammo = v.ammo;
  const wasAlive = dive.health > 0;
  if (dive.health > 0) {
    const weapon = arm(ctx, dive);
    ammo = ammoOf(weapon);
    if (playable(ctx)) {
      // Held input is the trigger; the shared runtime decides whether this tick fires.
      weapon.setTrigger(ctx.input.isDown("deepwardFire"));
      const shot = shoot(ctx, dive, dt, hint);
      dive = shot.dive; hint = shot.hint; ammo = ammoOf(weapon);
      if (shot.trace !== null) trace = shot.trace;
      if (dive.print.health === 0 && wasAlive && dive.health > 0) spawnLoot(ctx, "fitter", "service-rifle", p.at, dive.id);
    }
  }
  viewStore.write(ctx, { ...v, dive, hint, trace, ammo });
  syncPrint(ctx, dive); syncPlayer(ctx, dive);
  if (dive.health <= 0) finish(ctx, "lost", dive.oxygen === 0 ? "Tank exhausted. Bellwether kept the carried haul." : "The Life ended in Bellwether. The carried haul was lost.");
}

/** Read-only metrics for the published driver's standalone capture bridge. */
export function captureProbe(ctx: GameContext): Record<string, number> {
  const v = viewStore.read(ctx), at = playerAt(ctx);
  const load = loadOf(v.dive?.cache ?? []);
  return { x: at?.[0] ?? 0, z: at?.[2] ?? 0, inDive: v.mode === "dive" ? 1 : 0,
    reprinting: v.mode === "reprinting" ? 1 : 0, oxygen: v.dive?.oxygen ?? 0,
    tankSeconds: v.dive?.tankSeconds ?? 0, reserve: v.ammo?.reserve ?? 0,
    carried: v.dive?.cache.length ?? 0, stash: v.home.stash.length,
    cacheMass: load.mass, cacheRoom: load.remaining, banked: v.home.bank.banked,
    salvaged: Object.keys(v.home.ledger).length, prepared: v.rifleUid === null ? 0 : 1,
    stashValue: v.home.stash.reduce((sum, item) => sum + itemValue(item), 0),
    tankRefit: v.home.refits.includes("tank") ? 1 : 0, reserveRefit: v.home.refits.includes("reserve") ? 1 : 0,
    deaths: v.home.deaths, returns: v.home.extractions };
}
