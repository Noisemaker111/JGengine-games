import { useEffect, useSyncExternalStore } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { sessionStore } from "../../session";
import { courierStore, courierDeadline, courierObjectiveStore, DELIVERY_ROUTES, DISPATCH } from "../../jobs/courier";
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
    // The mission machine gives every failure its own line; the deadline is only one of them.
    const reason = courier.receipt?.reason ?? null;
    const late = reason === null || /deadline|expired/i.test(reason);
    const lostTitle = won ? "Signed. Sealed. Paid." : late ? "Missed the tide." : "Parcel lost.";
    const lostBody = reason ?? (courier.service === "rush" ? "Rush expired; $60 bond forfeited. A free standard delivery can get you earning again." : "The deadline expired. Your parcel returned to dispatch; no cash was lost.");
    return <div data-jg-menu className="hh-overlay"><HudSurface role="dialog" aria-modal="true" aria-labelledby="hh-result-title" className="hh-modal" elevation="modal" padding="var(--hh-modal-pad)">
      <div className="hh-eyebrow">{delivery ? "Mainsail express / dispatch receipt" : "Harbor Heat / recovery"}</div>
      <h2 id="hh-result-title">{delivery ? lostTitle : "Back on your feet."}</h2>
      <p>{delivery ? won ? `${route.recipient} received the parcel.${courier.service === "rush" ? ` Cargo condition ${Math.round(courier.condition ?? 100)}%; pay and bond refund scale with condition.` : " Another route is waiting at dispatch."}` : lostBody : session.notice}</p>
      {delivery && won && <div className="hh-payout">+${courier.receipt?.reward ?? 0}<small>{courier.service === "rush" ? "includes condition-based bond refund" : "includes time bonus"} · +15 cred</small></div>}
      <HudButton autoFocus className="hh-button hh-button-primary" onClick={() => commands.run(delivery ? "courier.dismiss" : "session.dismiss", {})}>Keep exploring ↗</HudButton>
    </HudSurface></div>;
  }
  // The pause screen is the shared game menu (HarborMenu); this component only reports the game.
  return <HudButton className="hh-pause-trigger" onClick={() => commands.run("session.pause", { paused: true })}>II <span>Pause - P</span></HudButton>;
}

export function CourierHud() {
  const courier = useStore(courierStore, (value) => value);
  const objective = useStore(courierObjectiveStore, (value) => value);
  const position = useGameStore((ctx) => ctx.scene.entity.get(ctx.player.userId)?.position ?? null);
  const { commands } = useGame();
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  const running = courier.phase === "running";
  const offer = DELIVERY_ROUTES[courier.delivered % DELIVERY_ROUTES.length]!;
  const distance = position === null ? 0 : Math.round(Math.hypot(position[0] - DISPATCH[0], position[2] - DISPATCH[1]));
  return <HudSurface as="section" className={`hh-courier ${running && courier.remaining < 15 ? "hh-urgent" : ""}`} aria-label="Courier dispatch" padding="var(--hh-courier-pad)">
    <div className="hh-courier-label">{running ? "Parcel on board" : "Mainsail express"}<span>{running ? `${Math.ceil(courier.remaining)}s` : `${courier.delivered} delivered`}</span></div>
    <strong>{running ? (objective?.label ?? route.label) : "Take a coastal delivery"}</strong>
    <p>{running ? (objective?.step === 2 ? "A runner has the parcel — stay on them" : `${route.recipient} · ${courier.distance} m`) : `Teal booth by the shore · ${distance} m`}</p>
    {running ? <><progress max={courierDeadline(route.seconds, courier.service === "rush")} value={courier.remaining} aria-label="Delivery time remaining" />{courier.service === "rush" && <><b>FRAGILE RUSH · cargo {Math.round(courier.condition ?? 100)}%</b><small>Above 35 km/h and taking damage spoil cargo; wage and bond refund fall with condition.</small></>}<small>{objective?.step === 2 ? "Get within three metres to recover the parcel — a dead runner means a burned parcel." : `${route.hint} Slow to a stop, then press E / Use at the tower.`}</small></> : <><small>{offer.label} · Standard ${offer.payout}+ · {offer.seconds}s · no fee or failure cost.</small>{distance < 9 && <><HudButton block className="hh-inline-action" onClick={() => commands.run("courier.accept", {})}>Take standard parcel · E ↗</HudButton>{courier.delivered > 0 && <><small>Fragile rush ${Math.floor(offer.payout * 1.8)}+ at 100% condition · {courierDeadline(offer.seconds, true)}s. $60 bond; condition scales wage/refund, expiry loses bond. Keep below 35 km/h; avoid damage.</small><HudButton block className="hh-inline-action" onClick={() => commands.run("courier.accept", { service: "rush" })}>Commit $60 bond · fragile rush ↗</HudButton></>}</>}</>}
  </HudSurface>;
}

