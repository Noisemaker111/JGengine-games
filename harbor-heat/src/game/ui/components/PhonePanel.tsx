import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useStore } from "@jgengine/react/store";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { cityOf, phoneStore } from "../../cityRuntime";

function readPhone(ctx: GameContext) {
  const world = cityOf(ctx);
  const factions = Object.entries(world.def.factions ?? {}).map(([id, faction]) => ({
    id,
    label: faction.label ?? id,
    mood: Math.round(world.num(`${id}.mood`)),
  }));
  return { contacts: world.contacts(), news: [...world.log()].reverse().slice(0, 4), factions };
}

const moodWord = (mood: number) => (mood <= -40 ? "furious" : mood <= -10 ? "angry" : mood >= 20 ? "friendly" : "calm");

/** The phone is a read of the city: contacts and their current line, open jobs, faction moods and the news. */
export function PhonePanel() {
  const open = useStore(phoneStore, (v) => v === true);
  const { commands } = useGame();
  const phone = useGameStore((ctx) => (open ? readPhone(ctx) : null));
  if (!open || phone === null) return null;
  return (
    <HudSurface className="hh-card pointer-events-auto w-80" padding={0}>
      <div className="flex items-center justify-between border-b-2 border-black bg-[#12141a] px-3 py-2 text-xs font-black uppercase tracking-widest text-[#ffb020]">
        <span>Phone</span>
        <span className="text-[10px] text-white/60">[T] close</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {phone.contacts.map((contact) => (
          <div key={contact.id} className="border-2 border-black bg-[#f4e8c8] px-2 py-1 text-[#1b1e26]">
            <div className="text-xs font-black uppercase text-[#c23b3b]">{contact.name}</div>
            <div className="text-xs font-semibold italic">&ldquo;{contact.line ?? "..."}&rdquo;</div>
            {contact.jobs
              .filter((job) => job.status !== "done")
              .map((job) => (
                <div key={job.id} className="mt-1 flex items-center justify-between text-[11px] font-bold uppercase">
                  <span>{job.title}</span>
                  <span className={job.status === "failed" ? "text-[#c23b3b]" : "text-[#2f8f4e]"}>
                    {job.status === "active" ? "on it" : job.status === "failed" ? "retry" : "open"}
                  </span>
                </div>
              ))}
          </div>
        ))}
        <div className="border-t-2 border-black/40 pt-1 text-[10px] font-black uppercase tracking-widest text-[#ffb020]">Street</div>
        {phone.factions.map((faction) => (
          <div key={faction.id} className="flex justify-between text-xs font-bold text-[#f4e8c8]">
            <span>{faction.label}</span>
            <span className="tabular-nums">
              {moodWord(faction.mood)} ({faction.mood})
            </span>
          </div>
        ))}
        {phone.news.length > 0 ? (
          <div className="border-t-2 border-black/40 pt-1 text-[10px] font-black uppercase tracking-widest text-[#ffb020]">News</div>
        ) : null}
        {phone.news.map((entry, i) => (
          <div key={`${entry.at}-${i}`} className="text-xs font-semibold text-[#f4e8c8]">
            {entry.text}
          </div>
        ))}
        <HudButton onClick={() => commands.run("phone", {})} className="hh-street-button mt-1">
          Put away
        </HudButton>
      </div>
    </HudSurface>
  );
}
