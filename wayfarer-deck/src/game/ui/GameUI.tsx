import { useEffect, useRef, useState, type ReactNode } from "react";
import "../../style.css";
import { useGame } from "@jgengine/react/hooks";
import type { CardData } from "../cards";
import type { CombatantView, HandCard } from "../combat";
import { ENCOUNTERS, type Intent } from "../enemy";
import { CardArtIcon } from "./icons";
import { RoadLandscape, EnemyArt, ROAD_PLACES } from "./RoadArt";
import { useRun } from "./useRun";

const PREF_KEY = "wayfarer-deck.road-preferences.v1";
function initialPrefs() {
  try {
    const value = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}");
    return { reducedMotion: value?.reducedMotion === true, largeText: value?.largeText === true };
  }
  catch { return {}; }
}
function Vitality({ view, name }: { view: CombatantView; name: string }) {
  return <div className="vitality"><div className="vitality-label"><strong>{name}</strong><span>{view.hp} / {view.maxHp} HP</span></div>
    <div className="health-track" role="meter" aria-label={`${name} health`} aria-valuenow={view.hp} aria-valuemin={0} aria-valuemax={view.maxHp}><i style={{width: `${view.hp / view.maxHp * 100}%`}}/></div>
    <div className="statuses">{view.block > 0 && <span className="block">{view.block} Block</span>}{view.strength > 0 && <span>{view.strength} Strength</span>}{view.weak > 0 && <span title="Deals 25% less attack damage">Weak {view.weak}</span>}{view.vulnerable > 0 && <span title="Takes 50% more attack damage">Vulnerable {view.vulnerable}</span>}</div>
  </div>;
}
function intentText(intent: Intent | null) {
  if (!intent) return "The road is quiet";
  if (intent.kind === "attack") return `${intent.value}${(intent.hits ?? 1) > 1 ? ` × ${intent.hits}` : ""} incoming damage`;
  if (intent.kind === "defend") return `Preparing ${intent.value} Block`;
  if (intent.kind === "buff") return `Gathering ${intent.value} Strength`;
  return `Applying ${intent.value} ${intent.status === "weak" ? "Weak" : "Vulnerable"}`;
}
function Card({ card, disabled, onClick, hint, ordinal }: { card: CardData; disabled?: boolean; onClick: () => void; hint?: string; ordinal?: number }) {
  return <button className={`road-card ${card.kind}`} disabled={disabled} onClick={onClick} aria-label={`${card.name}, ${card.cost} energy. ${card.text}${hint ? ` ${hint}` : ""}`}>
    <span className="card-heading"><b className="card-cost" title="Energy cost">{card.cost}</b><strong>{card.name}</strong>{ordinal && <kbd>{ordinal}</kbd>}</span>
    <span className="card-art"><span className="card-orbit"/><CardArtIcon art={card.art}/><span className="card-kind">{card.kind}</span></span>
    <span className="card-description">{card.text}</span>{hint && <small>{hint}</small>}
  </button>;
}
function Hand({ children, count, reducedMotion }: { children: ReactNode; count: number; reducedMotion: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = () => {
    const hand = ref.current;
    if (!hand) return;
    const next = { start: hand.scrollLeft <= 1, end: hand.scrollWidth - hand.clientWidth - hand.scrollLeft <= 1 };
    setEdges(current => current.start === next.start && current.end === next.end ? current : next);
  };
  useEffect(() => {
    const hand = ref.current;
    if (!hand) return;
    const observer = new ResizeObserver(measure);
    observer.observe(hand);
    measure();
    return () => observer.disconnect();
  }, [count]);
  const scroll = (direction: number) => {
    const hand = ref.current;
    if (!hand) return;
    const still = reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hand.scrollBy({ left: direction * Math.max(135, hand.clientWidth - 145), behavior: still ? "instant" : "smooth" });
  };
  const overflow = !edges.start || !edges.end;
  return <>
    <div className="hand-heading"><span><strong>Your hand</strong> · {count} {count === 1 ? "card" : "cards"}</span>{overflow && <div className="hand-navigation"><span>Swipe or browse</span><button aria-label="Show earlier cards" aria-controls="crossing-hand" disabled={edges.start} onClick={() => scroll(-1)}>←</button><button aria-label="Show later cards" aria-controls="crossing-hand" disabled={edges.end} onClick={() => scroll(1)}>→</button></div>}</div>
    <div id="crossing-hand" ref={ref} className="road-hand" onScroll={measure}>{children}</div>
  </>;
}
function Dialog({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="road-overlay"><section ref={ref} className="road-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
    // Keep native dialog navigation and activation out of shell pointer-lock shortcuts.
    if (event.key === "Tab" || event.key === " " || event.key === "Enter") event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input") ?? []);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</section></div>;
}
export function GameUI() {
  const run = useRun();
  const { commands } = useGame();
  const [settings, setSettings] = useState(false);
  const [deck, setDeck] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [prefs, setPrefs] = useState(initialPrefs);
  const s = run.combat;
  const previousHealth = useRef({ encounter: run.encounterIndex, enemy: s.enemy.hp, hero: s.hero.hp });
  const [impact, setImpact] = useState({ enemy: 0, hero: 0, sequence: 0 });
  useEffect(() => {
    const previous = previousHealth.current;
    const sameEncounter = previous.encounter === run.encounterIndex;
    const enemy = sameEncounter ? Math.max(0, previous.enemy - s.enemy.hp) : 0;
    const hero = sameEncounter ? Math.max(0, previous.hero - s.hero.hp) : 0;
    previousHealth.current = { encounter: run.encounterIndex, enemy: s.enemy.hp, hero: s.hero.hp };
    if (enemy || hero || !sameEncounter || s.enemy.hp > previous.enemy || s.hero.hp > previous.hero) setImpact(current => ({ enemy, hero, sequence: current.sequence + 1 }));
  }, [run.encounterIndex, s.enemy.hp, s.hero.hp]);
  const packCards = [...new Map(s.cards.map(card => [card.type, card])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const active = run.screen === null && run.phase === "combat" && !settings && !deck;
  const command = (name: string, data = {}) => commands.run(name, data);
  const play = (entry: HandCard) => command("playCard", {cardId: entry.id});
  const pause = () => command("pauseRun");
  const resume = () => { setSettings(false); setDeck(false); setConfirmNew(false); command("resumeRun"); };
  const newRun = () => { setConfirmNew(false); setSettings(false); setDeck(false); command("startNewRun"); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key !== "Escape" && /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmNew) { setConfirmNew(false); return; }
        if (settings) { setSettings(false); return; }
        if (deck) { setDeck(false); return; }
        if (run.screen === "paused") resume(); else if (run.screen === null) pause();
      } else if (active && (event.code === "KeyF" || event.key.toLowerCase() === "f")) {
        event.preventDefault();
        command("endTurn");
      } else if (active && /^[1-9]$/.test(event.key)) {
        const entry = s.hand[Number(event.key)-1];
        if (entry && entry.card.cost <= s.energy.current) { event.preventDefault(); play(entry); }
      }
    };
    const onHide = () => { if (document.hidden && run.screen === null) pause(); };
    window.addEventListener("keydown", onKey); document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onHide); };
  }, [run.screen, active, s.hand, s.energy.current, settings, deck, confirmNew, commands]);
  const setPreference = (key: "largeText" | "reducedMotion", value: boolean) => {
    const next = {...prefs, [key]: value}; setPrefs(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* Run status communicates unavailable browser storage. */ }
  };
  const openSettings = () => { pause(); setSettings(true); };
  return <main className={`wayfarer-road ${prefs.reducedMotion ? "still-road" : ""} ${prefs.largeText ? "large-road" : ""}`} onKeyDown={event => {
    // Native UI navigation must not become the shell's Tab/Space gameplay actions.
    if ((event.key === "Tab" || event.key === " ") && (event.target as HTMLElement).closest("button, input, summary, [role=dialog]")) event.stopPropagation();
  }}>
    <RoadLandscape stage={run.encounterIndex}/><div className="road-shade"/>
    <div className="road-board" inert={run.screen !== null || run.phase !== "combat" || settings || deck || confirmNew}>
    <header className="road-header"><div><span className="eyebrow">The old road · {ROAD_PLACES[run.encounterIndex]}</span><h1>Wayfarer Deck</h1></div><nav aria-label="Run controls"><span className="save-state">{run.saveStatus === "saved" ? "Run saved on this device" : run.saveStatus === "unavailable" ? "Saving unavailable" : run.saveStatus === "damaged" ? "Saved run unreadable" : "A new crossing awaits"}</span><button onClick={openSettings}>Settings</button>{run.screen === null && (run.phase === "combat" || run.phase === "reward") && <button onClick={pause}>Pause <kbd>Esc</kbd></button>}</nav></header>
    <ol className="road-route" aria-label="Crossing route">{ENCOUNTERS.map((enemy, i) => <li key={enemy.id} className={i < run.encounterIndex || run.phase === "victory" ? "cleared" : i === run.encounterIndex ? "current" : ""}><span>{i < run.encounterIndex || run.phase === "victory" ? "✓" : i+1}</span><strong>{enemy.name}</strong></li>)}</ol>
    <section className="encounter-stage" aria-label="Battlefield">
      <div className="hero-ledger"><p className="eyebrow">Your journey · Turn {s.round}</p><Vitality name="Wayfarer" view={s.hero}/>{impact.hero > 0 && <span key={impact.sequence} className="impact-badge hero-impact" aria-hidden="true">−{impact.hero} HP</span>}<p className="road-advice">Read the enemy intent. Block lasts until your next turn. Strength lasts for this battle.</p><details className="combat-journal"><summary>Road journal</summary><ol>{s.log.slice(0, 8).map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ol></details></div>
      <div className="enemy-stage"><div className={`enemy-intent ${s.intent?.kind ?? "quiet"}`} aria-live="polite">{intentText(s.intent)}</div><EnemyArt index={run.encounterIndex}/>{impact.enemy > 0 && <span key={impact.sequence} className="impact-badge" aria-hidden="true">−{impact.enemy} HP</span>}<span className="enemy-tier">{s.enemy.tier === "normal" ? "Road encounter" : s.enemy.tier === "elite" ? "Elite encounter" : "Keeper of the crossing"}</span><Vitality name={s.enemy.name} view={s.enemy}/></div>
    </section>
    <section className="hand-dock" aria-label="Your hand"><div className="turn-toolbar"><div className="energy-counter"><b>{s.energy.current}</b><span> / {s.energy.max}<small>ENERGY</small></span></div><button className="pile-button" onClick={() => { pause(); setDeck(true); }}>{s.deckCount} draw · {s.discardCount} discard · {s.exhaustCount} exhaust</button><span className="turn-help">{s.energy.current === 0 ? "Energy spent. End your turn." : "Choose a card · keys 1–9"}</span><button className="primary end-turn" disabled={!active} onClick={() => command("endTurn")}>End turn <kbd>F</kbd></button></div><Hand count={s.hand.length} reducedMotion={!!prefs.reducedMotion}>{s.hand.map((entry, i) => <Card key={entry.id} card={entry.card} ordinal={i+1} disabled={!active || entry.card.cost > s.energy.current} onClick={() => play(entry)} hint={entry.card.cost > s.energy.current ? "Not enough energy" : undefined}/>)}{s.hand.length === 0 && <p className="empty-hand">Your hand is empty. End your turn to draw again.</p>}</Hand></section>
    <p className="road-announcement" role="status" aria-live="polite">{s.log[0]}</p>
    </div>
    {run.screen === "menu" && <Dialog eyebrow="A tactical crossing in five encounters" title="Take the old road"><p>Build your deck, read your foes, and reach the gate beyond the ridge. Every card is a choice; every wound travels with you.</p><div className="rules-grid"><span><b>3 energy</b> each turn</span><span><b>5 cards</b> in each new hand</span><span><b>Rewards or rest</b> between battles</span></div>{run.canContinue && <button className="primary" onClick={resume}>Continue crossing · {run.encounterIndex+1} / {run.encounterCount}</button>}<button className={run.canContinue ? "secondary" : "primary"} onClick={() => run.canContinue ? setConfirmNew(true) : newRun()}>Begin a new crossing</button><button onClick={() => setSettings(true)}>Settings & controls</button><small>{run.saveStatus === "damaged" ? "The previous save could not be read. It remains untouched until you begin a new crossing." : "Your run is saved automatically in this browser."}</small></Dialog>}
    {run.screen === "paused" && !settings && !deck && <Dialog eyebrow={`Encounter ${run.encounterIndex+1} · Turn ${s.round}`} title="Rest your hand"><p>The crossing is paused. Your cards and energy will be here when you return.</p><button className="primary" onClick={resume}>Resume crossing</button><button onClick={() => setSettings(true)}>Settings & controls</button><button onClick={() => setConfirmNew(true)}>Begin a new crossing</button></Dialog>}
    {run.phase === "reward" && run.screen === null && <Dialog eyebrow={`Encounter ${run.encounterIndex+1} cleared`} title="At the roadside fire"><p>Take one card for your deck, or rest to recover up to 12 HP. Your next foe is {ENCOUNTERS[run.encounterIndex+1]?.name}.</p><div className="reward-hand">{run.rewardOptions.map(card => <Card key={card.type} card={card} onClick={() => command("chooseReward", {cardType: card.type})}/>)}</div><button className="primary" disabled={s.hero.hp === s.hero.maxHp} onClick={() => command("recoverRoad")}>Rest · recover {Math.min(12, s.hero.maxHp-s.hero.hp)} HP</button><button onClick={() => command("skipReward")}>Travel on without a reward</button></Dialog>}
    {(run.phase === "victory" || run.phase === "defeat") && run.screen === null && <Dialog eyebrow="The old road remembers" title={run.phase === "victory" ? "Beyond the gate" : "The road takes its toll"}><p>{run.phase === "victory" ? `You crossed all five encounters with ${s.hero.hp} HP remaining. The gate opens to a new dawn.` : `Your crossing ended at ${s.enemy.name}, encounter ${run.encounterIndex+1} of five. Try guarding incoming attacks and resting by the fire.`}</p><button className="primary" onClick={newRun}>Begin another crossing</button></Dialog>}
    {deck && <Dialog eyebrow="Cards travel with you" title="Your pack"><p>{s.deckCount} cards in the draw pile, {s.discardCount} discarded, {s.exhaustCount} exhausted and {s.hand.length} in hand. Discards reshuffle when the draw pile is empty. Exhausted cards return next battle.</p><ul className="pack-list">{packCards.map(card => <li key={card.type}><b>{s.cards.filter(entry => entry.type === card.type).length} × {card.name}</b><span>{card.cost} energy · {card.text}</span></li>)}</ul><button className="primary" onClick={() => setDeck(false)}>Back</button></Dialog>}
    {settings && <Dialog eyebrow="Make the road yours" title="Settings & controls"><label className="preference"><input type="checkbox" checked={!!prefs.reducedMotion} onChange={e => setPreference("reducedMotion", e.target.checked)}/> Reduce motion</label><label className="preference"><input type="checkbox" checked={!!prefs.largeText} onChange={e => setPreference("largeText", e.target.checked)}/> Larger card text</label><p>Click or tap a card to play. Keys <kbd>1–9</kbd> play cards in hand order. <kbd>F</kbd> ends the turn. <kbd>Esc</kbd> pauses or resumes. The road pauses when you leave this tab.</p><button className="primary" onClick={() => setSettings(false)}>Back</button><small>Original road and creature artwork authored for Wayfarer Deck. Powered by JG Engine.</small></Dialog>}
    {confirmNew && <Dialog eyebrow="Leave this crossing" title="Start again?"><p>This replaces your saved crossing with a fresh deck and full health.</p><button className="primary" onClick={() => setConfirmNew(false)}>Keep this crossing</button><button className="restart-crossing" onClick={newRun}>Replace saved crossing</button></Dialog>}
  </main>;
}
