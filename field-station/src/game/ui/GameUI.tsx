import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { useEntityStat, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { BASE, checkpoint, expedition, SAMPLE_SECONDS, STATIONS, type Expedition } from "../expedition";
import { currentAnnouncement, subscribeAnnouncement } from "../triggers";

const SETTINGS_KEY = "field-station.preferences.v1";
function readPreferences() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"); return { map: s.map !== false, motion: s.motion !== false }; }
  catch { return { map: true, motion: true }; }
}
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function FieldMap({ state, large = false }: { state: Expedition; large?: boolean }) {
  const point = (x: number, z: number) => [22 + (x + 18) * 3.25, 24 + (z + 5) * 3.25];
  const [px, pz] = point(...state.position);
  return <svg viewBox="0 0 180 118" role="img" aria-label="Survey map: water west, wind east, thermal vent southeast; your position is the white triangle" className={large ? "fs-map fs-map-large" : "fs-map"}>
    <defs><pattern id={large ? "field-grid-large" : "field-grid"} width="13" height="13" patternUnits="userSpaceOnUse"><path d="M13 0H0V13" fill="none" stroke="#547466" strokeWidth="0.5" /></pattern></defs>
    <rect width="180" height="118" rx="8" fill="#1b3630" /><rect width="180" height="118" fill={`url(#${large ? "field-grid-large" : "field-grid"})`} />
    <path d="M0 29 Q28 14 37 44 Q27 82 0 88Z" fill="#367e86" />
    <path d="M49 102Q89 89 161 101M45 11Q78 20 149 11" fill="none" stroke="#719179" strokeWidth="1" />
    <path d="M51 60 L100 60 L152 50 M100 60L126 80" stroke="#a6b393" strokeDasharray="3 3" fill="none" />
    {STATIONS.map(station => { const [x, z] = point(station.x, station.z); return <g key={station.id}><circle cx={x} cy={z} r="8" fill={state.collected.includes(station.id) ? "#7ab995" : station.color} /><text x={x} y={z! + 3} textAnchor="middle" fill="#17322c" fontSize="8" fontWeight="800">{state.collected.includes(station.id) ? "✓" : station.number}</text></g>; })}
    <rect x={point(BASE.x, BASE.z)[0]! - 4} y={point(BASE.x, BASE.z)[1]! - 4} width="8" height="8" fill="#ede4c9" />
    <path d={`M${px} ${pz! - 5}l-4 8 4-2 4 2Z`} stroke="#183630" strokeWidth="1" fill="#ffffff" />
    <text x="163" y="17" fill="#d9e1c8" fontSize="8">N ↑</text>
  </svg>;
}
export function GameUI() {
  const ctx = useGameContext();
  const state = useGameStore(c => expedition.read(c));
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const announcement = useSyncExternalStore(subscribeAnnouncement, currentAnnouncement, () => null);
  const [preferences, setPreferences] = useState(readPreferences);
  const [settings, setSettings] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const modal = useRef<HTMLDivElement>(null);
  const run = (command: string) => ctx.game.commands.run(command, {});
  const live = state.phase === "playing";
  const ended = state.phase === "won" || state.phase === "lost";
  const target = STATIONS.find(station => station.id === state.nearest);
  const next = STATIONS.filter(station => !state.collected.includes(station.id)).sort((a, b) => Math.hypot(a.x - state.position[0], a.z - state.position[1]) - Math.hypot(b.x - state.position[0], b.z - state.position[1]))[0];
  useEffect(() => {
    const hide = () => { if (document.hidden) ctx.game.commands.run("survey.pause", {}); };
    const save = () => checkpoint(ctx);
    const key = (event: KeyboardEvent) => {
      if (event.code === "Escape" || event.code === "KeyP") {
        if (settings) { event.preventDefault(); event.stopImmediatePropagation(); setSettings(false); }
        else if (event.target instanceof HTMLElement && event.target.closest(".fs-overlay")) { event.preventDefault(); event.stopImmediatePropagation(); ctx.game.commands.run(state.phase === "paused" ? "survey.resume" : "survey.pause", {}); }
      }
      if (event.code === "Tab" && !live && modal.current) {
        const buttons = Array.from(modal.current.querySelectorAll<HTMLElement>("button, input"));
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", save);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", save); window.removeEventListener("keydown", key, true); };
  }, [ctx, state.phase, settings, live]);
  useEffect(() => { if (!live) modal.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [state.phase, settings, live]);
  const setting = (key: "map" | "motion", value: boolean) => {
    const nextPreferences = { ...preferences, [key]: value }; setPreferences(nextPreferences);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextPreferences)); setStorageError(false); } catch { setStorageError(true); }
  };
  return <div className={`fs-ui ${preferences.motion ? "" : "fs-reduced-motion"}`}>
    {live ? <>
      <header className="fs-topbar"><div><span className="fs-eyebrow">PRAIRIE RESEARCH / SURVEY 07</span><strong>FIELD STATION</strong></div><div className="fs-top-actions"><span className="fs-time">{formatTime(state.elapsed)}</span><button onClick={() => run("survey.pause")} aria-label="Pause expedition">Pause <kbd>P</kbd></button></div></header>
      <aside className="fs-journal"><span className="fs-eyebrow">FIELD LOG / {state.collected.length} OF 3</span><h2>{state.collected.length === 3 ? "Bring the landscape home" : "Read the living landscape"}</h2>
        {STATIONS.map(station => <div className={`fs-station ${state.collected.includes(station.id) ? "fs-complete" : ""}`} key={station.id}><span className="fs-number" style={{ color: station.color }}>{state.collected.includes(station.id) ? "✓" : station.number}</span><div><strong>{station.name}</strong><small>{state.collected.includes(station.id) ? "Reading archived" : station.subject}</small></div></div>)}
        <p className="fs-direction">{state.collected.length === 3 ? "Return to the cyan ring at base." : `${next?.name ?? "Station"} · ${Math.round(state.distance)} m`}</p>
        {preferences.map ? <FieldMap state={state} /> : null}
      </aside>
      <div className={`fs-vitals ${(health?.current ?? 100) < 35 ? "fs-danger" : ""}`}><div><span className="fs-eyebrow">EXPOSURE RESERVE</span><strong>{Math.ceil(health?.current ?? 100)}<small> / 100</small></strong></div><div className="fs-meter"><i style={{ width: `${health?.current ?? 100}%` }} /></div><small>Step clear of the orange ring to recover.</small></div>
      <div className="fs-feedback" role="status" aria-live="polite">{announcement?.message}</div>
      {state.nearest !== null ? <div className="fs-interaction"><span className="fs-eyebrow">{state.nearest === "base" ? "FIELD STATION / UPLINK" : `${target?.number} / ${target?.subject}`}</span><strong>{state.nearest === "base" ? "Archive your field log" : `Read ${target?.name}`}</strong><span>Hold <kbd>E</kbd> or hold the Read button · {SAMPLE_SECONDS} seconds</span><div className="fs-meter"><i style={{ width: `${Math.min(100, state.progress / SAMPLE_SECONDS * 100)}%` }} /></div></div> : <div className="fs-control-hint"><kbd>W A S D</kbd> Walk <span>·</span> Drag to look <span>·</span> <kbd>Space</kbd> Jump</div>}
    </> : <div className="fs-overlay"><div className="fs-sheet" ref={modal} role="dialog" aria-modal="true" aria-labelledby="fs-title">
      <div className="fs-sheet-art"><div className="fs-seal">FS<span>07</span></div><span className="fs-eyebrow">PRAIRIE ENVIRONMENT OBSERVATORY</span><FieldMap state={state} large /><p>Water. Wind. Warm earth.<br />Every reading tells a story.</p><span className="fs-art-credit">Original field equipment & surveyor geometry</span></div>
      <div className="fs-sheet-body">
        <span className="fs-eyebrow">{settings ? "YOUR FIELD KIT" : state.phase === "paused" ? "EXPEDITION ON HOLD" : ended ? "FIELD REPORT / SURVEY 07" : "A SMALL EXPEDITION IN A LIVING WORLD"}</span>
        <h1 id="fs-title">{settings ? "Settings" : state.phase === "paused" ? "Take a breath." : state.phase === "won" ? "Landscape, recorded." : state.phase === "lost" ? "Too close to the heat." : "Field Station"}</h1>
        {settings ? <>
          <p>Keep the tools you need. Changes are saved on this device.</p>
          <label className="fs-setting"><div><strong>Survey map</strong><small>Show the numbered stations and your position.</small></div><input type="checkbox" checked={preferences.map} onChange={e => setting("map", e.target.checked)} /></label>
          <label className="fs-setting"><div><strong>Interface motion</strong><small>Turn off interface transitions.</small></div><input type="checkbox" checked={preferences.motion} onChange={e => setting("motion", e.target.checked)} /></label>
          <p className="fs-note">{storageError ? "Storage is unavailable. These settings apply to this tab." : "Keyboard: WASD walk · drag to look · Space jump · hold E read · P or Esc pause. Touch: left stick walk · drag to look · hold Read."}</p>
          <button className="fs-primary" onClick={() => setSettings(false)}>Back</button>
        </> : <>
          <p>{state.phase === "paused" ? "Movement and exposure are stopped. Your field log is saved; the prairie can wait." : state.phase === "won" ? `All three readings safely archived in ${formatTime(state.elapsed)}. Water, wind and soil now share a place in your field log.` : state.phase === "lost" ? "The thermal vent exhausted your reserve. Step outside its orange boundary to recover between readings. Your last saved log remains available." : "Take a walk through a recovering prairie. Gather readings from three handcrafted instruments, then return to base to archive your survey."}</p>
          {state.phase === "menu" ? <div className="fs-brief"><span>01 / Shoreline</span><span>02 / Prairie mast</span><span>03 / Thermal vent</span><small>Approach an instrument and hold E for 2.5 seconds. Keep moving through the thermal zone.</small></div> : <div className="fs-report"><strong>{state.collected.length} / 3</strong><span>readings collected</span><strong>{formatTime(state.elapsed)}</strong><span>time in the field</span></div>}
          <div className="fs-buttons">
            {state.phase === "paused" ? <button className="fs-primary" onClick={() => run("survey.resume")}>Resume expedition</button> : <button className="fs-primary" onClick={() => { run(ended ? "restart" : "start"); checkpoint(ctx); }}>{ended ? "New expedition" : "Begin expedition"}<span>↗</span></button>}
            {state.hasSave && state.phase !== "paused" ? <button onClick={() => run("survey.continue")}>{state.phase === "won" ? "Reopen field report" : "Continue saved log"}</button> : null}
            <button onClick={() => setSettings(true)}>Settings & controls</button>
            {state.phase !== "menu" ? <button onClick={() => run("survey.menu")}>Return to title</button> : null}
          </div>
          <p className="fs-note">{state.saveStatus || "Field logs save at each reading, on pause and when you leave. No account required."}</p>
        </>}
      </div>
    </div></div>}
  </div>;
}
