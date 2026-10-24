import { useEffect, useState } from "react";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { usePanels } from "@jgengine/react/panels";
import { applyBindingOverrides, loadBindingOverrides } from "@jgengine/core/input/bindingOverrides";
import { keybinds } from "../keybinds";

import { BuildBar } from "./components/BuildBar";
import { Inspector } from "./components/Inspector";
import { ParkDashboard } from "./components/ParkDashboard";
import { ParkFlow } from "./components/ParkFlow";
import { ParkMenu } from "./menu/ParkMenu";
import { CameraPad } from "./components/CameraPad";
import { BUILD_PANEL, PARK_PANELS } from "./panels";
import { session } from "../session";

function preference(key: string): boolean { try { return localStorage.getItem(`brightway-park.${key}`)==="true"; } catch { return false; } }

export function GameUI() {
  const {commands}=useGame(); const clock=useGameClock();
  const started=useGameStore(()=>session.started);
  const flow=useGameStore(()=>[session.gameOver,session.won,session.winDismissed].join("|"));
  const [settings,setSettings]=useState(false);
  const [reducedMotion,setReducedMotion]=useState(()=>preference("reduced-motion"));
  const [contrast,setContrast]=useState(()=>preference("contrast"));
  useEffect(()=>{
    // Published shell 0.18 captures an empty action map during the initial menu.
    // Route our discrete keys before that tracker, including resume while paused.
    const onKey=(event:KeyboardEvent)=>{
      if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||!session.started||session.gameOver||settings) return;
      const target=event.target instanceof Element?event.target:null;
      if(target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const dialog=target?.closest('[role="dialog"]');
      const bindings=applyBindingOverrides(keybinds,loadBindingOverrides("Brightway Park"));
      const action=Object.entries(bindings).find(([,codes])=>{
        const modes=codes as {hold?:readonly string[];toggle?:readonly string[]};
        const list=Array.isArray(codes)?codes:[...(modes.hold??[]),...(modes.toggle??[])];
        return list.includes(event.code);
      })?.[0];
      if(!action||(dialog&&(dialog.getAttribute("aria-label")!=="Park paused"||action!=="pauseToggle"))) return;
      event.preventDefault();event.stopImmediatePropagation();
      commands.run(action,{});
    };
    window.addEventListener("keydown",onKey,true);
    return ()=>window.removeEventListener("keydown",onKey,true);
  },[commands,settings]);
  const savePreference=(key:string,value:boolean)=>{try{localStorage.setItem(`brightway-park.${key}`,String(value));}catch{/* Preferences remain usable for this session. */}};
  // ParkFlow owns these dialogs; while one is up it owns the keys, so the palette's own
  // hotkey/ESC listener stands down and the dialog's Escape keeps working.
  const [gameOver,won,winDismissed]=flow.split("|").map(v=>v==="true");
  const modalOpen=!started||gameOver||(won&&!winDismissed)||clock.paused||settings;
  const panels=usePanels(PARK_PANELS,{hotkeys:!modalOpen});
  const buildOpen=panels.isOpen(BUILD_PANEL);
  return (
    <div className={`park-ui ${contrast?"park-contrast":""} ${reducedMotion?"park-reduced-motion":""}`}>
      {started&&<><ParkDashboard/>
        <HudSurface className="park-time park-surface" as="nav" aria-label="Simulation controls">
          <HudButton variant="ghost" className={clock.paused?"active":""} aria-pressed={clock.paused} onClick={()=>commands.run("pauseToggle", {})} aria-label="Pause park">Ⅱ</HudButton>
          {clock.speeds.map(s=><HudButton key={s} variant="ghost" className={!clock.paused&&clock.speed===s?"active":""} aria-pressed={!clock.paused&&clock.speed===s} onClick={()=>commands.run("park.speed",{speed:s})}>{s}×</HudButton>)}
          <HudButton variant="ghost" className={buildOpen?"active":""} aria-pressed={buildOpen} onClick={()=>panels.toggle(BUILD_PANEL)} aria-label="Build palette">🏗</HudButton>
          <HudButton variant="ghost" cue="open" onClick={()=>{if(!clock.paused)commands.run("pauseToggle", {});setSettings(true);}} aria-label="Park settings">⚙</HudButton>
        </HudSurface>
        <div className="park-inspector"><Inspector/></div>
        {buildOpen&&<div className="park-build"><BuildBar onClose={()=>panels.close(BUILD_PANEL)}/></div>}
        {!clock.paused&&!settings&&<CameraPad/>}
      </>}
      <ParkMenu settings={settings} onCloseSettings={()=>setSettings(false)} reducedMotion={reducedMotion} onReducedMotion={v=>{setReducedMotion(v);savePreference("reduced-motion",v);commands.run("park.motion",{reduced:v});}} contrast={contrast} onContrast={v=>{setContrast(v);savePreference("contrast",v);}}/>
      <ParkFlow settings={settings} onCloseSettings={()=>setSettings(false)} reducedMotion={reducedMotion} onReducedMotion={v=>{setReducedMotion(v);savePreference("reduced-motion",v);commands.run("park.motion",{reduced:v});}} contrast={contrast} onContrast={v=>{setContrast(v);savePreference("contrast",v);}}/>
    </div>
  );
}

