import { buildableDef, type BuildableDef } from "../objects/catalog";
import type { PlacedObject } from "../session";
import { connectedTracks, hasPathAccess, objectUpkeep, operational } from "./operations";

export interface ParkMetrics {
  rides: number;
  stalls: number;
  tracks: number;
  scenery: number;
  cleaning: number;
  variety: number;
  totalAppeal: number;
  dailyUpkeep: number;
}

export function coasterThrill(tracks: number): number {
  return Math.min(12, Math.max(0, tracks)) * 0.7;
}

export function objectAppeal(def: BuildableDef, tracks: number): number {
  if (def.id === "ride_coaster") return def.appeal + coasterThrill(tracks);
  return def.appeal;
}

export function computeMetrics(placed: readonly PlacedObject[]): ParkMetrics {
  let rides = 0;
  let stalls = 0;
  let tracks = 0;
  let scenery = 0;
  let cleaning = 0;
  let dailyUpkeep = 0;
  const rideKinds = new Set<string>();
  const stallNeeds = new Set<string>();
  for (const obj of placed) {
    const def = buildableDef(obj.catalogId);
    dailyUpkeep += objectUpkeep(obj);
    if (def.category === "track") tracks += 1;
    if (def.category === "scenery" || def.category === "path") scenery += 1;
    if (def.staff !== undefined) cleaning += def.staff.cleaning;
    if (def.category === "ride" && operational(obj)) {
      rides += 1;
      rideKinds.add(def.id);
    }
    if (def.stall !== undefined && operational(obj)) {
      stalls += 1;
      stallNeeds.add(def.stall.need);
    }
  }
  let totalAppeal = 0;
  let sceneryAppeal = 0;
  for (const obj of placed) {
    const def = buildableDef(obj.catalogId);
    if (def.category === "scenery" || def.category === "path" || def.category === "track") {
      sceneryAppeal += def.category === "path" ? Math.min(.4, def.appeal) : def.appeal;
    } else if (operational(obj)) {
      const base = objectAppeal(def, def.id === "ride_coaster" ? connectedTracks(obj) : 0);
      totalAppeal += base * (hasPathAccess(obj) ? 1 : .4) * (obj.upgrade === "premium" ? 1.45 : obj.upgrade === "efficient" ? .85 : 1);
    }
  }
  totalAppeal += Math.min(sceneryAppeal, 8 + rides * 7);
  const variety = rideKinds.size + stallNeeds.size;
  return { rides, stalls, tracks, scenery, cleaning, variety, totalAppeal, dailyUpkeep };
}

export function ratingTarget(
  metrics: ParkMetrics,
  happinessAvg: number,
  guestsToday: number,
  litter: number,
): number {
  const appealScore = metrics.totalAppeal * 3.4;
  const varietyBonus = metrics.variety * 9;
  const happyScore = (happinessAvg - 40) * 1.6;
  const throughput = Math.min(guestsToday, 400) * 0.28;
  const litterPenalty = litter * 1.4;
  const target = appealScore + varietyBonus + happyScore + throughput - litterPenalty;
  return Math.max(0, target);
}

export function demand(
  totalAppeal: number,
  ticketPrice: number,
  rating: number,
  open: boolean,
): number {
  if (!open) return 0;
  const draw = 0.35 + totalAppeal * 0.085 + rating * 0.004;
  const priceResistance = Math.max(0, 1 - Math.max(0, ticketPrice - 6) * 0.026);
  return Math.max(0, draw * priceResistance);
}
