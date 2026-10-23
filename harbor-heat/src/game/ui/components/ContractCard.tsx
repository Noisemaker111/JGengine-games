import { HudSurface } from "@jgengine/react/hudSurface";
import { useStore } from "@jgengine/react/store";
import { missionBoard } from "../../missions/missions";

/**
 * The bounty chase card. Deliveries have their own dispatch card (`CourierHud`), so this only draws
 * contracts without one. Both read the mission runtime, which owns the objective and the timer.
 */
export function ContractCard() {
  const board = useStore(missionBoard);
  const view = board.view;
  if (view === null || view.missionId.startsWith("courier_")) return null;
  return (
    <HudSurface className="hh-card w-64" padding="8px 12px" interactive={false}>
      <div className="-mx-3 -mt-2 mb-1 flex items-center justify-between border-b-2 border-black bg-[#c23b3b] px-3 py-1">
        <span className="text-xs font-black uppercase tracking-widest text-white">Bounty</span>
        <span className="tabular-nums text-xs font-black text-white">
          {view.remaining === null ? `${view.step}/${view.steps}` : `${Math.ceil(view.remaining)}s`}
        </span>
      </div>
      <div className="text-xs font-bold text-[#f4e8c8]">{view.title}</div>
      <div className="mt-0.5 flex items-center justify-between text-xs font-bold">
        <span>{view.label}</span>
        {view.count > 0 ? <span className="tabular-nums text-[#ffb020]">{view.counted}/{view.count}</span> : null}
      </div>
    </HudSurface>
  );
}
