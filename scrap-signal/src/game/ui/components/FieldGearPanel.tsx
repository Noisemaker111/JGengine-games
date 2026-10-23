import { useGame } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { useStore } from "@jgengine/react/store";
import { RARITY_COLORS } from "../../palette";
import { fieldGearStore } from "../../items/fieldGear";

const STAT_LABEL: Record<string, string> = {
  damage: "damage",
  fireIntervalMs: "fire rate",
  spread: "spread",
  critChance: "crit",
  magSize: "mag",
  reloadMs: "reload",
};

function shown(stat: string, delta: number): string {
  if (stat === "critChance") return `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`;
  if (stat === "fireIntervalMs" || stat === "reloadMs") return `${delta > 0 ? "+" : ""}${Math.round(delta)}ms`;
  return `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`;
}

export function FieldGearPanel() {
  const { commands } = useGame();
  const view = useStore(fieldGearStore);
  if (view === null) return null;
  const color = RARITY_COLORS[view.rarity as keyof typeof RARITY_COLORS] ?? "#d6d3d1";
  return (
    <div className="w-72 border-2 bg-black/80 p-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.8)]" style={{ borderColor: color }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">Field stash</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          {view.runMass}/{view.runMass + Math.max(0, view.remaining)} carry
        </span>
      </div>
      <div className="mt-1 text-sm font-black uppercase leading-tight" style={{ color }}>
        {view.name}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">
        lvl {view.level} {view.rarity} {view.manufacturer}
      </div>
      <div className="mt-1.5 border-t border-stone-700/70 pt-1.5">
        {view.deltas.map((delta) => (
          <div key={delta.stat} className="flex justify-between text-[11px] font-semibold leading-snug">
            <span className="text-stone-400">{STAT_LABEL[delta.stat] ?? delta.stat}</span>
            <span
              className={
                delta.better === "candidate" ? "text-emerald-300" : delta.better === "equipped" ? "text-rose-300" : "text-stone-400"
              }
            >
              {shown(delta.stat, delta.delta)}
            </span>
          </div>
        ))}
      </div>
      {view.affixes.length > 0 ? (
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
          {view.affixes.join(" / ")}
        </div>
      ) : null}
      <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-stone-400">
        {view.better === "candidate" ? "Upgrade" : view.better === "equipped" ? "Worn gun is better" : "Sidegrade"}
      </div>
      <div className="mt-1.5 flex gap-1">
        <HudButton
          block
          disabled={!view.carried}
          onClick={() => commands.run("loot.equip", { dropId: view.dropId })}
          className="scrap-row scrap-row-amber"
        >
          Equip
        </HudButton>
        <HudButton block onClick={() => commands.run("loot.salvage", { dropId: view.dropId })} className="scrap-row">
          Salvage
        </HudButton>
        <HudButton block disabled={!view.carried} onClick={() => commands.run("loot.bank", {})} className="scrap-row">
          Bank
        </HudButton>
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        Stash {view.stash.length}
        {view.stash.length > 0 ? ` - ${view.stash.slice(-2).join(", ")}` : " - empty"}
      </div>
    </div>
  );
}
