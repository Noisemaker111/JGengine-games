import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";
import { ExperienceBar, HealthBar, ManaBar, barTokens } from "@jgengine/react/bars";
import { useEntityStat, useGame } from "@jgengine/react/hooks";

import { hudStore, type ArmyUnit, type HudSnapshot } from "../../hudStore";
import { BARRACKS_UNITS, BUILDINGS, COMBATANTS, TRAINABLE } from "../../catalog";
import { UPGRADES, WEAPON_DMG_PER_RANK, ARMOR_REDUCE_PER_RANK } from "../../upgrades";
import { HERO_DMG_PER_LEVEL, THUNDERCLAP_COOLDOWN, THUNDERCLAP_COST } from "../../hero";
import { Icon } from "../icons";
import { Minimap } from "./Minimap";

const BUILD_LABELS: Record<string, string> = { barracks: "Barracks", farm: "Farm", guard_tower: "Guard Tower" };
const UNIT_ICON: Record<string, string> = { footman: "helm", rifleman: "rifleman", peasant: "peasant" };

function useHud(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}

/** Sleek dark-glass panel with a cool steel edge and inset bevel — the shared chrome of the console.
 * Positioning is applied by each caller so the constant never clobbers layout. */
const FRAME = "ec-frame";

/** Thin steel corner brackets — the cool-metal accent that reads as forged, not construction paper. */
function Corners() {
  const base = "pointer-events-none absolute h-2.5 w-2.5 border-sky-300/35";
  return (
    <>
      <span className={base + " left-1 top-1 border-l border-t"} />
      <span className={base + " right-1 top-1 border-r border-t"} />
      <span className={base + " bottom-1 left-1 border-b border-l"} />
      <span className={base + " bottom-1 right-1 border-b border-r"} />
    </>
  );
}

function ResourceChip({ icon, value, tone }: { icon: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon name={icon} className={"h-[18px] w-[18px] drop-shadow " + tone} />
      <span className="min-w-[2.5ch] text-[15px] font-bold tabular-nums text-slate-100">{value}</span>
    </div>
  );
}

/** Top-centre stockpile + both keeps' vitals + the reinforcement clock, in one forged strip. */
function TopBar() {
  const hud = useHud();
  const foodTone = hud.foodUsed + hud.foodReserved >= hud.foodCap ? "text-rose-400" : "text-emerald-300";
  return (
    <div className={"ec-stock pointer-events-none absolute z-20 flex items-center gap-3 px-4 py-2 font-serif text-slate-100 " + FRAME}>
      <Corners />
      <ResourceChip icon="gold" value={String(hud.gold)} tone="text-amber-300" />
      <ResourceChip icon="lumber" value={String(hud.lumber)} tone="text-orange-300" />
      <ResourceChip icon="food" value={`${hud.foodUsed}${hud.foodReserved ? `+${hud.foodReserved}` : ""}/${hud.foodCap}`} tone={foodTone} />
      <div className="mx-1 h-8 w-px bg-slate-500/25" />
      <div className="flex w-32 flex-col gap-0.5" style={barTokens({ height: "10px", health: "#ff7a5c" })}>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-rose-300"><span>Warcamp</span><span className="tabular-nums">{hud.enemyKeepHp}</span></div>
        <HealthBar value={hud.enemyKeepHp} max={hud.enemyKeepMax} fill="#ff7a5c" showValue={false} width="100%" />
      </div>
      <div className="flex w-32 flex-col gap-0.5" style={barTokens({ height: "10px", health: "#7db4ff" })}>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-sky-300"><span>Ember Command</span><span className="tabular-nums">{hud.playerKeepHp}</span></div>
        <HealthBar value={hud.playerKeepHp} max={hud.playerKeepMax} fill="#7db4ff" showValue={false} width="100%" />
      </div>
      <div className="mx-1 h-8 w-px bg-slate-500/25" />
      <div className="flex items-center gap-1.5" title="Marauder reinforcement wave">
        <Icon name="skull" className="h-5 w-5 text-rose-300" />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-bold uppercase tracking-widest text-rose-300/90">Wave {hud.wavesSent}</span>
          <span className="text-[13px] font-bold tabular-nums text-rose-100">{hud.nextWaveIn}s</span>
        </div>
      </div>
    </div>
  );
}

/** Top-left objective card with a collapsible controls crib. */
function ObjectivesPanel() {
  const hud = useHud();
  const [open, setOpen] = useState(true);
  const { commands } = useGame();
  const done = hud.enemyKeepHp <= 0;
  return (
    <div className={"ec-objectives pointer-events-auto absolute left-3 top-3 z-20 w-64 px-3 py-2 font-serif text-slate-100 " + FRAME}>
      <Corners />
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/90">Objectives</span>
        <span className={"text-sky-300/70 transition-transform " + (open ? "rotate-0" : "-rotate-90")}>⌄</span>
      </button>
      {open ? (
        <>
          <div className="mt-1.5 flex items-start gap-2">
            <Icon name="medal" className={"mt-0.5 h-5 w-5 shrink-0 " + (done ? "text-slate-500" : "text-amber-300")} />
            <div className="leading-tight">
              <div className="text-[13px] font-bold text-amber-100">Raze the Marauder Warcamp</div>
              <div className="text-[11px] text-slate-400">Destroy the Warcamp to win</div>
            </div>
          </div>
          <div className="ec-plan">
            <strong>Next threat · {hud.nextWavePlan}</strong>
            <span>{hud.doctrine === "weapons" ? "Iron Weapons · damage +3, speed −5% / rank" : hud.doctrine === "armor" ? "Iron Armor · incoming −2, outgoing −1 / rank" : "Choose one doctrine at the Barracks"}</span>
            <span>{hud.depotCount} depots · return cargo before it counts</span>
            <details><summary>Field logistics</summary><p>Right-click resources to harvest. Return loaded workers to the Keep or a Barracks; death loses cargo. Safe depots heal 6 health for 1 lumber. Footmen deal +25% to grunts; rifles deal +50% to Reavers. Grunts hunt workers; Reavers deal double damage to buildings. Spend on a forward depot or preserve lumber for healing.</p></details>
            {hud.recovery && <button type="button" disabled={hud.recoveryIn > 0 || hud.gold < 100} onClick={() => commands.run("match.recover", {})}>{hud.recoveryIn > 0 ? `Bram downed · recover in ${hud.recoveryIn}s` : "Revive Bram at level 1 · 100 gold"}</button>}
          </div>
          <div className="mt-2 border-t border-slate-500/20 pt-1.5 text-[10px] leading-relaxed text-slate-400">
            <div>Drag to box-select · left-click a unit</div>
            <div>Right-click to move · on an enemy to attack</div>
            <div className="mt-1 text-slate-500">Original Highland miniatures · icons: game-icons.net · full attribution in Credits</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface Tip {
  title: string;
  desc: string;
  chips: { icon: string; text: string }[];
}

/** A single command-card cell: gold vector glyph, corner hotkey, footer line, hover tooltip. */
function Slot({
  icon,
  hotkey,
  foot,
  badge,
  tone,
  tip,
  setTip,
  onClick,
}: {
  icon: string;
  hotkey: string;
  foot?: string;
  badge?: string;
  tone: "ready" | "active" | "locked";
  tip: Tip;
  setTip: (t: Tip | null) => void;
  onClick?: () => void;
}) {
  const shell =
    tone === "locked"
      ? "cursor-not-allowed border-slate-700/60 bg-gradient-to-b from-[#171a20] to-[#0a0c10]"
      : tone === "active"
        ? "border-sky-300 bg-gradient-to-b from-[#1c2b3e] to-[#0a0f16] shadow-[0_0_12px_2px_rgba(90,170,255,.6),inset_0_1px_0_rgba(160,210,255,.4)]"
        : "border-amber-700/50 bg-gradient-to-b from-[#22252d] to-[#0c0e12] hover:border-amber-400/80 hover:shadow-[0_0_10px_1px_rgba(220,180,90,.35)]";
  const iconTone = tone === "locked" ? "text-slate-600" : tone === "active" ? "text-sky-200" : "text-amber-300";
  return (
    <button
      type="button"
      disabled={tone === "locked"}
      onClick={onClick}
      onMouseEnter={() => setTip(tip)}
      onMouseLeave={() => setTip(null)}
      aria-label={tip.title} title={tip.title + " — " + tip.desc}
      onFocus={() => setTip(tip)} onBlur={() => setTip(null)}
      className={"ec-slot relative flex h-[64px] w-[54px] items-center justify-center rounded-md border-2 transition " + shell}
    >
      <Icon name={icon} className={"-mt-2 h-7 w-7 drop-shadow-[0_1px_1px_rgba(0,0,0,.85)] " + iconTone} />
      <span className="absolute left-1 top-0.5 text-[10px] font-black text-slate-200/80 [text-shadow:0_1px_2px_rgba(0,0,0,.95)]">{hotkey}</span>
      <span className="ec-slot-label absolute inset-x-0 bottom-3 text-center text-[8px] font-bold text-amber-100">{({"Attack-Move":"Advance","Guard Tower":"Tower","Rally Point":"Rally","Assault Doctrine":"Assault","Bulwark Doctrine":"Bulwark","Thunder Clap":"Clap","Hold Army":"Hold"} as Record<string,string>)[tip.title.replace(/^(Train|Build) /, "").split(" — ")[0]] ?? tip.title.replace(/^(Train|Build) /, "").split(" — ")[0]}</span>
      {badge !== undefined ? (
        <span className="absolute -right-1 -top-1 rounded-full border border-amber-300/70 bg-slate-950 px-1 text-[9px] font-bold text-amber-200 tabular-nums">{badge}</span>
      ) : null}
      {foot !== undefined ? (
        <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[8px] font-semibold leading-tight text-amber-200/90 [text-shadow:0_1px_1px_rgba(0,0,0,.95)]">{foot}</span>
      ) : null}
    </button>
  );
}

/** A tiny inline resource chip used inside tooltips. */
function TipChip({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <Icon name={icon} className="h-3.5 w-3.5 text-amber-300" />
      <span className="text-amber-100">{text}</span>
    </span>
  );
}

function costFoot(gold?: number, lumber?: number): string {
  return [gold ? String(gold) : "", lumber ? `·${lumber}` : ""].filter(Boolean).join("");
}

function costChips(gold?: number, lumber?: number): { icon: string; text: string }[] {
  const chips: { icon: string; text: string }[] = [];
  if (gold) chips.push({ icon: "gold", text: String(gold) });
  if (lumber) chips.push({ icon: "lumber", text: String(lumber) });
  return chips;
}

function trainTone(hud: HudSnapshot, id: string): "ready" | "locked" {
  const t = TRAINABLE[id];
  if (t === undefined || hud.phase !== "playing") return "locked";
  if (BARRACKS_UNITS.has(id) && !hud.hasBarracks) return "locked";
  if ((t.cost.gold ?? 0) > hud.gold || (t.cost.lumber ?? 0) > hud.lumber) return "locked";
  return hud.foodUsed + hud.foodReserved + (COMBATANTS[id]?.food ?? 0) <= hud.foodCap ? "ready" : "locked";
}

function buildTone(hud: HudSnapshot, type: string): "ready" | "active" | "locked" {
  if (hud.buildArmed === type) return "active";
  const b = BUILDINGS[type];
  if (b === undefined || hud.phase !== "playing") return "locked";
  return (b.cost.gold ?? 0) <= hud.gold && (b.cost.lumber ?? 0) <= hud.lumber ? "ready" : "locked";
}

function researchTone(hud: HudSnapshot, id: string): "ready" | "locked" {
  const up = UPGRADES[id];
  if (up === undefined || (hud.doctrine !== null && hud.doctrine !== id) || hud.phase !== "playing" || !hud.hasBarracks) return "locked";
  const rank = id === "weapons" ? hud.weaponsRank : hud.armorRank;
  const have = id === "weapons" ? hud.weaponsHave : hud.armorHave;
  if (have >= up.maxRank || have > rank) return "locked";
  const c = up.cost(rank);
  return (c.gold ?? 0) <= hud.gold && (c.lumber ?? 0) <= hud.lumber ? "ready" : "locked";
}

function researchFoot(hud: HudSnapshot, id: string): string {
  const up = UPGRADES[id]!;
  const rank = id === "weapons" ? hud.weaponsRank : hud.armorRank;
  const have = id === "weapons" ? hud.weaponsHave : hud.armorHave;
  if (hud.doctrine !== null && hud.doctrine !== id) return "EXCLUDED";
  if (have >= up.maxRank) return "MAX";
  if (have > rank) return "…";
  return costFoot(up.cost(rank).gold, up.cost(rank).lumber);
}

/** The 3×4 gold-glyph command grid — recruit / construct / powers — with a shared hover tooltip. */
function CommandGrid() {
  const hud = useHud();
  const { commands } = useGame();
  const [tip, setTip] = useState<Tip | null>(null);
  const barracksFoot = (id: string) => (hud.hasBarracks ? costFoot(TRAINABLE[id]!.cost.gold, TRAINABLE[id]!.cost.lumber) : "locked");

  return (
    <div className="relative">
      {tip !== null ? (
        <div className={"pointer-events-none absolute bottom-[calc(100%+10px)] right-0 z-30 w-64 px-3 py-2 font-serif " + FRAME}>
          <Corners />
          <div className="text-[13px] font-bold text-amber-200">{tip.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-300">{tip.desc}</div>
          {tip.chips.length > 0 ? (
            <div className="mt-1.5 flex gap-3 text-[11px] font-bold">{tip.chips.map((c) => <TipChip key={c.icon + c.text} icon={c.icon} text={c.text} />)}</div>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-4 grid-rows-3 gap-1.5">
        <Slot icon="peasant" hotkey="1" foot={costFoot(TRAINABLE.peasant!.cost.gold)} tone={trainTone(hud, "peasant")} setTip={setTip} onClick={() => commands.run("train.peasant", {})}
          tip={{ title: "Train Peasant", desc: "Worker — gathers cargo, returns it to a depot, and builds. Death loses cargo.", chips: costChips(TRAINABLE.peasant!.cost.gold, TRAINABLE.peasant!.cost.lumber) }} />
        <Slot icon="footman" hotkey="2" foot={barracksFoot("footman")} tone={trainTone(hud, "footman")} setTip={setTip} onClick={() => commands.run("train.footman", {})}
          tip={{ title: "Train Footman", desc: "Sturdy frontline melee. Requires a Barracks.", chips: costChips(TRAINABLE.footman!.cost.gold, TRAINABLE.footman!.cost.lumber) }} />
        <Slot icon="rifleman" hotkey="3" foot={barracksFoot("rifleman")} tone={trainTone(hud, "rifleman")} setTip={setTip} onClick={() => commands.run("train.rifleman", {})}
          tip={{ title: "Train Rifleman", desc: "Ranged marksman — soft, but strikes from afar. Requires a Barracks.", chips: costChips(TRAINABLE.rifleman!.cost.gold, TRAINABLE.rifleman!.cost.lumber) }} />
        <Slot icon="attackMove" hotkey="R" tone={hud.phase === "playing" ? (hud.attackMoveArmed ? "active" : "ready") : "locked"} setTip={setTip} onClick={() => commands.run("unit.attackMove", {})}
          tip={{ title: "Attack-Move", desc: "Arm, then right-click a destination — the group fights anything it meets on the way.", chips: [] }} />

        <Slot icon="barracks" hotkey="B" foot={costFoot(BUILDINGS.barracks!.cost.gold, BUILDINGS.barracks!.cost.lumber)} tone={buildTone(hud, "barracks")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "barracks" })}
          tip={{ title: "Build Barracks", desc: "Forward depot: accepts cargo; unlocks troops and doctrine. Safe troops heal 6 HP for 1 lumber each second.", chips: costChips(BUILDINGS.barracks!.cost.gold, BUILDINGS.barracks!.cost.lumber) }} />
        <Slot icon="farm" hotkey="G" foot={costFoot(BUILDINGS.farm!.cost.gold, BUILDINGS.farm!.cost.lumber)} tone={buildTone(hud, "farm")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "farm" })}
          tip={{ title: "Build Farm", desc: `Raises your food (supply) cap by ${BUILDINGS.farm!.supply}.`, chips: [...costChips(BUILDINGS.farm!.cost.gold, BUILDINGS.farm!.cost.lumber), { icon: "food", text: `+${BUILDINGS.farm!.supply}` }] }} />
        <Slot icon="tower" hotkey="T" foot={costFoot(BUILDINGS.guard_tower!.cost.gold, BUILDINGS.guard_tower!.cost.lumber)} tone={buildTone(hud, "guard_tower")} setTip={setTip} onClick={() => commands.run("build.arm", { type: "guard_tower" })}
          tip={{ title: "Build Guard Tower", desc: "Defend a route while your army advances. Skirmishers outrange towers; send troops to counter them.", chips: costChips(BUILDINGS.guard_tower!.cost.gold, BUILDINGS.guard_tower!.cost.lumber) }} />
        <Slot icon="rally" hotkey="F" tone={hud.phase === "playing" ? (hud.rallyArmed ? "active" : "ready") : "locked"} setTip={setTip} onClick={() => commands.run("unit.rally", {})} tip={{ title: "Rally Point", desc: "Arm, then right-click where new recruits should gather.", chips: [] }} />

        <Slot icon="weapons" hotkey="Z" badge={hud.weaponsRank > 0 ? String(hud.weaponsRank) : undefined} foot={researchFoot(hud, "weapons")} tone={researchTone(hud, "weapons")} setTip={setTip} onClick={() => commands.run("research.weapons", {})}
          tip={{ title: `${UPGRADES.weapons!.label} — L${hud.weaponsRank}/${UPGRADES.weapons!.maxRank}`, desc: `+${WEAPON_DMG_PER_RANK} damage, −5% movement per rank. Choosing Weapons permanently excludes Armor.`, chips: costChips(UPGRADES.weapons!.cost(hud.weaponsRank).gold, UPGRADES.weapons!.cost(hud.weaponsRank).lumber) }} />
        <Slot icon="armor" hotkey="X" badge={hud.armorRank > 0 ? String(hud.armorRank) : undefined} foot={researchFoot(hud, "armor")} tone={researchTone(hud, "armor")} setTip={setTip} onClick={() => commands.run("research.armor", {})}
          tip={{ title: `${UPGRADES.armor!.label} — L${hud.armorRank}/${UPGRADES.armor!.maxRank}`, desc: `−${ARMOR_REDUCE_PER_RANK} incoming damage, −1 outgoing per rank. Choosing Armor permanently excludes Weapons.`, chips: costChips(UPGRADES.armor!.cost(hud.armorRank).gold, UPGRADES.armor!.cost(hud.armorRank).lumber) }} />
        <Slot icon="thunder" hotkey="C" foot={hud.abilityReady ? "READY" : hud.abilityCd > 0 ? `${hud.abilityCd}s` : "—"} tone={hud.abilityReady ? "active" : "locked"} setTip={setTip} onClick={() => commands.run("hero.ability", {})}
          tip={{ title: "Thunder Clap", desc: "Bram slams the ground, bursting every Marauder around him.", chips: [{ icon: "mana", text: String(THUNDERCLAP_COST) }, { icon: "stopwatch", text: `${THUNDERCLAP_COOLDOWN}s` }] }} />
        <Slot icon="hold" hotkey="V" tone={hud.phase === "playing" ? "ready" : "locked"} setTip={setTip} onClick={() => commands.run("unit.hold", {})} tip={{ title: "Hold Army", desc: "All combat troops stop and attack only enemies within weapon reach. Workers keep harvesting.", chips: [] }} />
      </div>
    </div>
  );
}

/** Framed hero crest with level pip, HP/mana/XP bars, and a commander stat line (damage · armor · speed). */
function HeroPanel() {
  const hud = useHud();
  const hp = useEntityStat("hero", "health");
  const mana = useEntityStat("hero", "mana");
  const xp = useEntityStat("hero", "xp");
  const alive = hp !== null && hp.current > 0;
  const dmg = (COMBATANTS.hero?.damage ?? 24) + (hud.heroLevel - 1) * HERO_DMG_PER_LEVEL + hud.weaponsRank * WEAPON_DMG_PER_RANK - hud.armorRank;
  const armor = hud.armorRank * ARMOR_REDUCE_PER_RANK;
  return (
    <div className="flex items-center gap-3">
      <div className={"relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-md border-2 " + (alive ? "border-amber-500/70" : "border-slate-700")}>
        <div className={"flex h-full w-full items-center justify-center " + (alive ? "bg-gradient-to-b from-[#3a3320] via-[#191b22] to-[#0a0c10]" : "bg-slate-900/80")}>
          <Icon name={alive ? "helm" : "skull"} className={"h-11 w-11 " + (alive ? "text-amber-300" : "text-slate-600")} />
        </div>
        <span className="absolute -bottom-px left-0 flex h-5 w-5 items-center justify-center rounded-tr-md border-r border-t border-amber-300/70 bg-slate-950/90 text-[11px] font-black text-amber-200 tabular-nums">{hud.heroLevel}</span>
      </div>
      <div className="flex w-40 flex-col gap-1" style={barTokens({ height: "12px", health: "#5cd66a", mana: "#5fa8ff", xp: "#e0c04a" })}>
        <span className="text-[13px] font-bold text-amber-200 [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">Bram the Bold</span>
        {hp !== null ? <HealthBar value={hp.current} max={hp.max} fill="#5cd66a" width="100%" /> : null}
        {mana !== null ? <ManaBar value={mana.current} max={mana.max} fill="#5fa8ff" width="100%" /> : null}
        {xp !== null && alive ? (
          <div style={barTokens({ height: "6px", xp: "#e0c04a" })}>
            <ExperienceBar value={xp.current} max={xp.max} fill="#e0c04a" showValue={false} width="100%" />
          </div>
        ) : null}
        <div className="mt-0.5 flex items-center gap-3 text-[11px] font-bold text-slate-200">
          <span className="flex items-center gap-1"><Icon name="footman" className="h-3.5 w-3.5 text-amber-300/90" />{dmg - 3}-{dmg + 6}</span>
          <span className="flex items-center gap-1"><Icon name="shield" className="h-3.5 w-3.5 text-sky-300/90" />{armor}</span>
          <span className="flex items-center gap-1"><Icon name="boots" className="h-3.5 w-3.5 text-emerald-300/90" />{(1 - hud.weaponsRank * 0.05).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

/** The army row: a live crest + health bar per fielded unit, capped with a +N overflow. */
function ArmyRow() {
  const hud = useHud();
  const shown = hud.army.slice(0, 6);
  const overflow = hud.army.length - shown.length;
  if (hud.army.length === 0) {
    return <div className="flex h-full items-center px-2 text-[11px] italic text-slate-500">No troops afield — train Footmen (2)</div>;
  }
  return (
    <div className="flex h-full flex-nowrap items-center gap-1 overflow-hidden">
      {shown.map((u: ArmyUnit) => (
        <div key={u.id} className="flex w-9 flex-col items-center gap-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-amber-700/50 bg-gradient-to-b from-[#20242c] to-[#0b0d11]">
            <Icon name={UNIT_ICON[u.kind] ?? "footman"} className="h-6 w-6 text-amber-200/90" />
          </div>
          <div style={barTokens({ height: "4px", health: "#5cd66a" })} className="w-full">
            <HealthBar value={u.hp} max={u.max} fill="#5cd66a" showValue={false} width="100%" />
          </div>
        </div>
      ))}
      {overflow > 0 ? <div className="flex h-9 items-center px-1 text-[11px] font-bold text-amber-200">+{overflow}</div> : null}
    </div>
  );
}

/** A vertical strip of map glyphs beside the minimap — the commander map-controls column (display-only). */
function MapControls() {
  const glyphs = ["medal", "helm", "attackMove", "tower"];
  return (
    <div className="flex flex-col gap-1">
      {glyphs.map((g) => (
        <div key={g} className="flex h-6 w-6 items-center justify-center rounded border border-slate-600/50 bg-slate-900/70">
          <Icon name={g} className="h-3.5 w-3.5 text-sky-300/70" />
        </div>
      ))}
    </div>
  );
}

function ProductionLine() {
  const hud = useHud();
  const bits: string[] = [];
  if (hud.producing > 0) bits.push(`Training ×${hud.producing}`);
  if (hud.building > 0) bits.push(`Building ×${hud.building}`);
  if (hud.researching > 0) bits.push(`Research ×${hud.researching}`);
  if (bits.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-[10px] font-semibold text-amber-200/90">
      {bits.map((b) => <span key={b}>{b}</span>)}
      {hud.producing > 0 ? (
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/60"><div className="h-full bg-amber-400" style={{ width: `${Math.round(hud.trainProgress * 100)}%` }} /></div>
      ) : null}
    </div>
  );
}

/** The bottom console: minimap, hero, fielded army and command grid. */
function Console() {
  const hud = useHud();
  return (
    <div className="ec-console pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 px-2 pb-1 font-serif">
      {/* Minimap cluster */}
      <div className={"ec-map-panel pointer-events-auto relative flex items-stretch gap-2 p-2 " + FRAME}>
        <Corners />
        <MapControls />
        <div className="relative rounded border border-slate-600/50 bg-black/50 p-1">
          <Minimap />
          <span className="pointer-events-none absolute right-1 top-1 text-[9px] font-bold text-sky-200/70">N</span>
        </div>
      </div>

      {/* Hero + army */}
      <div className={"ec-hero-panel pointer-events-auto relative flex flex-col gap-1.5 p-2.5 " + FRAME}>
        <Corners />
        <HeroPanel />
        <div className="h-px w-full bg-slate-500/20" />
        <div className="ec-army h-[46px] w-[19rem]"><ArmyRow /></div>
        <ProductionLine />
      </div>

      {/* Command grid */}
      <div className={"pointer-events-auto relative p-2.5 " + FRAME}>
        <Corners />
        <CommandGrid />
      </div>

      {hud.buildArmed !== null ? (
        <div className="ec-build-mode pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 rounded-md border-2 border-sky-300/70 bg-sky-500/90 px-3 py-1 text-xs font-bold text-slate-950 shadow-lg">
          Right-click your side of the field to place the {BUILD_LABELS[hud.buildArmed] ?? "building"}
        </div>
      ) : null}
    </div>
  );
}

export function RtsHud(): ReactNode {
  const hud = useHud();
  return (
    <>
      <TopBar />
      <ObjectivesPanel />
      <Console />
      <div className={"ec-field-report" + (hud.buildArmed || hud.rallyArmed || hud.attackMoveArmed ? " ec-report-raised" : "")} role="status" aria-live="polite">{hud.notice}</div>
      {(hud.rallyArmed || hud.attackMoveArmed) && <div className="ec-order-mode">{hud.rallyArmed ? "Rally point" : "Attack-move"} · Right-click a destination · Esc to cancel</div>}
    </>
  );
}
