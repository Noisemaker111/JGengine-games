import { useStore } from "@jgengine/react/store";

import { residentBoardStore } from "../../world/residents";

/** The town as it feels right now: who is nearby, what they decided to do, and how they feel. */
export function ResidentsPanel() {
  const cards = useStore(residentBoardStore, (value) => value);
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {cards.map((card) => (
        <div key={card.id} className="-skew-x-6 flex items-center gap-2 border-2 border-black bg-[#12141a]/90 px-2 py-0.5 shadow-[2px_2px_0_#000]">
          <span className="text-[11px] font-black uppercase tracking-wide text-[#ffb020]">{card.name}</span>
          <span className="text-[10px] font-black uppercase text-white/70">{card.doing}</span>
          <span className="ml-auto text-[10px] font-black uppercase text-[#33c1b1]">{card.moodLabel}</span>
        </div>
      ))}
    </div>
  );
}
