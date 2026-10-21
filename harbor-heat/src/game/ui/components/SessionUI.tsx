import { useEffect, useSyncExternalStore } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { HudButton } from "@jgengine/react/hudButton";
import { HudPanel as HudFrame } from "@jgengine/react/hudPanel";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { sessionStore } from "../../session";
import { courierStore, courierDeadline, DELIVERY_ROUTES, DISPATCH } from "../../jobs/courier";
import { startedStore } from "../../commands";

const ignoreSaveChanges = () => () => {};
const SAVE_LABELS = { idle: "Ready", loading: "Loading…", saving: "Saving…", saved: "Saved", error: "Save failed", unavailable: "Unavailable" };

export function SessionUI() {
  const { commands } = useGame();
  const settings = useSettings();
  const session = useStore(sessionStore, (value) => value);
  const started = useStore(startedStore, (value) => value === true);
  const courier = useStore(courierStore, (value) => value);
  const save = useGameStore((ctx) => ctx.game.save);
  // Saves have their own signal; the paused world cannot drive this status label.
  const saveStatus = useSyncExternalStore<keyof typeof SAVE_LABELS>(save?.subscribe ?? ignoreSaveChanges, () => save?.status() ?? "unavailable", () => "unavailable");
  useEffect(() => {
    // A restored snapshot can reset transient stores while the settings provider stays open.
    if (session.settings !== settings.isOpen) commands.run("session.settings", { open: settings.isOpen });
  }, [commands, settings.isOpen, session.settings]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.code !== "KeyP" || event.repeat || !started || settings.isOpen || session.notice) return;
      if ((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      commands.run("session.pause", { paused: !session.paused });
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [commands, started, session.paused, session.notice, settings.isOpen]);
  if (!started || settings.isOpen) return null;
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  if (session.notice) {
    const delivery = session.notice === "courier";
    const won = courier.phase === "won";
    return <div data-jg-menu className="hh-overlay"><HudFrame role="dialog" aria-modal="true" aria-labelledby="hh-result-title" className="hh-modal" elevation="modal" padding="var(--hh-modal-pad)">
      <div className="hh-eyebrow">{delivery ? "Mainsail express / dispatch receipt" : "Harbor Heat / recovery"}</div>
      <h2 id="hh-result-title">{delivery ? won ? "Signed. Sealed. Paid." : "Missed the tide." : "Back on your feet."}</h2>
      <p>{delivery ? won ? `${route.recipient} received the parcel.${courier.service === "rush" ? ` Cargo condition ${Math.round(courier.condition ?? 100)}%; pay and bond refund scale with condition.` : " Another route is waiting at dispatch."}` : courier.service === "rush" ? "Rush expired; $60 bond forfeited. A free standard delivery can get you earning again." : "The deadline expired. Your parcel returned to dispatch; no cash was lost." : session.notice}</p>
      {delivery && won && <div className="hh-payout">+${courier.reward}<small>{courier.service === "rush" ? "includes condition-based bond refund" : "includes time bonus"} · +15 cred</small></div>}
      <HudButton autoFocus className="hh-button hh-button-primary" onClick={() => commands.run(delivery ? "courier.dismiss" : "session.dismiss", {})}>Keep exploring ↗</HudButton>
    </HudFrame></div>;
  }
  if (session.paused) return <div data-jg-menu className="hh-overlay"><HudFrame role="dialog" aria-modal="true" aria-labelledby="hh-pause-title" className="hh-modal" elevation="modal" padding="var(--hh-modal-pad)">
    <div className="hh-eyebrow">Harbor Heat / off the clock</div><h2 id="hh-pause-title">Catch your breath.</h2>
    <p>The city and delivery clock are paused. Your story stays right here.</p>
    <div className="hh-menu-actions"><HudButton autoFocus className="hh-button hh-button-primary" onClick={() => commands.run("session.pause", { paused: false })}>Back to the coast ↗</HudButton>
      <SettingsTrigger className="hh-button hh-button-secondary" label="Settings">Settings & controls</SettingsTrigger>
      <HudButton className="hh-button hh-button-secondary" disabled={!save || saveStatus === "saving"} onClick={() => commands.run("session.save", {})}>Save progress</HudButton>
    </div><small aria-live="polite">Save: {SAVE_LABELS[saveStatus]}</small>
  </HudFrame></div>;
  return <HudButton className="hh-pause-trigger" onClick={() => commands.run("session.pause", { paused: true })}>Ⅱ <span>Pause · P</span></HudButton>;
}

export function CourierHud() {
  const courier = useStore(courierStore, (value) => value);
  const position = useGameStore((ctx) => ctx.scene.entity.get(ctx.player.userId)?.position ?? null);
  const { commands } = useGame();
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  const running = courier.phase === "running";
  const offer = DELIVERY_ROUTES[courier.completed % DELIVERY_ROUTES.length]!;
  const distance = position === null ? 0 : Math.round(Math.hypot(position[0] - DISPATCH[0], position[2] - DISPATCH[1]));
  return <HudFrame role="region" className={`hh-courier ${running && courier.remaining < 15 ? "hh-urgent" : ""}`} aria-label="Courier dispatch" padding="var(--hh-courier-pad)">
    <div className="hh-courier-label">{running ? "Parcel on board" : "Mainsail express"}<span>{running ? `${Math.ceil(courier.remaining)}s` : `${courier.completed} delivered`}</span></div>
    <strong>{running ? route.label : "Take a coastal delivery"}</strong>
    <p>{running ? `${route.recipient} · ${courier.distance} m` : `Teal booth by the shore · ${distance} m`}</p>
    {running ? <><progress max={courierDeadline(route.seconds, courier.service === "rush")} value={courier.remaining} aria-label="Delivery time remaining" />{courier.service === "rush" && <><b>FRAGILE RUSH · cargo {Math.round(courier.condition ?? 100)}%</b><small>Above 35 km/h and taking damage spoil cargo; wage and bond refund fall with condition.</small></>}<small>{route.hint} Slow to a stop, then press E / Use at the tower.</small></> : <><small>{offer.label} · Standard ${offer.payout}+ · {offer.seconds}s · no fee or failure cost.</small>{distance < 9 && <><HudButton block className="hh-inline-action" onClick={() => commands.run("courier.accept", {})}>Take standard parcel · E ↗</HudButton>{courier.completed > 0 && <><small>Fragile rush ${Math.floor(offer.payout * 1.8)}+ at 100% condition · {courierDeadline(offer.seconds, true)}s. $60 bond; condition scales wage/refund, expiry loses bond. Keep below 35 km/h; avoid damage.</small><HudButton block className="hh-inline-action" onClick={() => commands.run("courier.accept", { service: "rush" })}>Commit $60 bond · fragile rush ↗</HudButton></>}</>}</>}
  </HudFrame>;
}
