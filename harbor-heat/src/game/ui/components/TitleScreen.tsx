import { SettingsTrigger } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { continueStore, startedStore } from "../../commands";
import poster from "../../../art/mainsail-poster.svg";

export function useGameStarted(): boolean {
  return useStore(startedStore, (v) => v ?? false);
}

export function TitleScreen() {
  const { commands } = useGame();
  const hasSave = useStore(continueStore, (v) => v ?? false);
  return (
    <main data-jg-menu className="hh-title">
      <div className="hh-poster" style={{ backgroundImage: `url(${poster})` }} aria-hidden="true" />
      <div className="hh-title-content">
        <div className="hh-eyebrow">Mainsail dispatch / coastal courier adventure</div>
        <h1>Harbor<br /><span>Heat</span><i aria-hidden="true">↗</i></h1>
        <p className="hh-title-intro">Golden coast. Hot cargo.<br />One more run before sundown.</p>
        <p className="hh-title-description">Carry parcels down the palm-lined coast, earn your wheels, and take on the crews who own the harbor.</p>
        <div className="hh-title-actions">
          <button type="button" className="hh-button hh-button-primary" onClick={() => commands.run("game.start", {})}>{hasSave ? "Continue your story" : "Hit the street"} <span>↗</span></button>
          <SettingsTrigger className="hh-button hh-button-secondary" label="Settings">Settings</SettingsTrigger>
        </div>
        <div className="hh-controls">
          <span><b>W A S D</b> Move / drive</span><span><b>E / F</b> Use / exit</span>
          <span><b>Shift</b> Sprint <b>P</b> Pause</span><span><b>Mouse</b> Look / fire</span>
        </div>
        <div className="hh-title-note">Your first stop: the teal dispatch booth beside you. Press E to take a parcel. Touch controls appear when you start.</div>
        <footer>Original Mainsail art · assets by KayKit / Quaternius / ambientCG</footer>
      </div>
      <div className="hh-poster-stamp" aria-hidden="true">Mainsail<br /><strong>Express</strong><small>COAST • CITY • CREW</small></div>
    </main>
  );
}
