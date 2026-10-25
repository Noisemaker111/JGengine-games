import { useEffect, useRef } from "react";
import { useGame } from "@jgengine/react/hooks";
import { KitResultScreen, type KitResultScreenProps } from "@jgengine/react/kitFlow";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { startedStore } from "../../commands";
import { courierStore, DELIVERY_ROUTES, RUSH_BOND, type CourierState } from "../../jobs/courier";
import { saveHarborState } from "../../save";
import { sessionStore } from "../../session";

type Result = Omit<KitResultScreenProps, "open" | "onAction">;

/** What the receipt says: delivered, missed, or (for a bust or a clinic stay) back on your feet. */
function resultOf(notice: string, courier: CourierState): Result {
  const title = { id: "title", label: "Title" };
  if (notice !== "courier") {
    const [head, body] = notice.split(" · ");
    return { tone: "warn", eyebrow: "Harbor Heat", title: head?.startsWith("Busted") === true ? "Busted." : "Back on your feet.", summary: body ?? notice, actions: [{ id: "roam", label: "Back to it", primary: true }, title] };
  }
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  const rush = courier.service === "rush";
  const roam = { id: "roam", label: "Free roam" };
  if (courier.receipt?.won === true) {
    const condition = rush ? [{ label: "Cargo condition", value: `${Math.round(courier.condition ?? 100)}%` }] : [];
    return { tone: "good", eyebrow: "Mainsail express · receipt", title: "Signed. Sealed. Paid.", summary: `${route.recipient} has the parcel.`, stats: [{ label: "Paid", value: `+$${courier.receipt.reward}` }, { label: "Street cred", value: "+15" }, ...condition], actions: [{ id: "next", label: "Next parcel", primary: true }, roam, title] };
  }
  const reason = courier.receipt?.reason ?? null;
  const late = reason === null || /deadline|expired/i.test(reason);
  return { tone: "bad", eyebrow: "Mainsail express · receipt", title: late ? "Missed the tide." : "Parcel lost.", summary: late ? (rush ? `Too slow: the $${RUSH_BOND} bond is gone. The parcel went back to dispatch.` : "Too slow: the parcel went back to dispatch. No cash lost.") : reason, actions: [{ id: "retry", label: "Try again", primary: true }, roam, title] };
}

/** Pause on P (also over a receipt), and the end-of-run receipt with its choices. */
export function SessionUI() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const settings = useSettings();
  const session = useStore(sessionStore, (value) => value);
  const started = useStore(startedStore, (value) => value === true);
  const courier = useStore(courierStore, (value) => value);
  useEffect(() => {
    // A restored snapshot can reset transient stores while the settings provider stays open.
    if (session.settings !== settings.isOpen) commands.run("session.settings", { open: settings.isOpen });
  }, [commands, settings.isOpen, session.settings]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.code !== "KeyP" || event.repeat || !started || settings.isOpen) return;
      if ((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      commands.run("session.pause", { paused: !session.paused });
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [commands, started, session.paused, settings.isOpen]);
  // The last receipt stays drawn while the screen plays its exit.
  const last = useRef<Result | null>(null);
  if (session.notice !== "") last.current = resultOf(session.notice, courier);
  if (!started || last.current === null) return null;
  const dismiss = session.notice === "courier" ? "courier.dismiss" : "session.dismiss";
  return (
    <KitResultScreen
      {...last.current}
      open={session.notice !== "" && !session.paused && !settings.isOpen}
      onAction={(id) => {
        if (id === "retry" || id === "next") return commands.run("courier.retry", { service: id === "retry" ? courier.service : undefined });
        commands.run(dismiss, {});
        // Title keeps the run where it stands, so Continue picks up here and not at an older autosave.
        if (id === "title") void saveHarborState(ctx).then(() => commands.run("session.title", {}));
      }}
    />
  );
}
