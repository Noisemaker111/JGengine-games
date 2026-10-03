import { useStore } from "@jgengine/react/store";
import { householdStore } from "../../session/store";
export function EventFeed() {
  const household = useStore(householdStore);
  return <section className="orbit-feed" aria-label="Household journal" aria-live="polite"><h2>Habitat journal</h2>{household.events.slice(-3).reverse().map(event => <p key={event.id} className={event.tone}>{event.text}</p>)}</section>;
}
