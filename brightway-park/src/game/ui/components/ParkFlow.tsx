import { type ReactNode } from "react";
import { SettingsTrigger, useDialogBehavior } from "@jgengine/react";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { session } from "../../session";
import { SCENARIOS } from "../../scenarios";

export function ParkDialog({title,children,onClose,blockGameKeys=false}:{title:string;children:ReactNode;onClose?:()=>void;blockGameKeys?:boolean}) {
  const ref=useDialogBehavior({open:true,onClose,initialFocus:"root",focusKey:title});
  return <div className="park-modal-scrim" onPointerDown={e=>e.stopPropagation()}><HudSurface ref={ref} tabIndex={-1} className="park-dialog park-surface" role="dialog" aria-modal="true" aria-label={title} elevation="modal" onKeyDown={e=>{
    if(blockGameKeys)e.stopPropagation();
  }}>{children}</HudSurface></div>;
}

export function ParkFlow({settings,onCloseSettings,reducedMotion,onReducedMotion,contrast,onContrast}:{settings:boolean;onCloseSettings:()=>void;reducedMotion:boolean;onReducedMotion:(v:boolean)=>void;contrast:boolean;onContrast:(v:boolean)=>void}) {
  const {commands}=useGame(); const clock=useGameClock();
  useGameStore(()=>[session.started,session.gameOver,session.won,session.winDismissed,session.hasSave,session.saveStatus,session.scenario?.id??"",session.scenario?.result??"",session.scenario?.reason??""].join("|"));
  const logo=<img className="park-dialog-logo" src={new URL("../../../../public/art/brightway-sign.svg",import.meta.url).href} alt="Brightway Park"/>;
  if(settings) return <ParkDialog title="Park settings" onClose={onCloseSettings} blockGameKeys>
    <div className="park-section-label">MAKE YOURSELF AT HOME</div><h1>Park settings</h1>
    <label className="park-setting"><span><strong>Reduce motion</strong><small>Still ride mechanisms and gentle UI transitions.</small></span><input type="checkbox" checked={reducedMotion} onChange={e=>onReducedMotion(e.target.checked)}/></label>
    <label className="park-setting"><span><strong>Stronger HUD contrast</strong><small>Solid panels for clear labels over the park.</small></span><input type="checkbox" checked={contrast} onChange={e=>onContrast(e.target.checked)}/></label>
    <div className="park-help"><strong>Make your way around</strong><p>WASD / arrow keys pan · Q / E rotate · scroll to zoom. Build with the catalog, then click an empty plot. Right-click or X cancels. P pauses.</p><p>1 carousel · 2 coaster · 3 track · 4 food · 5 tree · 6 path. On small or touch screens, hold the camera arrows to pan or rotate and use ＋ / − to zoom. Choose a blueprint and tap an empty plot to build.</p><p>Click a ride to set its ticket, see its line and service it before it breaks.</p></div>
    <div className="park-settings-host"><span>Rendering, sound & input</span><SettingsTrigger className="park-button"/></div>
    <p className="park-save-note">{session.saveStatus}. Saves stay in this browser.</p>
    <HudButton variant="primary" cue="confirm" className="park-button primary" onClick={onCloseSettings}>Back to the park</HudButton>
  </ParkDialog>;
  if(session.scenario!==null&&session.scenario.result!==null&&session.started) {
    const won=session.scenario.result==="won";
    return <ParkDialog title={won?"Scenario complete":"Scenario failed"}>{logo}
      <div className="park-section-label">{won?"BRIGHT DAYS AHEAD":"THE GATES CLOSE"}</div>
      <h1>{won?"Scenario won!":"Scenario failed"}</h1>
      <p>{won?"You hit the target with the park still standing. The reward is in the till.":session.scenario.reason??"The target slipped away."}</p>
      <HudButton variant="primary" cue="confirm" className="park-button primary" onClick={()=>commands.run("park.replay",{})}>Play this scenario again · fresh park</HudButton>
      <HudButton className="park-button" onClick={()=>commands.run("park.freeplay",{})}>Keep this park in free play</HudButton>
      <small className="park-save-note">Your award and park are saved.</small>
    </ParkDialog>;
  }
  if(!session.started) return <ParkDialog title="Welcome to Brightway Park">{logo}
    <div className="park-section-label">THE SEASIDE IS CALLING</div><h1>Your midway.<br/>Your magnificent little world.</h1>
    <p>Turn a quiet coastal fair into a blue ribbon park. Pick a scenario for a goal and a deadline, or open free play and build at your own pace.</p>
    <div className="park-scenarios">
      {SCENARIOS.map((scenario)=><button key={scenario.id} className="park-scenario" onClick={()=>commands.run("park.scenario",{id:scenario.id})}>
        <strong>{scenario.title}</strong>
        <span>{scenario.blurb}</span>
        <em>{scenario.goal} · ${scenario.cash.toLocaleString()} to start</em>
      </button>)}
    </div>
    <HudButton variant="primary" cue="confirm" className="park-button primary" onClick={()=>commands.run("park.start", {})}>{session.hasSave?`Free play · continue day ${session.day}`:"Free play · open the park"}</HudButton>
    {session.hasSave&&<HudButton className="park-button" onClick={()=>commands.run("park.new", {})}>Start fresh · archive current save</HudButton>}
    <small className="park-save-note">{session.saveStatus}. P pauses · WASD pans · scroll zooms.</small>
  </ParkDialog>;
  if(session.gameOver) return <ParkDialog title="Park bankrupt">{logo}<div className="park-section-label">THE LIGHTS GO DOWN</div><h1>A season to learn from</h1><p>Three days in debt have closed the gates. Your park reached {Math.round(session.rating)} stars in {session.day-1} days.</p><p>Next time, keep an eye on nightly upkeep, staff wages and the loan instalment, and give guests somewhere to eat and drink.</p><HudButton variant="primary" cue="confirm" className="park-button primary" onClick={()=>commands.run("park.new", {})}>Reopen a new park · archive this save</HudButton></ParkDialog>;
  if(session.won&&!session.winDismissed) return <ParkDialog title="Blue ribbon awarded">{logo}<div className="park-ribbon">★</div><div className="park-section-label">BRIGHT DAYS AHEAD</div><h1>Your first blue ribbon!</h1><p>Three rides, a profitable day, and a happy, tidy park. Brightway has become a seaside favorite.</p><HudButton variant="primary" cue="confirm" className="park-button primary" onClick={()=>commands.run("park.continue", {})}>Keep building in free play</HudButton><small className="park-save-note">Your award and park are saved.</small></ParkDialog>;
  if(clock.paused) return <ParkDialog title="Park paused" onClose={()=>commands.run("pauseToggle", {})}><div className="park-section-label">TAKE A BREATHER</div><h1>The midway can wait</h1><p>Your visitors and finances are paused. Resume to keep the park moving.</p><HudButton variant="primary" cue="confirm" className="park-button primary" onClick={()=>commands.run("pauseToggle", {})}>Resume park</HudButton><HudButton className="park-button" onClick={()=>commands.run("park.save", {})}>Save park</HudButton><small className="park-save-note" role="status">{session.saveStatus}</small></ParkDialog>;
  return null;
}
