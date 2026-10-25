import { useGameStore } from "@jgengine/react/hooks";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useStore } from "@jgengine/react/store";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { bountyPayout, bountyStore } from "../../jobs/bounties";
import { BOUNTY_SPOTS } from "../../world/districts";
import { courierStore } from "../../jobs/courier";
import { cityOf } from "../../cityRuntime";

function BountyCard() {
  const bounty = useStore(bountyStore, (v) => v);
  if (bounty === undefined || bounty.targetId === null) return null;
  const spot = BOUNTY_SPOTS.find((s) => s.id === bounty.spotId);
  return (
    <HudSurface className="hh-card w-64" padding="8px 12px" interactive={false}>
      <div className="-mx-3 -mt-2 mb-1 border-b-2 border-black bg-[#6d2f8f] px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
        Bounty contract
      </div>
      <div className="flex items-center justify-between text-xs font-bold">
        <span>{spot?.label ?? "A marked target"}</span>
        <span className="tabular-nums text-[#ffb020]">${bountyPayout(bounty.completed)}</span>
      </div>
    </HudSurface>
  );
}

interface TrackerView {
  title: string | null;
  text: string;
  counted: number;
  count: number;
  step: number;
  steps: number;
  remaining: number | null;
}

/** What to do next, always: the live job's stage, else the next open story or side job. */
function readTracker(ctx: GameContext): TrackerView | null {
  const world = cityOf(ctx);
  const live = world.missionView();
  if (live !== null) {
    return { title: live.title, text: live.label, counted: live.counted, count: live.count, step: live.step, steps: live.steps, remaining: live.remaining };
  }
  const next = world.next();
  return next === null ? null : { title: null, text: next.text, counted: 0, count: 0, step: 0, steps: 0, remaining: null };
}

const sameTracker = (a: TrackerView | null, b: TrackerView | null) =>
  a === b ||
  (a !== null && b !== null && a.title === b.title && a.text === b.text && a.counted === b.counted && a.step === b.step && Math.floor(a.remaining ?? -1) === Math.floor(b.remaining ?? -1));

export function MissionTracker() {
  const tracker = useGameStore(readTracker, sameTracker);
  const courier = useStore(courierStore);
  if (courier.phase === "running") return null;
  return (
    <div className="flex flex-col gap-2">
      {tracker !== null ? (
        <HudSurface className="hh-card w-64" padding="8px 12px" interactive={false}>
          <div className="-mx-3 -mt-2 mb-1 flex justify-between border-b-2 border-black bg-[#c23b3b] px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
            <span>{tracker.title ?? "Next"}</span>
            {tracker.steps > 1 ? <span className="tabular-nums">{tracker.step}/{tracker.steps}</span> : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs font-bold">
            <span>{tracker.text}</span>
            {tracker.count > 1 ? <span className="tabular-nums text-[#ffb020]">{tracker.counted}/{tracker.count}</span> : null}
            {tracker.remaining !== null ? <span className="tabular-nums text-[#ffb020]">{Math.ceil(tracker.remaining)}s</span> : null}
          </div>
          {tracker.title === null ? <div className="mt-1 text-[10px] uppercase text-[#f4e8c8]/70">[T] phone</div> : null}
        </HudSurface>
      ) : null}
      <BountyCard />
    </div>
  );
}
