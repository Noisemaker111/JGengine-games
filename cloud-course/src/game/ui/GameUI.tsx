import { ControlsList, HudCanvas, SettingsTrigger, useGame, useGameStore, useHudLayout } from "@jgengine/react";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { useBrowserSuspension } from "@jgengine/react/browserLifecycle";
import { useDialogBehavior } from "@jgengine/react/dialogBehavior";
import { useMenuRouter } from "@jgengine/react/menuRouter";
import { DEFAULT_WALK_CODES } from "@jgengine/shell/gameKit";

import { courseRun } from "../../loop";

export function createCourseUi(onCreate?: () => void) {
  return function CourseUI() {
    const layout = useHudLayout({ storageKey: "cloud-course:hud" });
    const run = useGameStore(courseRun);
    const { commands } = useGame();
    const menu = useMenuRouter<"title" | "credits">("title");
    const dialog = useDialogBehavior<HTMLElement>({ open: run.phase !== "running", focusKey: `${run.phase}:${menu.current}` });
    useBrowserSuspension(() => { if (run.phase === "running") void commands.run("course.pause", {}); });
    const action = (name: string) => () => { void commands.run(`course.${name}`, {}); };
    const elapsed = run.elapsed.toFixed(1);
    return <HudCanvas layout={layout} className="course-hud">
      {run.phase === "running" ? <>
        <header className="course-score" data-hud-window="course-score"><strong>CLOUD COURSE</strong><span>{elapsed}s</span><span>{run.checkpoint === null ? "Reach the yellow checkpoint" : "Checkpoint banked"}</span><button type="button" onClick={action("pause")}>Pause</button></header>
        <ControlsList className="course-controls" bindings={DEFAULT_WALK_CODES} controls={[{ action: ["moveForward", "moveLeft", "moveBack", "moveRight"], label: "Move" }, { action: "jump", label: "Jump" }]} />
      </> : <div className="course-veil">
        <section ref={dialog} className="course-board" data-hud-window="course-board" role="dialog" aria-modal="true" aria-label={run.phase === "menu" ? "Cloud Course main menu" : "Course result"} tabIndex={-1}>
          <p className="course-eyebrow">THE SKYLINE JUMP CLUB</p>
          {run.phase === "menu" ? menu.current === "credits" ? <>
            <CreditsScreen document={{ title: "Made for play", sections: [{ heading: "Original content", entries: [{ label: "Cloud Course inflatable pads and animated runner", detail: "Original geometry authored for this game." }] }, { heading: "Framework", entries: [{ label: "JGengine", detail: "Engine, editor, simulation and creation storage.", href: "https://jgengine.com" }] }] }} />
            <button type="button" className="course-button" onClick={menu.back}>Back</button>
          </> : <>
            <h1>CLOUD<br /><span>COURSE</span></h1>
            <p>Build a route. Make the jump. Try it again.</p>
            <div className="course-actions">
              <button type="button" className="course-button course-primary" onClick={action("start")}><b>01</b> Run the club course</button>
              {onCreate === undefined ? null : <button type="button" className="course-button" onClick={onCreate}><b>02</b> Create or edit a course</button>}
              <div className="course-secondary"><SettingsTrigger className="course-button">Settings</SettingsTrigger><button type="button" className="course-button" onClick={() => menu.open("credits")}>Credits</button></div>
            </div>
            <p className="course-note">Yellow banks your checkpoint. Purple is the finish. A tumble costs a retry.</p>
          </> : run.phase === "tumbled" ? <>
            <h2>SOFT LANDING!</h2><p>You missed the pad. Your route is still there.</p><p className="course-result">{run.falls} {run.falls === 1 ? "tumble" : "tumbles"} · {elapsed}s</p>
            <button type="button" className="course-button course-primary" onClick={action("retry")}>{run.checkpoint === null ? "Retry from start" : "Retry from checkpoint"}</button>
            <button type="button" className="course-button" onClick={action("menu")}>Main menu</button>
          </> : run.phase === "finished" ? <>
            <h2>ROUTE COMPLETE!</h2><p className="course-result">{elapsed}s · {run.falls} {run.falls === 1 ? "tumble" : "tumbles"}</p><p>Shorten a jump or add a safer landing in the editor.</p>
            <button type="button" className="course-button course-primary" onClick={action("start")}>Run again</button><button type="button" className="course-button" onClick={action("menu")}>Main menu</button>
          </> : <>
            <h2>TAKE A BREATHER</h2><p>Your timer is stopped at {elapsed}s.</p><button type="button" className="course-button course-primary" onClick={action("resume")}>Resume course</button><SettingsTrigger className="course-button">Settings</SettingsTrigger><button type="button" className="course-button" onClick={action("menu")}>Main menu</button>
          </>}
        </section>
      </div>}
    </HudCanvas>;
  };
}
