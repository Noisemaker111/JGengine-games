import { useState, useEffect } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import {
  BUILDABLES,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type BuildCategory,
} from "../../objects/catalog";
import { MILESTONES } from "../../catalog";
import { session } from "../../session";

function unlockLabel(requires: string): string {
  const m = MILESTONES.find((x) => x.unlock === requires);
  return m === undefined ? "locked" : `Rating ${m.rating}`;
}

export function BuildBar() {
  const [category, setCategory] = useState<BuildCategory>("ride");
  const { commands } = useGame();
  const cash = useGameStore(() => session.cash);
  const selected = useGameStore(() => session.selectedTool);
  const unlocked = useGameStore((ctx) =>
    (ctx.game.unlocks?.list(ctx.player.userId) ?? []).join(","),
  );
  const unlockedSet = new Set(unlocked.length === 0 ? [] : unlocked.split(","));
  useEffect(()=>{ if(selected&&BUILDABLES[selected]) setCategory(BUILDABLES[selected]!.category); },[selected]);

  const items = Object.values(BUILDABLES).filter((d) => d.category === category);

  return (
    <div className="park-catalog">
      <div className="flex gap-1 rounded-lg border border-white/10 bg-slate-900/85 p-1 shadow-lg backdrop-blur">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            aria-label={CATEGORY_LABEL[c]}
            aria-pressed={category===c}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition ${
              category === c ? "bg-amber-400 text-slate-900" : "text-slate-200 hover:bg-slate-700"
            }`}
            onClick={() => setCategory(c)}
          >
            <span>{CATEGORY_ICON[c]}</span>
            <span className="hidden sm:inline">{CATEGORY_LABEL[c]}</span>
          </button>
        ))}
      </div>

      <div className="flex max-w-[92vw] flex-wrap justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/85 p-2 shadow-2xl backdrop-blur">
        {items.map((def) => {
          const locked = def.requires !== undefined && !unlockedSet.has(def.requires);
          const affordable = cash >= def.cost;
          const isSelected = selected === def.id;
          const disabled = locked;
          return (
            <button
              key={def.id}
              disabled={disabled}
              aria-pressed={isSelected}
              className={`pointer-events-auto flex w-[92px] flex-col items-center gap-0.5 rounded-lg border-2 p-2 text-center transition ${
                isSelected
                  ? "border-amber-400 bg-amber-400/15"
                  : locked
                    ? "border-white/5 bg-slate-800/60 opacity-60"
                    : "border-white/10 bg-slate-800/80 hover:border-amber-300/60"
              }`}
              onClick={() => commands.run("build.select", { id: def.id })}
              title={def.blurb}
            >
              <span className="text-2xl leading-none">{locked ? "🔒" : def.icon}</span>
              <span className="text-[11px] font-bold leading-tight text-slate-100">{def.label}</span>
              {locked ? (
                <span className="text-[9px] font-semibold text-slate-400">{unlockLabel(def.requires!)}</span>
              ) : (
                <span
                  className={`font-mono text-[11px] font-bold ${affordable ? "text-emerald-300" : "text-rose-400"}`}
                >
                  ${def.cost}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="park-build-hint">
        {selected ? <><span>Place {BUILDABLES[selected]?.label} · green plots are buildable</span><button onClick={()=>commands.run("build.clear", {})}>Cancel ×</button></> : <span>Choose a blueprint · click a structure to inspect · P pauses</span>}
      </div>
    </div>
  );
}
