import { useEffect, useRef, useState } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { HEROES } from "../entities/players/catalog";
import { ROOMS, ROOM_COUNT } from "../rooms/catalog";
import { CALLOUTS, type CalloutId, duetStore } from "../stores";
import { controlledHero } from "../runtime";
import { DIR_ORDER } from "../types";
import { PREFERENCES_KEY, readCheckpoint, readPreferences, writeCheckpoint, writeLocal } from "../persistence";

const HINTS = [
  "Swap to Anchor. Move onto the amber plate in the upper corridor and drop a weight. Leave it there; send each hero to the matching exit ring.",
  "Lumen starts in line with the receiver. Face east, then plant the prism. It stays behind while both heroes cross the open gates.",
  "Plant Lumen’s prism facing east in the upper lane. Anchor drops a weight on the lower lane’s plate. Each device opens the other hero’s gate.",
  "Plant the prism facing east before crossing the red spikes. Then Anchor’s weight on the lower plate opens Lumen’s road. Keep both devices planted.",
];

export function GameUI() {
  const state = useStore(duetStore, s => s);
  const { commands } = useGame();
  const active = useGameStore(ctx => controlledHero(ctx, ctx.player.userId));
  const canSwap = useGameStore(ctx => ctx.player.possession.listOwned(ctx.player.userId).filter(id => id === "lumen" || id === "anchor").length > 1);
  const [checkpoint, setCheckpoint] = useState(readCheckpoint);
  const [preferences, setPreferences] = useState(readPreferences);
  const [settings, setSettings] = useState(false);
  const [hint, setHint] = useState(false);
  const [saveAvailable, setSaveAvailable] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const room = ROOMS[state.roomIndex] ?? ROOMS[0]!;
  const hero = HEROES[active ?? state.active];
  const completedRelays = state.latch.completedRelays ?? [];
  const nextRelay = room.relays?.find(relay => !completedRelays.includes(relay.id));
  const pendingSignals = nextRelay ? [...nextRelay.plates.filter(id => !state.pressedPlates.includes(id)).map(id => `weight ${id}`),
    ...nextRelay.receivers.filter(id => !state.poweredReceivers.includes(id)).map(id => `light ${id}`)] : [];
  const modal = state.status === "ready" || state.status === "paused" || state.status === "complete";
  const run = (name: string, input: object = {}) => { commands.run(name, input); };

  useEffect(() => { run("duet.motion", { reduced: preferences.reducedMotion }); }, [commands, preferences.reducedMotion]);
  useEffect(() => {
    setHint(false);
    if (state.status !== "playing" && state.status !== "complete") return;
    const next = { version: 1 as const, roomIndex: state.roomIndex, complete: state.status === "complete" };
    setSaveAvailable(writeCheckpoint(next));
    setCheckpoint(readCheckpoint() ?? next);
  }, [state.roomIndex, state.status]);
  useEffect(() => {
    if (!modal) { setSettings(false); return; }
    modalRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [modal, state.status, settings]);
  useEffect(() => {
    const blur = () => { if (state.status === "playing") commands.run("pause", {}); };
    const pauseKey = (event: KeyboardEvent) => {
      if (event.repeat || (event.code !== "Escape" && event.code !== "KeyP")) return;
      if (state.status !== "playing" && state.status !== "paused") return;
      if ((event.target as HTMLElement)?.closest("input, textarea, select")) return;
      event.preventDefault();
      commands.run("pause", {});
    };
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", pauseKey);
    return () => { window.removeEventListener("blur", blur); window.removeEventListener("keydown", pauseKey); };
  }, [commands, state.status]);

  const updatePreference = (name: keyof typeof preferences, value: boolean) => {
    const next = { ...preferences, [name]: value };
    setPreferences(next);
    setSaveAvailable(writeLocal(PREFERENCES_KEY, next));
  };
  const begin = (roomIndex = 0) => { setHint(false); run("duet.start", { roomIndex }); };
  return <div className="rc-ui" data-status={state.status} onKeyDown={event => {
    // Preserve native button activation and Tab focus before the shell consumes gameplay keys.
    if (event.key === "Tab" || ((event.key === " " || event.key === "Enter") && (event.target as HTMLElement).closest("button"))) event.stopPropagation();
  }}>
    <header className="rc-header rc-panel">
      <div><span className="rc-eyebrow">Observatory of the Duet · {state.roomIndex + 1}/{ROOM_COUNT}</span>
        <h1>{room.name}</h1><p>{room.objective}</p></div>
      <button className="rc-quiet" disabled={state.status !== "playing" || active === null} onClick={() => run("pause")} aria-label="Pause and settings">Pause</button>
    </header>
    <div className="rc-signals rc-panel" aria-label="Circuit status">
      {room.plates.length > 0 && <span data-lit={state.pressedPlates.length === room.plates.length}>◆ Weight {state.pressedPlates.length}/{room.plates.length}</span>}
      {room.receivers.length > 0 && <span data-lit={state.poweredReceivers.length === room.receivers.length}>✦ Light {state.poweredReceivers.length}/{room.receivers.length}</span>}
      <span data-lit={state.openGates.length === room.gates.length}>▥ Gates {state.openGates.length}/{room.gates.length}</span>
      <span data-lit={state.exits.length === 2}>◎ Exits {state.exits.length}/2</span>
      {(room.relays?.length ?? 0) > 0 && <span data-lit={completedRelays.length === room.relays!.length}>↔ Relays {completedRelays.length}/{room.relays!.length}</span>}
      {state.recoveries > 0 && <span>↺ Recoveries {state.recoveries}</span>}
    </div>
    {state.status === "playing" && nextRelay && <div className="rc-panel rc-circuit" role="status">
      <strong>{nextRelay.label}</strong><span>{pendingSignals.length ? `Waiting for ${pendingSignals.join(" + ")}` : "Circuit ready — hold both signals."}</span>
    </div>}
    {state.toast && <div className="rc-toast" role="status">{state.toast}</div>}
    {state.status === "solved" && <div className="rc-clear" role="status"><span>Harmony restored</span><strong>Chamber complete</strong></div>}
    {state.status === "playing" && <footer className="rc-footer">
      {active === null ? <div className="rc-hero rc-panel" role="status"><span className="rc-eyebrow">Watching the duet</span><strong>Both hero seats are occupied</strong><p className="rc-hint">Lumen and Anchor control this circuit. Follow their signals and callouts.</p></div> : <div className="rc-hero rc-panel" style={{ borderColor: hero.color }}>
        <span className="rc-eyebrow">Controlling</span><strong style={{ color: hero.color }}>{hero.name}</strong>
        <span className="rc-subtitle">{hero.title}</span>
        {room.roleHints?.[active ?? state.active] && <p className="rc-hint rc-role-hint">{room.roleHints[active ?? state.active]}</p>}
        <button className="rc-primary" disabled={active === null} onClick={() => run("ability")}>{hero.ability} <kbd>E</kbd></button>
        {active === "lumen" && <div className="rc-actions rc-aim" aria-label="Aim prism">{DIR_ORDER.map(dir => <button key={dir} aria-label={`Aim prism ${dir}`} onClick={() => run("ability", { dir })}>{({north:"↑",east:"→",south:"↓",west:"←"})[dir]}</button>)}</div>}
        <div className="rc-actions"><button disabled={!canSwap} onClick={() => run("swap")}>{canSwap ? "Swap hero" : "Your hero seat"} <kbd>Q</kbd></button>
          <button onClick={() => run("reset")}>Reset <kbd>R</kbd></button></div>
        {preferences.showHints && <button className="rc-hint-button" aria-expanded={hint} onClick={() => setHint(!hint)}> {hint ? "Hide clue" : "Need a clue?"}</button>}
        {hint && <p className="rc-hint">{room.hint ?? HINTS[state.roomIndex]}</p>}
        <div className="rc-actions rc-callouts" aria-label="Team callouts">{(Object.keys(CALLOUTS) as CalloutId[]).map(id => <button key={id} disabled={active === null} aria-label={CALLOUTS[id]} onClick={() => run("duet.callout", { id })}>{id === "go" ? "Go!" : id[0]!.toUpperCase() + id.slice(1)}</button>)}</div>
        {state.callout && <p className="rc-hint" role="status">{HEROES[state.callout.hero].name}: {CALLOUTS[state.callout.id]}</p>}
      </div>}
      <div className="rc-pad rc-panel" aria-label="Precision movement">
        <span className="rc-eyebrow">Move · WASD / arrows</span>
        <div><button className="rc-up" disabled={active === null} aria-label="Move north" onClick={() => run("duet.step", { dir: "north" })}>↑</button>
          <button className="rc-left" disabled={active === null} aria-label="Move west" onClick={() => run("duet.step", { dir: "west" })}>←</button>
          <button className="rc-down" disabled={active === null} aria-label="Move south" onClick={() => run("duet.step", { dir: "south" })}>↓</button>
          <button className="rc-right" disabled={active === null} aria-label="Move east" onClick={() => run("duet.step", { dir: "east" })}>→</button></div>
      </div>
    </footer>}
    {modal && <div className="rc-overlay"><div className="rc-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label={settings ? "Settings" : state.status === "ready" ? "Resonant Crossing" : state.status === "paused" ? "Paused" : "Duet complete"}
      onKeyDown={e => {
        if (e.key !== "Tab") return;
        const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
      <div className="rc-emblem" aria-hidden="true"><span>✦</span><span>◆</span></div>
      <span className="rc-eyebrow">{state.status === "complete" ? `${ROOM_COUNT} chambers · one harmony` : "A two-hero puzzle expedition"}</span>
      <h2>{settings ? "Your observatory" : state.status === "ready" ? "Resonant Crossing" : state.status === "paused" ? "Take a breath." : "Two keys, one door."}</h2>
      {settings ? <div className="rc-settings">
        <label><input type="checkbox" checked={preferences.reducedMotion} onChange={e => updatePreference("reducedMotion", e.target.checked)} /> Reduce decorative motion</label>
        <label><input type="checkbox" checked={preferences.showHints} onChange={e => updatePreference("showHints", e.target.checked)} /> Show optional puzzle clues</label>
        <p>Settings and chamber checkpoints stay in this browser. Continuing restarts the saved chamber.</p>
        <button className="rc-primary" onClick={() => setSettings(false)}>Back</button>
      </div> : <>
        <p>{state.status === "ready" ? "Light bends. Weight holds. Guide Lumen and Anchor through a clockwork observatory floating among the stars." : state.status === "paused" ? "Your circuit is held exactly where you left it." : "Lumen and Anchor restored the observatory together. Every crossing needed both."}</p>
        {state.status === "ready" && <div className="rc-intro"><p><b className="rc-cyan">✦ Lumen</b> plants one prism; aiming again relocates it.</p><p><b className="rc-amber">◆ Anchor</b> leaves one weight; dropping again moves it.</p><p>Later circuits need light and weight together. Secure each relay before moving devices. Use Ready, Hold and Go to coordinate; live spikes return you to safe ground.</p><p>Move with WASD, arrows or the direction buttons. Q swaps heroes in solo play, E uses a device. Reach both matching exit rings.</p></div>}
        {state.status === "ready" && checkpoint && !checkpoint.complete && <button className="rc-primary" disabled={active === null} onClick={() => begin(checkpoint.roomIndex)}>Continue · {ROOMS[checkpoint.roomIndex]!.name}</button>}
        <button className={state.status === "ready" && checkpoint && !checkpoint.complete ? "rc-quiet" : "rc-primary"}
          disabled={active === null} onClick={() => state.status === "paused" ? run("pause") : begin()}>{state.status === "paused" ? "Resume expedition" : state.status === "complete" ? "Play again" : "Begin expedition"}</button>
        {active === null && <p role="status">Both hero seats are occupied. You can watch this expedition.</p>}
        {state.status === "paused" && <button className="rc-quiet" disabled={active === null} onClick={() => run("reset")}>Restart this chamber</button>}
        <button className="rc-quiet" onClick={() => setSettings(true)}>Settings</button>
      </>}
      {!saveAvailable && <p role="status">Browser storage is unavailable. You can still play this session.</p>}
      <small>Original observatory geometry and puzzle design. Asset catalog credit: KayKit, by Kay Lousberg (CC0), retained.</small>
    </div></div>}
  </div>;
}
