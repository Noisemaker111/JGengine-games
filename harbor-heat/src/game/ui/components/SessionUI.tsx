import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { sessionStore } from "../../session";
import { courierStore, courierOffer, COURIER_SERVICES, DELIVERY_ROUTES, DISPATCH } from "../../jobs/courier";
import { drivingStore } from "../../handroll";
import { vehicleById } from "../../entities/vehicles/catalog";
import { startedStore } from "../../commands";

const ignoreSaveChanges = () => () => {};
const SAVE_LABELS = { idle: "Ready", loading: "Loading…", saving: "Saving…", saved: "Saved", error: "Save failed", unavailable: "Unavailable" };

export function SessionUI() {
  const focusRef = useRef<HTMLButtonElement>(null);
  const { commands } = useGame();
  const settings = useSettings();
  const session = useStore(sessionStore, (value) => value);
  const started = useStore(startedStore, (value) => value === true);
  const courier = useStore(courierStore, (value) => value);
  const save = useGameStore((ctx) => ctx.game.save);
  // Saves have their own signal; the paused world cannot drive this status label.
  const saveStatus = useSyncExternalStore<keyof typeof SAVE_LABELS>(save?.subscribe ?? ignoreSaveChanges, () => save?.status() ?? "unavailable", () => "unavailable");
  useLayoutEffect(() => {
    if (started && !session.paused && !session.notice && !settings.isOpen) focusRef.current?.closest<HTMLElement>("[tabindex='0']")?.focus({ preventScroll: true });
  }, [started, session.paused, session.notice, settings.isOpen]);
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
    return <div data-jg-menu className="hh-overlay"><section role="dialog" aria-modal="true" aria-labelledby="hh-result-title" className="hh-modal">
      <div className="hh-eyebrow">{delivery ? "Mainsail express / dispatch receipt" : "Harbor Heat / recovery"}</div>
      <h2 id="hh-result-title">{delivery ? won ? "Signed. Sealed. Paid." : courier.failureReason === "returned" ? "Back at dispatch." : "Missed the tide." : "Back on your feet."}</h2>
      <p>{delivery ? won ? `${route.recipient} received the parcel. Another route is waiting at dispatch.` : courier.failureReason === "returned" ? `Parcel handed back at dispatch. No delivery pay; ${courier.bond > 0 ? `your $${courier.bond} bond was refunded.` : "no cash was lost."}` : `${courier.failureReason === "damage" ? "The fragile parcel was destroyed." : courier.failureReason === "recovery" ? "Recovery ended this delivery." : "The deadline expired."} ${courier.bond > 0 ? `$${courier.bond} bond forfeited. Standard deliveries remain free.` : "The parcel returned to dispatch; no cash was lost."}` : session.notice}</p>
      {delivery && won && <div className="hh-payout">+${courier.reward}<small>includes time bonus · +{courier.credReward} cred{courier.bond > 0 ? ` · $${courier.bond} bond returned` : ""}</small></div>}
      <button autoFocus type="button" className="hh-button hh-button-primary" onClick={() => commands.run(delivery ? "courier.dismiss" : "session.dismiss", {})}>Keep exploring ↗</button>
    </section></div>;
  }
  if (session.paused) return <div data-jg-menu className="hh-overlay"><section role="dialog" aria-modal="true" aria-labelledby="hh-pause-title" className="hh-modal">
    <div className="hh-eyebrow">Harbor Heat / off the clock</div><h2 id="hh-pause-title">Catch your breath.</h2>
    <p>The city and delivery clock are paused. Your story stays right here.</p>
    <div className="hh-menu-actions"><button autoFocus className="hh-button hh-button-primary" onClick={() => commands.run("session.pause", { paused: false })}>Back to the coast ↗</button>
      <SettingsTrigger className="hh-button hh-button-secondary" label="Settings">Settings & controls</SettingsTrigger>
      <button className="hh-button hh-button-secondary" disabled={!save || saveStatus === "saving"} onClick={() => commands.run("session.save", {})}>Save progress</button>
    </div><small aria-live="polite">Save: {SAVE_LABELS[saveStatus]}</small>
  </section></div>;
  return <button ref={focusRef} className="hh-pause-trigger" type="button" onClick={() => commands.run("session.pause", { paused: true })}>Ⅱ <span>Pause · P</span></button>;
}

export function CourierHud() {
  const courier = useStore(courierStore, (value) => value);
  const drivenId = useStore(drivingStore, (value) => value ?? null);
  const position = useGameStore((ctx) => ctx.scene.entity.get(drivenId ?? ctx.player.userId)?.position ?? null);
  const groundVehicle = useGameStore((ctx) => vehicleById(ctx.scene.entity.get(drivenId ?? "")?.name ?? "")?.dynamics.type === "ground");
  const cash = useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, "cash"));
  const { commands } = useGame();
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  const running = courier.phase === "running";
  const distance = position === null ? 0 : Math.round(Math.hypot(position[0] - DISPATCH[0], position[2] - DISPATCH[1]));
  const nextRoute = courier.completed % DELIVERY_ROUTES.length;
  const standard = courierOffer(nextRoute);
  const express = courierOffer(nextRoute, "express");
  return <section className={`hh-courier ${running && courier.remaining < 15 ? "hh-urgent" : ""}`} aria-label="Courier dispatch">
    <div className="hh-courier-label">{running ? "Parcel on board" : "Mainsail express"}<span>{running ? `${Math.ceil(courier.remaining)}s` : `${courier.completed} delivered`}</span></div>
    <strong>{running ? route.label : DELIVERY_ROUTES[nextRoute]!.label}</strong>
    <p>{running ? `${route.recipient} · ${courier.distance} m` : `Teal booth by the shore · ${distance} m`}</p>
    {running && courier.service === "express" && <p>Cargo {Math.round(courier.condition)}% · ${courier.bond} bond at risk</p>}
    {!running && distance < 9 && <p>Standard {standard.seconds}s · ${standard.payout}+ · no bond<br/>Express {express.seconds}s · ${express.payout}+ · $100 bond<br/>Express crashes reduce pay; failure loses bond.</p>}
    {running ? <><progress max={courier.totalSeconds} value={courier.remaining} aria-label="Delivery time remaining" /><small>{COURIER_SERVICES[courier.service].label}{courier.service === "express" ? ` · cargo ${Math.round(courier.condition)}% · $${courier.bond} bond` : " · no bond"}. {route.hint} Stop, then E / Use.</small>{distance < 9 && <button type="button" className="hh-inline-action" onClick={() => commands.run("courier.return", {})}>Return parcel{courier.bond ? " · refund bond" : ""}</button>}</> : <><small>Standard: {standard.seconds}s · ${standard.payout}+bonus · +{standard.cred} cred. Free on foot or in a car.</small>{distance < 9 && <><button type="button" className="hh-inline-action" onClick={() => commands.run("courier.accept", {})}>Take standard parcel · E ↗</button><small>Express: {express.seconds}s · up to ${express.payout}+bonus · +{express.cred} cred. Ground car required. $100 bond returned on delivery; crashes reduce pay.</small><button type="button" className="hh-inline-action" disabled={!groundVehicle || cash < express.bond} onClick={() => commands.run("courier.accept", { service: "express" })}>{!groundVehicle ? "Enter a car for express" : cash < express.bond ? "Express needs $100 bond" : "Take fragile express ↗"}</button></>}</>}
  </section>;
}
