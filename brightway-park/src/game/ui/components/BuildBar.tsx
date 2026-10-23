import { useState, useEffect } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

import {
  BUILDABLES,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type BuildCategory,
} from "../../objects/catalog";
import { MILESTONES } from "../../milestones";
import { session } from "../../session";
import { placementHintStore } from "../../build/placementHint";
import { useStore } from "@jgengine/react/store";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";

function unlockLabel(requires: string): string {
  const m = MILESTONES.find((x) => x.unlock === requires);
  return m === undefined ? "locked" : `Rating ${m.rating}`;
}

export function BuildBar({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<BuildCategory>("ride");
  const { commands } = useGame();
  const cash = useGameStore(() => session.cash);
  const selected = useGameStore(() => session.selectedTool);
  const refusal = useStore(placementHintStore);
  const tracks = useGameStore(() => [...session.placed.values()].filter(obj => obj.catalogId === "track_piece").length);
  const unlocked = useGameStore((ctx) =>
    (ctx.game.unlocks?.list(ctx.player.userId) ?? []).join(","),
  );
  const unlockedSet = new Set(unlocked.length === 0 ? [] : unlocked.split(","));
  useEffect(()=>{ if(selected&&BUILDABLES[selected]) setCategory(BUILDABLES[selected]!.category); },[selected]);

  const items = Object.values(BUILDABLES).filter((d) => d.category === category);
  const blueprint = selected === null ? undefined : BUILDABLES[selected];

  return (
    <div className="park-catalog">
      <HudSurface className="flex gap-1" role="toolbar" aria-label="Blueprint categories">
        {CATEGORY_ORDER.map((c) => (
          <HudButton
            key={c}
            variant="ghost"
            size="sm"
            aria-label={CATEGORY_LABEL[c]}
            aria-pressed={category===c}
            onClick={() => setCategory(c)}
          >
            <span>{CATEGORY_ICON[c]}</span>
            <span className="hidden sm:inline">{CATEGORY_LABEL[c]}</span>
          </HudButton>
        ))}
        <HudButton
          variant="ghost"
          size="sm"
          className="park-build-close"
          aria-label="Close build palette"
          title="Close the catalog (B reopens it)"
          cue="close"
          onClick={onClose}
        >×</HudButton>
      </HudSurface>

      <HudSurface className="flex max-w-[92vw] flex-wrap justify-center gap-2" role="group" aria-label="Blueprints">
        {items.map((def) => {
          const locked = def.requires !== undefined && !unlockedSet.has(def.requires);
          const affordable = cash >= def.cost;
          const isSelected = selected === def.id;
          const disabled = locked;
          return (
            <HudButton
              key={def.id}
              disabled={disabled}
              aria-pressed={isSelected}
              className="flex-col text-center"
              onClick={() => commands.run("build.select", { id: def.id })}
              title={def.blurb}
            >
              <span className="text-2xl leading-none">{locked ? "🔒" : def.icon}</span>
              <span className="text-[11px] font-bold leading-tight text-slate-100">{def.label}</span>
              {locked ? (
                <span className="text-[11px] font-semibold text-amber-200">{unlockLabel(def.requires!)}</span>
              ) : (
                <span
                  className={`font-mono text-[11px] font-bold ${affordable ? "text-emerald-300" : "text-rose-400"}`}
                >
                  ${def.cost}
                </span>
              )}
            </HudButton>
          );
        })}
      </HudSurface>

      {blueprint !== undefined ? <HudSurface className="max-w-[92vw] text-xs" padding="8px 12px" role="status">
        <div>{blueprint.label} · ${blueprint.cost} to build · ${blueprint.upkeep} / day{cash < blueprint.cost ? " · Not enough cash" : ""}</div>
        {blueprint.ride !== undefined ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <span>Intensity {rideThrill(blueprint.id, tracks).toFixed(1)}</span>
          {["guest_a", "guest_c", "guest_d"].map(kind => <span key={kind}>{guestRidePreference(kind).label}: {Math.round(rideFit(kind, blueprint.id, tracks) * 100)}% fit</span>)}
        </div> : null}
      </HudSurface> : null}

      <div className="park-build-hint">
        {selected ? <><span>Place {BUILDABLES[selected]?.label} · {refusal ?? "click a green spot to build"}</span><HudButton variant="ghost" size="sm" cue="close" onClick={()=>commands.run("build.clear", {})}>Cancel ×</HudButton></> : <span>Choose a blueprint · click a structure or guest to inspect · B hides this catalog · P pauses</span>}
      </div>
    </div>
  );
}
