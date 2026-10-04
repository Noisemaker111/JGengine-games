import { useEffect, useRef, type ReactNode } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { session } from "../../session";

export function ParkDialog({
  title,
  children,
  onClose,
  blockGameKeys = false,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  blockGameKeys?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="park-modal-scrim"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="park-dialog park-surface"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (blockGameKeys) e.stopPropagation();
          if (e.key === "Escape" && onClose) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,a[href],[tabindex="0"]',
            );
            if (!nodes?.length) {
              e.preventDefault();
              return;
            }
            const first = nodes[0]!,
              last = nodes[nodes.length - 1]!;
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ParkFlow({
  settings,
  onCloseSettings,
  reducedMotion,
  onReducedMotion,
  contrast,
  onContrast,
}: {
  settings: boolean;
  onCloseSettings: () => void;
  reducedMotion: boolean;
  onReducedMotion: (v: boolean) => void;
  contrast: boolean;
  onContrast: (v: boolean) => void;
}) {
  const { commands } = useGame();
  const clock = useGameClock();
  useGameStore(() =>
    [
      session.started,
      session.gameOver,
      session.won,
      session.winDismissed,
      session.hasSave,
      session.saveStatus,
    ].join("|"),
  );
  const logo = (
    <img
      className="park-dialog-logo"
      src={
        new URL("../../../../public/art/brightway-sign.svg", import.meta.url)
          .href
      }
      alt="Brightway Park"
    />
  );
  if (settings)
    return (
      <ParkDialog title="Park settings" onClose={onCloseSettings} blockGameKeys>
        <div className="park-section-label">MAKE YOURSELF AT HOME</div>
        <h1>Park settings</h1>
        <label className="park-setting">
          <span>
            <strong>Reduce motion</strong>
            <small>Still ride mechanisms and gentle UI transitions.</small>
          </span>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => onReducedMotion(e.target.checked)}
          />
        </label>
        <label className="park-setting">
          <span>
            <strong>Stronger HUD contrast</strong>
            <small>Solid panels for clear labels over the park.</small>
          </span>
          <input
            type="checkbox"
            checked={contrast}
            onChange={(e) => onContrast(e.target.checked)}
          />
        </label>
        <div className="park-help">
          <strong>Make your way around</strong>
          <p>
            WASD / arrow keys pan · Q / E rotate · scroll to zoom. Build with
            the catalog, then click an empty plot. Right-click or X cancels. P
            pauses.
          </p>
          <p>
            1 carousel · 2 coaster · 3 track · 4 food · 5 tree · 6 path. On
            small or touch screens, hold the camera arrows to pan or rotate and
            use ＋ / − to zoom. Choose a blueprint and tap an empty plot to
            build.
          </p>
        </div>
        <div className="park-settings-host">
          <span>Rendering, sound & input</span>
          <SettingsTrigger className="park-button" />
        </div>
        <p className="park-save-note">
          {session.saveStatus}. Saves stay in this browser.
        </p>
        <button className="park-button primary" onClick={onCloseSettings}>
          Back to the park
        </button>
      </ParkDialog>
    );
  if (!session.started)
    return (
      <ParkDialog title="Welcome to Brightway Park">
        {logo}
        <div className="park-section-label">THE SEASIDE IS CALLING</div>
        <h1>
          Your midway.
          <br />
          Your magnificent little world.
        </h1>
        <p>
          Turn a quiet coastal fair into a blue ribbon park. Build three rides,
          reach 220 stars, close a profitable day, and keep your visitors happy
          and the midway clean.
        </p>
        <div className="park-start-cards">
          <div>
            <b>01</b>
            <strong>Build with character</strong>
            <span>Pick a ride, then click an open plot.</span>
          </div>
          <div>
            <b>02</b>
            <strong>Care for the crowd</strong>
            <span>Refreshments and a janitor keep the smiles coming.</span>
          </div>
          <div>
            <b>03</b>
            <strong>Balance the books</strong>
            <span>Ticket sales pay for upkeep at midnight.</span>
          </div>
        </div>
        <button
          className="park-button primary"
          onClick={() => commands.run("park.start", {})}
        >
          {session.hasSave
            ? `Continue day ${session.day}`
            : "Open Brightway Park"}
        </button>
        {session.hasSave && (
          <button
            className="park-button"
            onClick={() => commands.run("park.new", {})}
          >
            Start fresh · archive current save
          </button>
        )}
        <small className="park-save-note">
          {session.saveStatus}. P pauses · WASD pans · scroll zooms.
        </small>
      </ParkDialog>
    );
  if (session.gameOver)
    return (
      <ParkDialog title="Park bankrupt">
        {logo}
        <div className="park-section-label">THE LIGHTS GO DOWN</div>
        <h1>A season to learn from</h1>
        <p>
          Three days in debt have closed the gates. Your park reached{" "}
          {Math.round(session.rating)} stars in {session.day - 1} days.
        </p>
        <p>
          Next time, keep an eye on nightly upkeep and give guests somewhere to
          eat and drink.
        </p>
        <button
          className="park-button primary"
          onClick={() => commands.run("park.new", {})}
        >
          Reopen a new park · archive this save
        </button>
      </ParkDialog>
    );
  if (session.won && !session.winDismissed)
    return (
      <ParkDialog title="Blue ribbon awarded">
        {logo}
        <div className="park-ribbon">★</div>
        <div className="park-section-label">BRIGHT DAYS AHEAD</div>
        <h1>Your first blue ribbon!</h1>
        <p>
          Three rides, a profitable day, and a happy, tidy park. Brightway has
          become a seaside favorite.
        </p>
        <button
          className="park-button primary"
          onClick={() => commands.run("park.continue", {})}
        >
          Keep building in free play
        </button>
        <small className="park-save-note">Your award and park are saved.</small>
      </ParkDialog>
    );
  if (clock.paused)
    return (
      <aside className="park-planning park-surface" aria-label="Park planning">
        <strong>Planning · visitors & finances paused</strong>
        <span>Build, refit and repair before reopening.</span>
        <div>
          <button onClick={() => commands.run("pauseToggle", {})}>
            Resume · P
          </button>
          <button onClick={() => commands.run("park.save", {})}>
            Save park
          </button>
        </div>
        <small role="status">{session.saveStatus}</small>
      </aside>
    );
  return null;
}
