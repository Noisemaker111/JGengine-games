import { useGame, useGameStore } from "@jgengine/react/hooks";
import { DeathScreenView } from "@/components/ui/death-screen-view";
import { ResultsScreen } from "@/components/ui/results-screen";

import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { TOTAL_WAVES } from "../../waves/manifest";
import { session } from "../../session";

export function EndScreens() {
  const { commands } = useGame();
  const gameOver = useGameStore(() => session.gameOver);
  const victory = useGameStore(() => session.victory);
  const gold = useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY));

  if (gameOver) {
    return <DeathScreenView title="The Keep Has Fallen" subtitle="Your defense fell. Rebuild from a fresh purse and choose when the next assault begins." respawnLabel="Rebuild defense" onRespawn={() => commands.run("defense.restart", {})} />;
  }

  if (victory) {
    return (
      <ResultsScreen
        outcome="victory"
        title="The Keep Holds"
        entries={[{ id: "restart", label: "Defend again" }]}
        onActivate={() => commands.run("defense.restart", {})}
        lines={[
          { label: "Waves Survived", value: TOTAL_WAVES, accent: true },
          { label: "Gold Remaining", value: gold },
        ]}
      />
    );
  }

  return null;
}
