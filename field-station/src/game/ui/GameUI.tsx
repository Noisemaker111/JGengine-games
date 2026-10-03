import { useSyncExternalStore } from "react";

import { HealthBar } from "@jgengine/react/bars";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useMenuRouter } from "@jgengine/react/menuRouter";
import { useSettings } from "@jgengine/react/settings";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { SETTING_IDS } from "@jgengine/core/settings/settingsModel";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";

import { currentAnnouncement, subscribeAnnouncement } from "../triggers";
import { collected, nearbySurveySite, noteCount, survey, surveySites } from "../survey";
import { assetCredits } from "../assets";

function FieldControls() {
  return <p className="field-controls">
    <span className="field-keyboard-controls">WASD move · Shift run · Space jump · E observe / file · P pause</span>
    <span className="field-touch-controls">Joystick move · Run · Jump · Observe / file · Pause survey from the notebook</span>
  </p>;
}

function SurveyNotebook() {
  const ctx = useGameContext();
  const state = useGameStore((context) => survey.read(context));
  const position = useGameStore((context) => context.scene.entity.get(context.player.userId)?.position);
  const nearby = nearbySurveySite(ctx);
  const ready = collected(state, "meadow") && collected(state, "water");
  return (
    <section className="field-notebook" aria-label="Field notebook">
      <p className="field-kicker">FIELD STATION / PRAIRIE SURVEY</p>
      <h1>Prairie field notebook</h1>
      <p className="field-instruction">{ready ? "Return to the desk to file your report, or risk the scorch sample." : "Record meadow and pond notes, then file them at the station desk."}</p>
      <div className="field-sites">
        {surveySites.map((site) => {
          const done = site.role === "sample" && collected(state, site.sample);
          const distance = position === undefined ? 0 : Math.hypot(site.position.x - position[0], site.position.z - position[2]);
          const dx = site.position.x - (position?.[0] ?? 0);
          const dz = site.position.z - (position?.[2] ?? 0);
          const direction = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "E" : "W") : (dz > 0 ? "S" : "N");
          return <div className={`field-site ${done ? "field-done" : ""}`} key={site.id}>
            <span>{done ? "✓ " : "○ "}{site.label}{site.sample === "hazard" ? " · optional" : ""}</span>
            <span>{Math.round(distance)} m {direction}</span>
          </div>;
        })}
      </div>
      <p className="field-risk">Scorched ground drains health. Rescue loses unfiled notes. Grass and water are safe.</p>
      <div className="field-ledger"><span>Notes {noteCount(state)}/3</span><span>Reports {state.profile.reports}</span><span>Best {state.profile.bestQuality}/3</span></div>
      <FieldControls />
      <button className="field-pause" onClick={() => ctx.game.commands.run("survey.pause", null)}>Pause survey</button>
      {nearby !== null && <button className="field-interact" onClick={() => ctx.game.commands.run("survey.interact", null)}>
        E — {nearby.role === "station" ? "File report at desk" : `Record ${nearby.label.toLowerCase()}`}
      </button>}
      {state.feedbackSeconds > 0 && <p role="status" className={`field-feedback ${state.rescued ? "field-rescued" : ""}`}>{state.feedback}</p>}
      <details className="field-credits"><summary>Credits</summary>
        <p>Field Station · JGengine</p>
        {assetCredits.sections.flatMap((section) => section.entries.map((entry) => <p key={entry.label}>
          <a href={entry.href} target="_blank" rel="noreferrer">{entry.label}</a><br />{entry.detail}
        </p>))}
      </details>
    </section>
  );
}

function SurveyMenu() {
  const ctx = useGameContext();
  const state = useGameStore((context) => survey.read(context));
  const router = useMenuRouter<"home" | "settings" | "credits">("home");
  const settings = useSettings();
  return <section className="field-notebook field-menu" aria-label="Field Station menu">
    <p className="field-kicker">FIELD STATION</p>
    <h1>{router.current === "home" ? "Prairie field survey" : router.current === "settings" ? "Survey settings" : "Credits"}</h1>
    {router.current !== "home" && <button className="field-interact field-back" onClick={() => router.back()}>Back</button>}
    {router.current === "home" && <>
      <p className="field-instruction">Record the meadow and pond. Risk a scorch sample for a fuller report, then bring your notes to the station desk.</p>
      <p className="field-risk">Rescue loses unfiled notes. Filed reports stay on this device.</p>
      <p className="field-ledger">Filed reports: {state.profile.reports} · Best: {state.profile.bestQuality}/3</p>
      <button className="field-interact" onClick={() => ctx.game.commands.run(state.phase === "paused" ? "survey.pause" : "start", null)}>
        {state.phase === "paused" ? "Resume survey" : state.profile.reports > 0 ? "Continue field log" : "Begin survey"}
      </button>
      <button className="field-interact" onClick={() => router.open("settings")}>Settings</button>
      <button className="field-interact" onClick={() => router.open("credits")}>Credits</button>
      <FieldControls />
    </>}
    {router.current === "settings" && <div className="field-settings">
      {settings.categories.filter((category) => category.rows.length > 0).map((category) => <fieldset key={category.id}>
        <legend>{category.label}</legend>
        {category.rows.map((row) => <label key={row.id} className="field-setting">
          <span>{row.label}{row.kind === "slider" ? ` · ${typeof row.value === "number" ? row.format?.(row.value) ?? row.value : ""}` : ""}</span>
          {row.id === SETTING_IDS.graphicsQuality ? <div className="field-setting-choices">
            {row.options?.map((option) => <button type="button" key={option.value}
              aria-label={`${row.label}: ${option.label}`} aria-pressed={String(row.value) === option.value}
              onClick={() => row.set(option.value)}>{option.label}</button>)}
          </div> : row.kind === "slider" ? <input type="range" min={row.min} max={row.max} step={row.step} value={Number(row.value)} onChange={(event) => row.set(Number(event.target.value))} /> :
            row.kind === "toggle" ? <input type="checkbox" checked={Boolean(row.value)} onChange={(event) => row.set(event.target.checked)} /> :
              <select value={String(row.value)} onChange={(event) => row.set(event.target.value)}>{row.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>}
        </label>)}
      </fieldset>)}
    </div>}
    {router.current === "credits" && <CreditsScreen document={assetCredits} />}
  </section>;
}

function TriggerBanner() {
  const announcement = useSyncExternalStore(subscribeAnnouncement, currentAnnouncement, () => null);
  if (announcement === null) return null;
  const tone =
    announcement.tone === "warn"
      ? "text-amber-300"
      : announcement.tone === "good"
        ? "text-emerald-300"
        : "text-cyan-200";
  return (
    <div className={`field-trigger-banner rounded-sm bg-black/75 px-3 py-1.5 text-sm font-semibold ${tone}`}>
      {announcement.message}
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "field-station" });
  const phase = useGameStore((ctx) => survey.read(ctx).phase);
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      {phase !== "playing" && <HudPanel id="menu" anchor="center" compact="keep"><SurveyMenu /></HudPanel>}
      {phase === "playing" && <>
      <HudPanel id="survey" anchor="top-left" compact="chip" chip="Field notebook">
        <SurveyNotebook />
      </HudPanel>
      <HudPanel id="health" anchor="bottom-left" compact="keep" interactive={false}>
        <HealthBar label="HP" shape="pill" width={220} />
      </HudPanel>
      <HudPanel id="trigger-banner" anchor="bottom-right" compact="keep" interactive={false}>
        <TriggerBanner />
      </HudPanel>
      </>}
    </HudCanvas>
  );
}
