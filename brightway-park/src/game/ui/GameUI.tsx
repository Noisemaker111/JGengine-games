import { useEffect, useState } from "react";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudPanel } from "@jgengine/react/hudPanel";
import { applyBindingOverrides, loadBindingOverrides } from "@jgengine/core/input/bindingOverrides";
import { keybinds } from "../keybinds";

import { BuildBar } from "./components/BuildBar";
import { Inspector } from "./components/Inspector";
import { ParkDashboard } from "./components/ParkDashboard";
import { ParkFlow } from "./components/ParkFlow";
import { CameraPad } from "./components/CameraPad";
import { session } from "../session";
import { CSS_PADDING } from "./theme";

function preference(key: string): boolean { try { return localStorage.getItem(`brightway-park.${key}`)==="true"; } catch { return false; } }

export function GameUI() {
  const {commands}=useGame(); const clock=useGameClock();
  const started=useGameStore(()=>session.started);
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
  return (
    <div className={`park-ui ${contrast?"park-contrast":""} ${reducedMotion?"park-reduced-motion":""}`}>
      {started&&<><ParkDashboard/>
        <HudPanel className="park-time park-surface" role="navigation" aria-label="Simulation controls" style={CSS_PADDING}>
          <HudButton variant="ghost" className={clock.paused?"active":""} aria-pressed={clock.paused} onClick={()=>commands.run("pauseToggle", {})} aria-label="Pause park">Ⅱ</HudButton>
          {clock.speeds.map(s=><HudButton key={s} variant="ghost" className={!clock.paused&&clock.speed===s?"active":""} aria-pressed={!clock.paused&&clock.speed===s} onClick={()=>commands.run("park.speed",{speed:s})}>{s}×</HudButton>)}
          <HudButton variant="ghost" cue="open" onClick={()=>{if(!clock.paused)commands.run("pauseToggle", {});setSettings(true);}} aria-label="Park settings">⚙</HudButton>
        </HudPanel>
        <div className="park-inspector"><Inspector/></div>
        <div className="park-build"><BuildBar/></div>
        {!clock.paused&&!settings&&<CameraPad/>}
      </>}
      <ParkFlow settings={settings} onCloseSettings={()=>setSettings(false)} reducedMotion={reducedMotion} onReducedMotion={v=>{setReducedMotion(v);savePreference("reduced-motion",v);commands.run("park.motion",{reduced:v});}} contrast={contrast} onContrast={v=>{setContrast(v);savePreference("contrast",v);}}/>
    </div>
  );
}
