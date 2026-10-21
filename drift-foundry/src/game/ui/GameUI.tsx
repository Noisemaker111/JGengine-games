import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "../../style.css";
import { SettingsTrigger, useBrowserSuspension } from "@jgengine/react";
import { useSettings } from "@jgengine/react/settings";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { HudButton } from "@jgengine/react/hudButton";
import { HudPanel } from "@jgengine/react/hudPanel";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runSessionStore, type RunSession, type SessionSnapshot } from "../run/session";
import { ROUTE_GATES } from "../route/gates";
import { PICKUPS } from "../run/pickups";
import { partById, PART_SLOTS } from "../parts/catalog";
import { driveInputStore } from "../run/store";
import { Credits } from "./components/Credits";
import { StartScreen } from "./components/StartScreen";
import { RunResults } from "./components/RunResults";
import { PartIcon } from "./components/PartIcon";
import { launchCue } from "./launchCue";

/** HudPanel writes an inline 12px padding by default; the df-* classes own padding (and its breakpoints). */
const CSS_PADDING = { padding: undefined } as const;
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
  useBrowserSuspension(() => drive?.reset(), { hidden: false, pointerLockLost: false });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || settings.isOpen || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]"))) return;
      const phase = session?.snapshot().phase;
      const action = phase === "running" ? drive?.keyDown(event.code) : null;
      if (event.code === "Enter" && phase === "start" && !credits && !(event.target instanceof Element && event.target.closest("button"))) commands.run("startRun", {});
      if (event.code === "KeyR" && (phase === "won" || phase === "crushed")) commands.run("restart", {});
      if (action === "pauseRun" && phase === "running") { session?.togglePause(); drive?.reset(); if (session) publishSession(ctx, session); }
      if (event.code === "Escape" && credits) setCredits(false);
    };
    window.addEventListener("keydown", key);
    const release = (event: KeyboardEvent) => drive?.keyUp(event.code);
    window.addEventListener("keyup", release);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", release); };
  }, [ctx, session, commands, settings.isOpen, credits, drive]);
  if (!snapshot || !session) return null;
  const togglePause = () => { session.togglePause(); publishSession(ctx, session); drive?.reset(); };
  const returnToTitle = () => { session.returnToTitle(); publishSession(ctx, session); drive?.reset(); };
  const nextGate = ROUTE_GATES.find(g => !snapshot.clearedGateIds.has(g.id));
  const distance = nextGate ? Math.max(0, nextGate.atZ - snapshot.pose.position[2]) : 470 - snapshot.pose.position[2];
  const jumpNow = nextGate?.requirement === "jump" && distance <= Math.max(5, snapshot.pose.speedKmh / 3.6 * .5);
  const nextPickup = PICKUPS.find(p => !snapshot.collectedIds.has(p.id) && p.position[2] >= snapshot.pose.position[2] - 3);
  const decisionPickup = PICKUPS.find(p => {
    const part = partById(p.partId);
    return !snapshot.collectedIds.has(p.id) && p.position[2] >= snapshot.pose.position[2] - 3 && part !== null && (part.category === "engine" || part.category === "frame") && snapshot.installed[part.category] !== null;
  });
  const offeredPart = decisionPickup ? partById(decisionPickup.partId) : null;
  const replacing = offeredPart ? snapshot.installed[offeredPart.category] : null;
  const deliberateSwap = offeredPart !== null && replacing !== null && (offeredPart.category === "engine" || offeredPart.category === "frame");
  const touch = (action: string, label: string) => <HudButton aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drive?.press(action); }} onPointerUp={() => drive?.release(action)} onPointerCancel={() => drive?.release(action)} onLostPointerCapture={() => drive?.release(action)}>{label}</HudButton>;
  return <div className="df-ui" ref={uiRef}>
    {snapshot.phase === "start" && (credits ? <Credits onBack={() => setCredits(false)}/> : <StartScreen records={snapshot.records} onStart={() => commands.run("startRun", {})} onCredits={() => setCredits(true)}/>)}
    {snapshot.phase === "running" && <>
      <header className="df-hud-top">
        <HudPanel className="df-plate df-location" interactive={false} style={CSS_PADDING}><span className="df-eyebrow">ROW SIX / {snapshot.zone.label}</span><b>{snapshot.runTime.toFixed(1)}<small> SEC</small></b></HudPanel>
        <HudPanel className={`df-plate df-gap ${snapshot.compactorGap < 22 ? "df-danger" : ""}`} interactive={false} style={CSS_PADDING}><span>COMPACTOR <b>{Math.max(0, Math.round(snapshot.compactorGap))}m</b> BEHIND</span><div className="df-gap-track"><i style={{width: `${Math.min(100, Math.max(0, snapshot.compactorGap / 60 * 100))}%`}}/></div></HudPanel>
        <nav><HudButton onClick={togglePause} aria-label="Pause run">PAUSE <kbd>P</kbd></HudButton><SettingsTrigger className="df-button" label="Settings">⚙</SettingsTrigger></nav>
      </header>
      <HudPanel className={`df-gate-cue df-plate ${jumpNow ? "df-launch" : ""}`} role="complementary" interactive={false} style={CSS_PADDING}>
        <span className="df-eyebrow">{nextGate ? `NEXT ${nextGate.requirement === "jump" ? "JUMP STACK" : "PLOW WALL"}` : "EXIT GATE"} / {Math.ceil(Math.max(0, distance))}m</span>
        <b>{launchCue(snapshot) ?? (snapshot.pose.blockedByGate ? snapshot.tuning.jumpPower > 0 && nextGate?.requirement === "jump" ? "JUMP TO CLEAR THE STACK" : "MISSING ROUTE PART" : jumpNow ? "JUMP NOW · SPACE" : nextGate?.requirement === "jump" ? "JUMP ON THE TEAL MARKS" : nextGate ? "KEEP THE PLOW POINTED FORWARD" : "BRING IT HOME")}</b>
        <span>{nextGate?.label ?? "470m escape line"}</span>
      </HudPanel>
      <aside className="df-build"><HudPanel padding={0}><details><summary>YOUR BUILD · {Object.values(snapshot.installed).filter(Boolean).length}/4</summary><div>{PART_SLOTS.map(slot => <span key={slot}><PartIcon partId={snapshot.installed[slot]?.id ?? null}/><span><small>{slot.toUpperCase()}</small>{snapshot.installed[slot]?.label ?? "Empty"}</span></span>)}</div></details></HudPanel></aside>
      <footer className="df-hud-bottom"><HudPanel className="df-plate df-speed" interactive={false} style={CSS_PADDING}><b>{Math.round(snapshot.pose.speedKmh)}</b><span>KM/H</span><small>{snapshot.pose.airborne ? "AIRBORNE" : snapshot.armorSaveArmed ? "ARMOR ARMED" : "SALVAGE SPECIAL"}</small></HudPanel><HudPanel className="df-plate df-route" interactive={false} style={CSS_PADDING}><span>{snapshot.clearedGateIds.size}/8 BARRIERS <b>{Math.min(100, Math.floor(snapshot.pose.position[2] / 470 * 100))}%</b></span><div><i style={{width: `${Math.min(100, snapshot.pose.position[2] / 470 * 100)}%`}}/></div><small>{nextPickup ? `NEXT SALVAGE · ${partById(nextPickup.partId)?.label} · ${Math.max(0, Math.round(nextPickup.position[2] - snapshot.pose.position[2]))}m` : "ALL SALVAGE PASSED · EXIT AHEAD"}</small></HudPanel></footer>
      {deliberateSwap && offeredPart && replacing && decisionPickup && decisionPickup.position[2] - snapshot.pose.position[2] < 60 && <HudPanel className="df-salvage-choice df-plate" role="complementary" aria-label="Salvage decision" interactive={false} style={CSS_PADDING}><strong>{Math.round(Math.max(0, decisionPickup.position[2] - snapshot.pose.position[2]))}m · {offeredPart.label} or keep {replacing.label}?</strong><p>{offeredPart.blurb}</p><p>Speed {offeredPart.stats.topSpeed - replacing.stats.topSpeed > 0 ? "+" : ""}{((offeredPart.stats.topSpeed - replacing.stats.topSpeed) * 3.6).toFixed(0)} km/h · steering {(offeredPart.stats.turnRate - replacing.stats.turnRate).toFixed(1)}</p>{offeredPart.category === "frame" && offeredPart.stats.armor > 0 && <p>{snapshot.armorSaveArmed ? "Crusher protection already armed: this swap adds no extra save." : "This swap restores protection against one crusher clip."}</p>}<b>Hold E / SWAP while passing to install. Pass freely to keep your build.</b></HudPanel>}
      <div className="df-touch"><div>{touch("steerLeft", "◀")}{touch("steerRight", "▶")}{touch("brake", "BRAKE")}</div><div>{touch("salvageSwap", "SWAP")}{touch("plowBrace", "BRACE")}{touch("jumpHop", "JUMP")}{touch("throttle", "GO")}</div></div>
      {snapshot.paused && !settings.isOpen && <div className="df-overlay"><HudPanel className="df-card df-pause" role="dialog" aria-label="Paused" elevation="modal" style={CSS_PADDING}><div className="df-eyebrow">PIT STOP / CLOCK FROZEN</div><h1>TAKE A<br/><em>BREATHER</em></h1><p>Your buggy and the compactor are waiting.</p><div className="df-actions"><HudButton variant="primary" className="df-primary" onClick={togglePause}>RESUME <kbd>P</kbd></HudButton><SettingsTrigger className="df-button">SETTINGS</SettingsTrigger><HudButton onClick={() => commands.run("restart", {})}>RESTART RUN</HudButton><HudButton onClick={returnToTitle}>BACK TO PIT</HudButton></div></HudPanel></div>}
    </>}
    {(snapshot.phase === "won" || snapshot.phase === "crushed") && <RunResults snapshot={snapshot} onRestart={() => commands.run("restart", {})} onTitle={returnToTitle}/>}
  </div>;
}
