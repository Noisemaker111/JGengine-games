import { distance, walkable, WORLD_BOUNDS, type Place, type Point } from "../world";

const CELL = 0.5;
/** Routes use the same authored footprints and actor clearance as locomotion. */
export function traversable(from: Point, to: Point, place: Place): boolean {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 0.12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkable(from[0] + (to[0] - from[0]) * t, from[2] + (to[2] - from[2]) * t, place)) return false;
  }
  return true;
}

type Node = { at: Point; neighbors: number[] };
const graphs = new Map<Place, Node[]>();
function graph(place: Place): Node[] {
  const cached = graphs.get(place);
  if (cached) return cached;
  const nodes: Node[] = [], keys = new Map<string, number>();
  for (let x = WORLD_BOUNDS.minX + CELL / 2, ix = 0; x < WORLD_BOUNDS.maxX; x += CELL, ix++) {
    for (let z = WORLD_BOUNDS.minZ + CELL / 2, iz = 0; z < WORLD_BOUNDS.maxZ; z += CELL, iz++) {
      if (!walkable(x, z, place)) continue;
      keys.set(`${ix}:${iz}`, nodes.length);
      nodes.push({ at: [x, 0, z], neighbors: [] });
    }
  }
  for (const [key, id] of keys) {
    const [x, z] = key.split(":").map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const neighbor = keys.get(`${x! + dx!}:${z! + dz!}`);
      if (neighbor !== undefined && traversable(nodes[id]!.at, nodes[neighbor]!.at, place)) nodes[id]!.neighbors.push(neighbor);
    }
  }
  graphs.set(place, nodes);
  return nodes;
}

function anchor(nodes: Node[], point: Point, place: Place): number {
  // Only nearby connections are considered; a wall cannot connect to a distant room.
  const candidates = nodes.map((node, id) => ({ id, d: distance(point, node.at) })).filter(n => n.d <= CELL * 2).sort((a, b) => a.d - b.d);
  return candidates.find(n => traversable(point, nodes[n.id]!.at, place))?.id ?? -1;
}

/** Empty means unreachable. This is document-derived routing, not a baked navmesh. */
export function findRoute(from: Point, to: Point, place: Place): Point[] {
  if (traversable(from, to, place)) return [to];
  const nodes = graph(place), start = anchor(nodes, from, place), finish = anchor(nodes, to, place);
  if (start < 0 || finish < 0) return [];
  const costs = new Map<number, number>([[start, 0]]), previous = new Map<number, number>();
  const open = new Set([start]), closed = new Set<number>();
  while (open.size) {
    let current = -1, score = Infinity;
    for (const id of open) {
      const candidate = costs.get(id)! + distance(nodes[id]!.at, nodes[finish]!.at);
      if (candidate < score) { current = id; score = candidate; }
    }
    if (current === finish) {
      const path: Point[] = [to];
      let id = finish;
      while (id !== start) { path.unshift(nodes[id]!.at); id = previous.get(id)!; }
      path.unshift(nodes[start]!.at);
      return path;
    }
    open.delete(current); closed.add(current);
    for (const next of nodes[current]!.neighbors) {
      if (closed.has(next)) continue;
      const cost = costs.get(current)! + distance(nodes[current]!.at, nodes[next]!.at);
      if (cost < (costs.get(next) ?? Infinity)) { costs.set(next, cost); previous.set(next, current); open.add(next); }
    }
  }
  return [];
}

export interface Navigator { goal: Point | null; path: Point[] }
export function createNavigator(): Navigator { return { goal: null, path: [] }; }
/** Preserve the route while chasing; rebuild only when the target changes cell or the path is obstructed. */
export function advanceRoute(route: Navigator, from: Point, goal: Point, budget: number, place: Place): Point {
  if (!(budget > 0) || !Number.isFinite(budget)) return from;
  if (traversable(from, goal, place)) { route.goal = goal; route.path = [goal]; }
  else if (route.goal === null || distance(route.goal, goal) > CELL || (route.path.length && !traversable(from, route.path[0]!, place))) {
    route.goal = goal; route.path = findRoute(from, goal, place);
  }
  let at = from, left = budget;
  while (route.path.length && left > 0) {
    const next = route.path[0]!, remaining = distance(at, next);
    if (remaining <= left) { at = next; left -= remaining; route.path.shift(); }
    else { const f = left / remaining; at = [at[0] + (next[0] - at[0]) * f, at[1], at[2] + (next[2] - at[2]) * f]; left = 0; }
  }
  return at;
}
