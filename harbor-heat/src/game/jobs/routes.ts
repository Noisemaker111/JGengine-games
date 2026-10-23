/** Dispatch booth, the authored delivery drops and the delivery deadline policy. */
export const DISPATCH = [-193, 44] as const;

export const DELIVERY_ROUTES = [
  { label: "Boardwalk breakfast", recipient: "Mainsail lifeguards", position: [-190, 112] as const, seconds: 65, payout: 250, hint: "Follow the shore south. Find the coral parcel tower beside the boardwalk." },
  { label: "Plaza night shift", recipient: "Plaza radio crew", position: [-68, 8] as const, seconds: 95, payout: 400, hint: "Head north to the cross street, then east to the teal parcel tower." },
  { label: "Sunset spare parts", recipient: "Sunset pit crew", position: [-68, 112] as const, seconds: 110, payout: 500, hint: "Follow Mainsail south, then take the cross street east to the gold parcel tower." },
] as const;

/** A fragile rush run gets a third of the standard window. */
export function courierDeadline(seconds: number, rush: boolean): number {
  return rush ? Math.ceil(seconds * 0.35) : seconds;
}
