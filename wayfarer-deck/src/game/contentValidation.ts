import { validateContentReferences, validateContentProgression, type ContentEntry, type ContentReference, type ContentIssue } from "@jgengine/core/game/contentValidation";
import { BUILD_FOUNDATIONS, CARD_CATALOG, type CardData } from "./cards";
import { ENCOUNTERS } from "./enemy";
import { ROAD_NODES, freshRouteState, type RouteNode } from "./route";

/** The crossing owns card identities and road topology; the SDK checks declared relationships. */
export function validateCrossingContent(nodes: Readonly<Record<string, RouteNode>> = ROAD_NODES, cards: Readonly<Record<string, CardData>> = CARD_CATALOG) {
  const entries: ContentEntry[] = Object.entries(cards).map(([id, card]) => ({ kind: "card", id: card.type, path: `/cards/${id}` }));
  entries.push(...ENCOUNTERS.map((enemy, index) => ({ kind: "encounter", id: String(index), path: `/encounters/${index}` })));
  const refs: ContentReference[] = Object.entries(BUILD_FOUNDATIONS).map(([build, id]) => ({ kind: "card", id, path: `/foundations/${build}`, contentId: build }));
  const gameIssues: ContentIssue[] = [];
  const rules = [];
  const required = [];
  for (const [key, node] of Object.entries(nodes)) {
    const path = `/road/${key}`;
    entries.push({ kind: "road", id: node.id, path });
    refs.push({ kind: "road", id: node.id, path: `${path}/id`, contentId: node.id, allowedIds: [key] });
    if (node.kind === "combat" && node.encounterIndex === undefined) gameIssues.push({code:"missing-combat-encounter",severity:"error",path:`${path}/encounterIndex`,contentId:node.id,message:"Combat road stops require an encounter index.",repair:"Set encounterIndex to an authored encounter index."});
    if (node.encounterIndex !== undefined) refs.push({ kind: "encounter", id: String(node.encounterIndex), path: `${path}/encounterIndex`, contentId: node.id });
    for (const [index, next] of node.next.entries()) {
      refs.push({ kind: "road", id: next, path: `${path}/next/${index}`, contentId: node.id });
      rules.push({ id: `${node.id}:${index}`, path: `${path}/next/${index}`, requires: [node.id], provides: [next] });
    }
    required.push({ id: node.id, path, contentId: node.id });
  }
  for (const [id, card] of Object.entries(cards)) refs.push({ kind: "card", id: card.type, path: `/cards/${id}/type`, contentId: card.type, allowedIds: [id] });
  refs.push({ kind: "road", id: freshRouteState().nodeId, path: "/start", contentId: "crossing" });
  return [...gameIssues, ...validateContentReferences(entries, refs), ...validateContentProgression({ initial: [freshRouteState().nodeId], rules, required, closedWorld: true }).issues];
}
