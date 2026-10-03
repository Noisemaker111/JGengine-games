import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "../../style.css";
import { SettingsTrigger } from "@jgengine/react";
import { useSettings } from "@jgengine/react/settings";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { fieldkitVars } from "@/components/ui/jg-theme";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runSessionStore, type RunSession, type SessionSnapshot } from "../run/session";
import { ROUTE_GATES, gateAdvice } from "../route/gates";
import { PICKUPS } from "../run/pickups";
import { partById, PART_SLOTS } from "../parts/catalog";
import { driveInputStore } from "../run/store";
import { Credits } from "./components/Credits";
import { StartScreen } from "./components/StartScreen";
import { RunResults } from "./components/RunResults";
import { PartIcon } from "./components/PartIcon";
import { createSessionPad } from "../vehicle/sessionPad";
import { keybinds } from "../keybinds";
import { applyBindingOverrides, loadBindingOverrides } from "@jgengine/core/input/bindingOverrides";

const toSnapshot = (session: RunSession | undefined): SessionSnapshot | null => session?.snapshot() ?? null;
function publishSession(ctx: GameContext, session: RunSession) {
  runSessionStore.write(ctx, session);
  const snapshot = session.snapshot();
  setGamePhase(ctx, snapshot.phase === "running" ? snapshot.paused ? "paused" : "playing" : snapshot.phase === "start" ? "menu" : "ended");
}

export function GameUI() {
  const snapshot = useStore(runSessionStore, toSnapshot);
  const session = useStore(runSessionStore);
  const drive = useStore(driveInputStore);
  const { commands } = useGame();
  const ctx = useGameStore(context => context);
  const settings = useSettings();
  const uiRef = useRef<HTMLDivElement>(null);
  const [credits, setCredits] = useState(false);
  useEffect(() => {
    const sample = createSessionPad();
    let frame = 0;
    const poll = () => {
      const pressed = sample(navigator.getGamepads?.() ?? [], applyBindingOverrides(keybinds, loadBindingOverrides("Drift Foundry")));
      if (session && !settings.isOpen && !document.hidden) {
        for (const action of pressed) {
          const phase = session.snapshot().phase;
          if (action === "startRun" && phase === "start" && !credits) commands.run("startRun", {});
          if (action === "restart" && phase !== "start") commands.run("restart", {});
          if (action === "pauseRun" && phase === "running") { session.togglePause(); drive?.reset(); publishSession(ctx, session); }
          if (action === "keepEngine" && phase === "running" && !session.snapshot().paused) { session.toggleKeepEngine(); publishSession(ctx, session); }
        }
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [ctx, session, commands, settings.isOpen, credits, drive]);
  useLayoutEffect(() => {
    // The published shell listens on its focusable viewport. Removed menu/dialog
    // buttons otherwise leave focus on body, so keyboard driving never reaches it.
    if (snapshot?.phase === "running" && !snapshot.paused && !settings.isOpen && !document.hidden) {
      uiRef.current?.closest<HTMLElement>("[tabindex='0']")?.focus({ preventScroll: true });
    }
  }, [snapshot?.phase, snapshot?.paused, settings.isOpen]);
  useEffect(() => {
    drive?.refreshBindings();
    const suspend = () => {
      session?.suspend(settings.isOpen || document.hidden);
      if (settings.isOpen || document.hidden) drive?.reset();
      if (session) publishSession(ctx, session);
    };
    suspend();
    document.addEventListener("visibilitychange", suspend);
    return () => document.removeEventListener("visibilitychange", suspend);
  }, [ctx, session, settings.isOpen, drive]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || settings.isOpen || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]"))) return;
      const phase = session?.snapshot().phase;
      const action = phase === "running" ? drive?.keyDown(event.code) : null;
      if (event.code === "Enter" && phase === "start" && !credits && !(event.target instanceof Element && event.target.closest("button"))) commands.run("startRun", {});
      if (event.code === "KeyR" && (phase === "won" || phase === "crushed")) commands.run("restart", {});
      if (action === "pauseRun" && phase === "running") { session?.togglePause(); drive?.reset(); if (session) publishSession(ctx, session); }
      if (action === "keepEngine" && phase === "running") { session?.toggleKeepEngine(); if (session) publishSession(ctx, session); }
      if (event.code === "Escape" && credits) setCredits(false);
    };
    window.addEventListener("keydown", key);
    const release = (event: KeyboardEvent) => drive?.keyUp(event.code);
    const blur = () => drive?.reset();
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", release); window.removeEventListener("blur", blur); };
  }, [ctx, session, commands, settings.isOpen, credits, drive]);
  if (!snapshot || !session) return null;
  const togglePause = () => { session.togglePause(); publishSession(ctx, session); drive?.reset(); };
  const returnToTitle = () => { session.returnToTitle(); publishSession(ctx, session); drive?.reset(); };
  const nextGate = ROUTE_GATES.find(g => !snapshot.clearedGateIds.has(g.id));
  const distance = nextGate ? Math.max(0, nextGate.atZ - snapshot.pose.position[2]) : 470 - snapshot.pose.position[2];
  const advice = gateAdvice(snapshot.pose.position[2], snapshot.tuning, snapshot.pose.speedKmh / 3.6, snapshot.pose.airborne);
  const jumpNow = advice?.action === "jump";
  const nextPickup = PICKUPS.find(p => !snapshot.collectedIds.has(p.id) && p.position[2] >= snapshot.pose.position[2] - 3);
  const toast = snapshot.toast?.body;
  const touch = (action: string, label: string) => <button aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drive?.press(action); }} onPointerUp={() => drive?.release(action)} onPointerCancel={() => drive?.release(action)} onLostPointerCapture={() => drive?.release(action)}>{label}</button>;
  return <div className="df-ui" ref={uiRef} style={fieldkitVars}>
    {snapshot.phase === "start" && (credits ? <Credits onBack={() => setCredits(false)}/> : <StartScreen records={snapshot.records} onStart={() => commands.run("startRun", {})} onCredits={() => setCredits(true)}/>)}
    {snapshot.phase === "running" && <>
      <header className="df-hud-top">
        <div className="df-plate df-location"><span className="df-eyebrow">ROW SIX / {snapshot.zone.label}</span><b>{snapshot.runTime.toFixed(1)}<small> SEC</small></b></div>
        <div className={`df-plate df-gap ${snapshot.compactorGap < 22 ? "df-danger" : ""}`}><span>COMPACTOR <b>{Math.max(0, Math.round(snapshot.compactorGap))}m</b> BEHIND</span><div className="df-gap-track"><i style={{width: `${Math.min(100, Math.max(0, snapshot.compactorGap / 60 * 100))}%`}}/></div></div>
        <nav><button onClick={togglePause} aria-label="Pause run">PAUSE <kbd>P</kbd></button><SettingsTrigger className="df-button" label="Settings">⚙</SettingsTrigger></nav>
      </header>
      <aside className={`df-gate-cue df-plate ${jumpNow ? "df-launch" : ""}`}>
        <span className="df-eyebrow">{nextGate ? `NEXT ${nextGate.requirement === "jump" ? "JUMP STACK" : "PLOW WALL"}` : "EXIT GATE"} / {Math.ceil(Math.max(0, distance))}m</span>
        <b>{advice?.text ?? "BRING IT HOME"}</b>
        <span>{nextGate?.label ?? "470m escape line"}</span>
      </aside>
      <aside className="df-build"><details><summary>YOUR BUILD · {Object.values(snapshot.installed).filter(Boolean).length}/4</summary><div>{PART_SLOTS.map(slot => <span key={slot}><PartIcon partId={snapshot.installed[slot]?.id ?? null}/><span><small>{slot.toUpperCase()}</small>{snapshot.installed[slot]?.label ?? "Empty"}</span></span>)}</div><p>Truck motor: faster, wider turns. EV: slower, sharper steering. Keep your engine to pass later motor stations.</p></details><button className="df-engine-choice" aria-pressed={snapshot.keepEngine} onClick={() => { session.toggleKeepEngine(); publishSession(ctx, session); }}>{snapshot.keepEngine ? "KEEP ENGINE" : "ACCEPT ENGINE SWAPS"} <kbd>X</kbd></button></aside>
      <footer className="df-hud-bottom"><div className="df-plate df-speed"><b>{Math.round(snapshot.pose.speedKmh)}</b><span>KM/H</span><small>{snapshot.pose.airborne ? "AIRBORNE" : snapshot.armorSaveArmed ? "ARMOR ARMED" : "SALVAGE SPECIAL"}</small></div><div className="df-plate df-route"><span>{snapshot.clearedGateIds.size}/8 BARRIERS <b>{Math.min(100, Math.floor(snapshot.pose.position[2] / 470 * 100))}%</b></span><div><i style={{width: `${Math.min(100, snapshot.pose.position[2] / 470 * 100)}%`}}/></div><small>{nextPickup ? `NEXT SALVAGE · ${partById(nextPickup.partId)?.label} · ${Math.max(0, Math.round(nextPickup.position[2] - snapshot.pose.position[2]))}m` : "ALL SALVAGE PASSED · EXIT AHEAD"}</small></div></footer>
      {toast != null && <div className="df-toast" role="status">{String(toast)}</div>}
      <div className="df-touch"><div>{touch("steerLeft", "◀")}{touch("steerRight", "▶")}{touch("brake", "BRAKE")}</div><div>{touch("jumpHop", "JUMP")}{touch("throttle", "GO")}</div></div>
      {snapshot.paused && !settings.isOpen && <div className="df-overlay"><section className="df-card df-pause" role="dialog" aria-label="Paused"><div className="df-eyebrow">PIT STOP / CLOCK FROZEN</div><h1>TAKE A<br/><em>BREATHER</em></h1><p>Your buggy and the compactor are waiting.</p><div className="df-actions"><button className="df-primary" onClick={togglePause}>RESUME <kbd>P</kbd></button><SettingsTrigger className="df-button">SETTINGS</SettingsTrigger><button onClick={() => commands.run("restart", {})}>RESTART RUN</button><button onClick={returnToTitle}>BACK TO PIT</button></div></section></div>}
    </>}
    {(snapshot.phase === "won" || snapshot.phase === "crushed") && <RunResults snapshot={snapshot} onRestart={() => commands.run("restart", {})} onTitle={returnToTitle}/>}
  </div>;
}
