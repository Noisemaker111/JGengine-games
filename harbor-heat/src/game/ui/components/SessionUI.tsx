import { useEffect } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { sessionStore } from "../../session";
import { courierStore, DELIVERY_ROUTES, DISPATCH } from "../../jobs/courier";
import { startedStore } from "../../commands";

export function SessionUI() {
  const { commands } = useGame();
  const settings = useSettings();
  const session = useStore(sessionStore, (value) => value);
  const started = useStore(startedStore, (value) => value === true);
  const courier = useStore(courierStore, (value) => value);
  const save = useGameStore((ctx) => ctx.game.save?.status() ?? "idle");
  useEffect(() => { commands.run("session.settings", { open: settings.isOpen }); }, [commands, settings.isOpen]);
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
      <h2 id="hh-result-title">{delivery ? won ? "Signed. Sealed. Paid." : "Missed the tide." : "Back on your feet."}</h2>
      <p>{delivery ? won ? `${route.recipient} received the parcel. Another route is waiting at dispatch.` : "The deadline expired. Your parcel returned to dispatch; no cash was lost." : session.notice}</p>
      {delivery && won && <div className="hh-payout">+${courier.reward}<small>includes time bonus · +15 cred</small></div>}
      <button autoFocus type="button" className="hh-button hh-button-primary" onClick={() => commands.run(delivery ? "courier.dismiss" : "session.dismiss", {})}>Keep exploring ↗</button>
    </section></div>;
  }
  if (session.paused) return <div data-jg-menu className="hh-overlay"><section role="dialog" aria-modal="true" aria-labelledby="hh-pause-title" className="hh-modal">
    <div className="hh-eyebrow">Harbor Heat / off the clock</div><h2 id="hh-pause-title">Catch your breath.</h2>
    <p>The city and delivery clock are paused. Your story stays right here.</p>
    <div className="hh-menu-actions"><button autoFocus className="hh-button hh-button-primary" onClick={() => commands.run("session.pause", { paused: false })}>Back to the coast ↗</button>
      <SettingsTrigger className="hh-button hh-button-secondary" label="Settings">Settings & controls</SettingsTrigger>
      <button className="hh-button hh-button-secondary" onClick={() => commands.run("session.save", {})}>Save progress</button>
    </div><small aria-live="polite">Save: {save}</small>
  </section></div>;
  return <button className="hh-pause-trigger" type="button" onClick={() => commands.run("session.pause", { paused: true })}>Ⅱ <span>Pause · P</span></button>;
}

export function CourierHud() {
  const courier = useStore(courierStore, (value) => value);
  const position = useGameStore((ctx) => ctx.scene.entity.get(ctx.player.userId)?.position ?? null);
  const { commands } = useGame();
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  const running = courier.phase === "running";
  const distance = position === null ? 0 : Math.round(Math.hypot(position[0] - DISPATCH[0], position[2] - DISPATCH[1]));
  return <section className={`hh-courier ${running && courier.remaining < 15 ? "hh-urgent" : ""}`} aria-label="Courier dispatch">
    <div className="hh-courier-label">{running ? "Parcel on board" : "Mainsail express"}<span>{running ? `${Math.ceil(courier.remaining)}s` : `${courier.completed} delivered`}</span></div>
    <strong>{running ? route.label : "Take a coastal delivery"}</strong>
    <p>{running ? `${route.recipient} · ${courier.distance} m` : `Teal booth by the shore · ${distance} m`}</p>
    {running ? <><progress max={route.seconds} value={courier.remaining} aria-label="Delivery time remaining" /><small>{route.hint} Slow to a stop, then press E / Use at the tower.</small></> : <><small>Walk or drive. Earn cash + cred. No entry fee.</small>{distance < 9 && <button type="button" className="hh-inline-action" onClick={() => commands.run("courier.accept", {})}>Take parcel · E ↗</button>}</>}
  </section>;
}
