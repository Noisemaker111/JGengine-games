import { buildableDef } from "../objects/catalog";
import { coasterThrill } from "./rating";

/** Derived from existing saved guest kinds: no new save fields or random draws. */
export function guestRidePreference(kind: string): { label: string; thrill: number } {
  if (kind === "guest_a" || kind === "guest_b") return { label: "Family", thrill: 4 };
  if (kind === "guest_d" || kind === "guest_e") return { label: "Thrill seeker", thrill: 12 };
  return { label: "Explorer", thrill: 8 };
}

export function rideThrill(catalogId: string, tracks: number): number {
  const def = buildableDef(catalogId);
  return (def.ride?.thrill ?? 0) + (catalogId === "ride_coaster" ? coasterThrill(tracks) : 0);
}

export function rideFit(kind: string, catalogId: string, tracks: number): number {
  return Math.max(0.1, 1 - Math.abs(rideThrill(catalogId, tracks) - guestRidePreference(kind).thrill) / 10);
}

export function rideHappiness(kind: string, catalogId: string, tracks: number): number {
  // A frightening or boring ride can lose happiness; a fitting ride earns return visits.
  return 12 * rideFit(kind, catalogId, tracks) - 4;
}
