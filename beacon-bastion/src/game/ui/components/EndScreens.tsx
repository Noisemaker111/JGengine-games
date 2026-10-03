import { useGame, useGameStore } from "@jgengine/react/hooks";
import { session } from "../../session";
import { TOTAL_WAVES } from "../../waves/manifest";
export function EndScreens() {
  const { commands } = useGame();
  const savedMessage = useGameStore(() => session.savedMessage);
  const over = useGameStore(() => session.gameOver),
    won = useGameStore(() => session.victory);
  if (!over && !won) return null;
  return (
    <div className="bb-terminal">
      <section
        className="bb-frame"
        role="dialog"
        aria-modal="true"
        aria-label={won ? "Keep defended" : "Keep fallen"}
      >
        <h1>{won ? "The Keep Holds" : "The Keep Has Fallen"}</h1>
        <p>
          {won
            ? `All ${TOTAL_WAVES} raids repelled. Your towers earned their beacon.`
            : "Recover with a saved defense, or rebuild your crossfire. Cannons counter armor; reserve pays for a rally."}
        </p>
        <div className="bb-actions">
          <button
            className="bb-primary"
            onClick={() => commands.run("restartRun", {})}
          >
            Build a new defense
          </button>
          <button onClick={() => commands.run("loadRun", {})}>
            Restore saved defense
          </button>
        </div>
        <p role="status">{savedMessage}</p>
      </section>
    </div>
  );
}
