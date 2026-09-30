import { useEffect, useState } from "react";
import { HudPanel } from "@jgengine/react";
import { useGame, useGamePhase, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { RELAY, relayDistance, relayStore } from "../../relay";
import { characterIdStore, vendorOpenStore, travelOpenStore, skillsOpenStore, blackMarketOpenStore } from "../../stores";

export function Operations() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const character = useStore(characterIdStore);
  const relay = useStore(relayStore);
  const vendor = useStore(vendorOpenStore);
  const travel = useStore(travelOpenStore);
  const skills = useStore(skillsOpenStore);
  const market = useStore(blackMarketOpenStore);
  const distance = useGameStore(relayDistance);
  const [manual, setManual] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const modal = vendor !== null || travel || skills || market || settings.isOpen;
  const paused = manual || modal;

  useEffect(() => {
    if (character === null || gamePhase(ctx) === "ended") return;
    setGamePhase(ctx, paused ? "paused" : "playing");
    if (paused) { ctx.time.pause(); document.exitPointerLock?.(); }
    else ctx.time.play();
  }, [ctx, character, paused, phase]);

  useEffect(() => {
    const pause = () => {
      if (gamePhase(ctx) === "playing") { ctx.time.pause(); setGamePhase(ctx, "paused"); setManual(true); }
    };
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || settings.isOpen || character === null || phase === "ended") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (vendor !== null) commands.run("vendor.close", {});
      else if (travel) commands.run("travel.close", {});
      else if (skills) commands.run("ui.openSkills", {});
      else if (market) commands.run("blackmarket.close", {});
      else setManual((value) => !value);
    };
    const visibility = () => { if (document.hidden) pause(); };
    let locked = document.pointerLockElement !== null;
    const lock = () => {
      const next = document.pointerLockElement !== null;
      if (locked && !next && !modal) pause();
      locked = next;
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerlockchange", lock);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerlockchange", lock);
    };
  }, [ctx, commands, character, phase, vendor, travel, skills, market, settings.isOpen, modal]);

  async function save() {
    setSaveMessage("Saving…");
    try {
      if (ctx.game.save === undefined) { setSaveMessage("Save unavailable in this host"); return; }
      await ctx.game.save.checkpoint();
      setSaveMessage(ctx.game.save.status() === "error" ? "Save failed · your current session is still running" : "Checkpoint saved · resume after reload");
    } catch { setSaveMessage("Save failed · your current session is still running"); }
  }
  if (character === null) return null;
  const active = relay.phase === "defend" || relay.phase === "upload";
  const result = relay.phase === "won" || relay.phase === "lost";
  return <>
    <HudPanel id="dead-air" anchor="top-left" compact="keep" interactive={false}>
      <div className="signal-contract">
        <div className="signal-eyebrow">{relay.rewarded ? "Carrier restored" : "Optional salvage contract"}</div>
        <strong>DEAD AIR <span>{active ? `${relay.wave}/3` : "↗"}</span></strong>
        <p>{active ? relay.phase === "defend" ? `Clear the ambush · ${relay.enemies.length} hostiles` : distance > RELAY.radius ? "Return to the copper ring to upload" : "Hold position · uploading carrier" : `Copper-ring relay · ${Math.round(distance)} m · north of crash site`}</p>
        {active ? <><div className="signal-meter"><i style={{ width: `${relay.phase === "upload" ? Math.min(100, relay.upload / RELAY.uploadSeconds * 100) : 0}%` }} /></div><small>{Math.ceil(relay.remaining)}s carrier window · R reload · Q heal</small></> : <small>Walk to the console · E to begin{relay.rewarded ? " · replay available" : " · $120 + 3 cores"}</small>}
      </div>
    </HudPanel>
    <HudPanel id="pause-operation" anchor="top-right" order={-2} compact="keep" interactive>
      <button className="signal-button signal-small" onClick={() => setManual(true)}>Pause / Esc</button>
    </HudPanel>
    {manual && !modal && !result && <div className="signal-modal" role="dialog" aria-modal="true" aria-label="Run paused">
      <section className="signal-sheet">
        <div className="signal-eyebrow">Reclaimer field terminal / 04</div><h1>Signal on hold.</h1>
        <p>Combat, reloads and the carrier window are paused.</p>
        <div className="signal-actions"><button autoFocus className="signal-button" onClick={() => setManual(false)}>Resume run</button><button className="signal-button" onClick={save}>Save checkpoint</button><button className="signal-button" onClick={settings.open}>Settings & controls</button></div>
        <p role="status">{saveMessage}</p>
        <div className="signal-control-grid"><span><b>WASD / Shift</b>Move / sprint</span><span><b>Mouse / right mouse</b>Fire / aim</span><span><b>E / R</b>Interact / reload</span><span><b>Q / G / K</b>Heal / grenade / talents</span></div>
        <small>Resume, then click the world to capture the mouse. Esc releases it.</small>
      </section>
    </div>}
    {result && <div className="signal-modal" role="dialog" aria-modal="true" aria-label="Dead Air results">
      <section className="signal-sheet">
        <div className="signal-eyebrow">Dead Air / field report</div><h1>{relay.phase === "won" ? "You broke the silence." : "Carrier lost."}</h1>
        <p>{relay.reason}</p><div className="signal-result"><span>{relay.phase === "won" ? "03 / 03" : `${relay.wave} / 03`}<small>ambush reached</small></span><span>{Math.ceil(relay.remaining)}s<small>carrier remaining</small></span></div>
        <p>{relay.phase === "won" ? "Contract secured · $120 + 3 cores on first completion. The campaign and your loot remain yours." : "Your inventory is retained. Reconstruction charges the usual 7% cash fee when your chassis is down."}</p>
        <button autoFocus className="signal-button" onClick={() => { setManual(false); commands.run("relay.continue", {}); }}>Return to the wastes</button>
        <small>The console accepts another attempt when you return.</small>
      </section>
    </div>}
  </>;
}
