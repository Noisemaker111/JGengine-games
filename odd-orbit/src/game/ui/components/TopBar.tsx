import { useGame, useGameClock, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { householdStore } from "../../session/store";
import { nextBill } from "../../sim/economy";
import { creditsText } from "./bits";
import { householdPhase } from "../../sim/schedule";

export function TopBar() {
  const clock = useGameClock();
  const { commands } = useGame();
  const household = useStore(householdStore);
  const objects = useSceneObjects();
  const cal = clock.calendar;
  const hour = Math.floor(cal.hour);
  const minute = cal.minute;
  const bill = nextBill(household, objects);
  return <section className="orbit-topbar" aria-label="Household time and resources">
    <div className="orbit-clock"><strong>Day {cal.day + 1}</strong><span>{String(hour).padStart(2,"0")}:{String(minute).padStart(2,"0")} · {householdPhase(clock.now)}</span></div>
    <div className="orbit-speed" role="group" aria-label="Simulation speed"><button aria-label={clock.paused ? "Resume time" : "Pause time"} aria-pressed={clock.paused} onClick={() => commands.run("pauseToggle", {})}>{clock.paused ? "Play" : "Pause"}</button>{clock.speeds.map(mult => <button aria-pressed={!clock.paused && clock.speed === mult} key={mult} onClick={() => commands.run("time.speed",{ mult })}>{mult}×</button>)}</div>
    <div className="orbit-resources"><span><b>{creditsText(household.credits)}</b> credits</span><span className={household.pantry < 4 ? "warning" : ""}><b>{household.pantry}</b> rations</span><span className={household.credits < bill ? "warning" : ""}><b>{bill}</b> midnight bill</span>{household.debt > 0 && <span className="warning"><b>{creditsText(household.debt)}</b> debt</span>}</div>
  </section>;
}
