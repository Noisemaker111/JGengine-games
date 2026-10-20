import { useCurrency, useQuestJournal } from "@jgengine/react/hooks";
import { quests } from "../../quests/catalog";
import { FERRALON } from "../../palette";
import { enemies } from "../../entities/enemies/catalog";

/**
 * The tracker's space is the left HUD column, shared with the contract card and Echo. One full card
 * carries the current objective; any other active quest collapses to a title line so the column does
 * not cover the crash-site set dressing.
 */
export function splitTrackedQuests<T>(active: readonly T[]): { primary: T | undefined; others: readonly T[] } {
  return { primary: active[0], others: active.slice(1) };
}

export function MissionTracker() {
  const journal = useQuestJournal();
  const active = journal.filter((entry) => entry.status === "active");
  if (active.length === 0) {
    return (
      <div className="max-w-[16rem] border-l-4 border-amber-400 bg-black/60 px-3 py-2 text-[13px] font-bold uppercase tracking-wider text-stone-300">
        All missions complete — Ferralon is (briefly) quiet
      </div>
    );
  }
  const { primary, others } = splitTrackedQuests(active);
  const primaryDef = quests.find((quest) => quest.id === primary?.questId);
  return (
    <div className="flex max-w-[17rem] flex-col gap-2">
      {primary !== undefined && primaryDef !== undefined ? (
        <div key={primary.questId} className="border-l-4 border-amber-400 bg-black/60 px-3 py-2">
          <div className="text-xs font-black uppercase tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {primaryDef.title}
          </div>
          <p className="mb-1 text-[13px] leading-snug text-stone-300">{primaryDef.description}</p>
          {primary.objectives.map((objective) => (
            <div key={objective.id} className="flex justify-between text-[13px] font-semibold text-stone-200">
              <span>Defeat {enemies.find((enemy) => enemy.id === primaryDef.objectives.find((goal) => goal.id === objective.id)?.target)?.name ?? "hostiles"}</span>
              <span className="tabular-nums">
                {Math.min(objective.progress, objective.count)} / {objective.count}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {others.length > 0 ? (
        <div className="flex flex-col gap-1 border-l-4 border-amber-400/60 bg-black/50 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-amber-200/80">
          {others.map((entry) => {
            const def = quests.find((quest) => quest.id === entry.questId);
            return def === undefined ? null : <span key={entry.questId}>+ {def.title}</span>;
          })}
        </div>
      ) : null}
    </div>
  );
}

export function CashPlate() {
  const cash = useCurrency("cash");
  return (
    <div className="flex skew-x-[-8deg] items-baseline gap-1 border-2 border-black/80 bg-black/70 px-3 py-1">
      <span className="text-sm font-black" style={{ color: FERRALON.hudXp }}>
        $
      </span>
      <span className="text-lg font-black tabular-nums text-stone-50">{cash}</span>
    </div>
  );
}

export function CreditBadge() {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-sm bg-black/50 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.3em] text-stone-300">
      SCRAP SIGNAL
    </div>
  );
}
