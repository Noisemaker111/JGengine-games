import { useEffect, useState, type ReactNode } from "react";
import { CARD_CATALOG, upgradeCardType, type CardData } from "../cards";
import type { RunSnapshot } from "../run";

export function RoadStops({ run, command, renderCard }: {
  run: RunSnapshot;
  command: (name: string, data?: Record<string, unknown>) => unknown;
  renderCard: (card: CardData, onClick: () => void, hint: string, disabled: boolean) => ReactNode;
}) {
  const [upgrades, setUpgrades] = useState(false);
  const route = run.route;
  useEffect(() => setUpgrades(false), [route.nodeId]);
  if (!route) return null;
  return <>
    <div className="travel-ledger"><span><b>{run.combat.hero.hp}</b> / {run.combat.hero.maxHp} HP</span><span><b>{route.coins}</b> coins</span><span><b>{route.battlesWon}</b> battles won</span></div>
    {run.phase === "route" && <div className="road-forks">{route.choices.map(node => <button key={node.id} className={`road-fork ${node.kind}`} onClick={() => command("chooseRoute", { nodeId: node.id })}><span className="eyebrow">{node.kind === "combat" ? "Battle" : node.kind === "shop" ? "Trader" : node.kind === "rest" ? "Shelter" : "Roadside encounter"}</span><strong>{node.title}</strong><span>{node.text}</span>{node.bounty !== undefined && <small>Victory pays {node.bounty} coins</small>}<b className="fork-action">Take this road →</b></button>)}</div>}
    {run.phase === "shop" && <><p>{route.node.text} Purchases spend the coins you carry. Leave with any unspent coins.</p><div className="road-offers">{run.shopOffers.map(offer => <div className="road-offer" key={offer.id}>{offer.card ? renderCard(offer.card, () => command("buyRoad", { offerId: offer.id }), `${offer.cost} coins${offer.disabledReason ? ` · ${offer.disabledReason}` : ""}`, !!offer.disabledReason) : <><h2>{offer.name}</h2><p>{offer.text}</p>{offer.id === "prune" ? <div className="pack-actions">{run.pack.map(entry => <button disabled={!!offer.disabledReason} key={entry.id} onClick={() => command("buyRoad", { offerId: offer.id, cardId: entry.id })}>Remove {entry.card.name} · {offer.cost} coins</button>)}</div> : <button disabled={!!offer.disabledReason} onClick={() => command("buyRoad", { offerId: offer.id })}>Buy · {offer.cost} coins</button>}{offer.disabledReason && <small>{offer.disabledReason}</small>}</>}</div>)}</div><button className="primary" onClick={() => command("leaveRoadNode")}>Leave the trader</button></>}
    {run.phase === "rest" && <><p>{route.node.text} Choose one service here: healing or an upgrade. The other is left behind.</p><button className="primary" disabled={route.serviceUsed || run.combat.hero.hp === run.combat.hero.maxHp} onClick={() => command("restRoad", { action: "heal" })}>Rest · recover {Math.min(18, run.combat.hero.maxHp - run.combat.hero.hp)} HP</button><button aria-expanded={upgrades} onClick={() => setUpgrades(!upgrades)}>Upgrade a card instead</button>{upgrades && <div className="pack-actions">{run.pack.filter(entry => entry.canUpgrade).map(entry => <button disabled={route.serviceUsed} key={entry.id} onClick={() => command("restRoad", { action: "upgrade", cardId: entry.id })}>Upgrade {entry.card.name}<small>{CARD_CATALOG[upgradeCardType(entry.card.type)!]?.text}</small></button>)}</div>}{route.serviceUsed && <p role="status">Your shelter choice is complete.</p>}<button onClick={() => command("leaveRoadNode")}>Travel on without resting or upgrading</button></>}
    {run.phase === "event" && <><p>{route.node.text}</p><div className="road-event-choices">{run.eventChoices.map(choice => <button className="road-fork" key={choice.id} disabled={!!choice.disabledReason} onClick={() => command("chooseRoadEvent", { choiceId: choice.id })}><strong>{choice.label}</strong><span>{choice.text}</span>{choice.disabledReason && <small>{choice.disabledReason}</small>}</button>)}</div><button onClick={() => command("leaveRoadNode")}>Leave without taking a choice</button></>}
    <button onClick={() => command("pauseRun")}>Pause crossing</button>
    {route.journal.length > 0 && <details className="travel-journal"><summary>Consequences along the road</summary><ol>{route.journal.slice(0,6).map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ol></details>}
  </>;
}
