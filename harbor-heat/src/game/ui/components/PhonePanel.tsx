import type { CSSProperties } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { KitButton, KitPanel, useActionGlyph } from "@jgengine/react/uiKitRoot";
import { cityOf, phoneStore } from "../../cityRuntime";

function readPhone(ctx: GameContext) {
  const world = cityOf(ctx);
  const factions = Object.entries(world.def.factions ?? {}).map(([id, faction]) => ({ id, label: faction.label ?? id, mood: Math.round(world.num(`${id}.mood`)) }));
  return { contacts: world.contacts(), news: [...world.log()].reverse().slice(0, 4), factions };
}

const moodWord = (mood: number) => (mood <= -40 ? "furious" : mood <= -10 ? "angry" : mood >= 20 ? "friendly" : "calm");
const HEAD: CSSProperties = { margin: "10px 0 4px", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--kit-bad)" };
const ROW: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 };

/** The phone is a read of the city: contacts and their current line, open jobs, faction moods and the news. */
export function PhonePanel() {
  const open = useStore(phoneStore, (v) => v === true);
  const { commands } = useGame();
  const glyph = useActionGlyph("phone", "T");
  const phone = useGameStore((ctx) => (open ? readPhone(ctx) : null), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  if (phone === null) return null;
  return (
    <KitPanel variant="card" title="Phone" style={{ width: "min(22rem, 88vw)", maxHeight: "70vh", overflowY: "auto", textTransform: "none" }} footer={<KitButton size="sm" glyph={glyph} onClick={() => commands.run("phone", {})}>Put away</KitButton>}>
      {phone.contacts.map((contact) => (
        <div key={contact.id} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--kit-font-display)", fontSize: 16, textTransform: "uppercase" }}>{contact.name}</div>
          <div style={{ fontSize: 13, fontStyle: "italic" }}>&ldquo;{contact.line ?? "..."}&rdquo;</div>
          {contact.jobs.filter((job) => job.status !== "done").map((job) => (
            <div key={job.id} style={ROW}>
              <span>{job.title}</span>
              <span style={{ color: job.status === "failed" ? "var(--kit-bad)" : "var(--kit-good)" }}>{job.status === "active" ? "on it" : job.status === "failed" ? "retry" : "open"}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={HEAD}>Street</div>
      {phone.factions.map((faction) => <div key={faction.id} style={ROW}><span>{faction.label}</span><span>{moodWord(faction.mood)} ({faction.mood})</span></div>)}
      {phone.news.length > 0 ? <div style={HEAD}>News</div> : null}
      {phone.news.map((entry, i) => <div key={`${entry.at}-${i}`} style={{ fontSize: 13 }}>{entry.text}</div>)}
    </KitPanel>
  );
}

/** The phone on the HUD, so a touch screen can reach it too. */
export function PhoneButton() {
  const { commands } = useGame();
  return <KitButton size="sm" glyph={useActionGlyph("phone", "T")} onClick={() => commands.run("phone", {})}>Phone</KitButton>;
}
