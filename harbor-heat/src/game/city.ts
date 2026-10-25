import type { MissionDef } from "@jgengine/core/mission/mission";
import { calm, defineWorldModel } from "@jgengine/core/worldModel/worldModel";

/**
 * Mainsail as one world: who lives here, who holds which block, what each job is and what it leaves
 * behind, and how a gunshot or a body spreads through the city. Map blips, the phone, dialogue,
 * "what next", mission facts and resident panic all read this; nothing else keeps its own copy.
 */

const PLAYER = "harbor_player";

const mission = (id: string, title: string, objectives: MissionDef["objectives"], cash: number, fail: MissionDef["fail"] = []): MissionDef => ({
  id,
  title,
  objectives,
  fail,
  rewards: { economy: { cash } },
});

const killed = (target: string) => ({ kind: "kill" as const, target });

export const city = defineWorldModel({
  factions: {
    carmine: { label: "Carmine crew", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    hhpd: { label: "HHPD", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    locals: { label: "Mainsail locals", facts: { mood: calm(0, 0.08, { min: -100, max: 100 }) } },
  },
  places: {
    boulevard: { label: "Mainsail Boulevard", position: [-170, 0], radius: 110, owner: "locals", facts: { fear: calm(0, 1.5) } },
    downtown: { label: "Downtown Vice", position: [40, -60], radius: 120, owner: "locals", facts: { fear: calm(0, 1.5) } },
    port: { label: "Port Carmine", marker: "dock_fight", radius: 100, owner: "carmine", facts: { fear: calm(0, 1.5) } },
    heights: { label: "Palm Heights", marker: "kingpin", radius: 90, owner: "carmine", facts: { fear: calm(0, 1.5) } },
    neon: { label: "the neon strip", marker: "marco", radius: 20, owner: "locals" },
    motors: { label: "Sunset Motors", marker: "garage", radius: 20, owner: "locals" },
    precinct: { label: "HHPD precinct", marker: "hhpd_station", radius: 20, owner: "hhpd" },
  },
  people: {
    marco: {
      name: "Marco Vance",
      faction: "locals",
      at: "neon",
      phone: true,
      blip: { icon: "contact" },
      facts: { trust: 0 },
      says: [
        { text: "Not here, not now. The block's crawling with sirens.", when: { "neon.fear": { atLeast: 30 } } },
        { text: "The Carmines took my docks. Sweep them out and the money's yours.", when: { "port.owner": "carmine", "jobs.dock_sweep": { is: "done", not: true } } },
        { text: "That ledger names every cop Sal owns. Get it before his enforcer burns it.", when: { "jobs.ledger": { is: "done", not: true } } },
        { text: "You're hot property now. Make the cops forget your face.", when: { "jobs.shake_heat": { is: "done", not: true } } },
        { text: "Sal's re-arming the docks. Break his convoy before it lands.", when: { "jobs.ocean_loop": "done", "jobs.convoy": { is: "done", not: true } } },
        { text: "Sal's alone up in Palm Heights. End it.", when: { "jobs.convoy": "done", "jobs.kingpin": { is: "done", not: true } } },
        { text: "Go see Rita at Sunset Motors. She owes me.", when: { "jobs.ocean_loop": { is: "done", not: true } } },
        { text: "This town runs on sunshine and dirty cash, and now it runs on you." },
      ],
    },
    rita: {
      name: "Rita Salgado",
      faction: "locals",
      at: "motors",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "rita.known": true } },
      says: [
        { text: "Win me the Ocean Loop and I'll know you can drive.", when: { "jobs.ocean_loop": { is: "done", not: true } } },
        { text: "Sal's Cicada GT sits in Palm Heights. Bring it to my lot in one piece.", when: { "jobs.hot_wheels": { is: "done", not: true } } },
        { text: "Anything with wheels, I can sell. Anything with sirens, keep away from my lot." },
      ],
    },
    sal: {
      name: "Sal Carmine",
      faction: "carmine",
      at: "heights",
      phone: true,
      known: false,
      says: [
        { text: "You took my docks. I take everything else.", when: { "jobs.kingpin": { is: "done", not: true } } },
        { text: "..." },
      ],
    },
    dee: {
      name: "Sgt. Dee Kalani",
      faction: "hhpd",
      at: "precinct",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "dee.known": true } },
      facts: { trust: calm(20, 0.02, { min: -100, max: 100 }) },
      says: [
        { text: "You shot a cop. Don't call me again.", when: { "dee.trust": { atMost: -20 } } },
        { text: "Port Carmine's quiet for once. I'll pretend I didn't see how.", when: { "port.owner": "player" } },
        { text: "Carmine runners are fencing guns on my beat. Take one down and I'll look the other way." },
      ],
    },
  },
  jobs: {
    welcome: {
      title: "Welcome to the Isle",
      act: 1,
      at: "neon",
      pitch: "Find Marco under the downtown neon.",
      mission: mission("welcome", "Welcome to the Isle", [
        { id: "meet", kind: "reach", actor: PLAYER, marker: "marco", radius: 5, label: "Find Marco under the downtown neon" },
      ], 200),
      beat: { "story.act": 1 },
    },
    dock_sweep: {
      title: "Dock Sweep",
      act: 1,
      giver: "marco",
      requires: ["welcome"],
      pitch: "Five Carmine gangers hold my docks. Clear them.",
      mission: mission("dock_sweep", "Dock Sweep", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "dock_fight", radius: 30, label: "Drive to Port Carmine", next: "clear" },
        { id: "clear", kind: "kill", count: 5, match: killed("ganger_dock"), label: "Clear the Carmine gangers" },
      ], 900),
      beat: { "port.owner": "player", "carmine.mood": -30, "marco.trust": 20, "dee.known": true },
    },
    ledger: {
      title: "The Ledger",
      act: 1,
      giver: "marco",
      requires: ["dock_sweep"],
      pitch: "Sal's enforcer carries a ledger. Take it off him.",
      mission: mission("ledger", "The Ledger", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "briefcase", radius: 25, label: "Find the enforcer by the warehouse", next: "drop" },
        { id: "drop", kind: "kill", count: 1, match: killed("ganger_enforcer"), label: "Drop the enforcer", next: "grab" },
        { id: "grab", kind: "collect", count: 1, match: { kind: "collect", target: "briefcase_carmine" }, label: "Grab the ledger" },
      ], 2000),
      beat: { "sal.known": true, "carmine.mood": -20, "marco.trust": 20 },
    },
    shake_heat: {
      title: "Shake the Heat",
      act: 2,
      giver: "marco",
      requires: ["ledger"],
      pitch: "Get the city's attention, three stars of it, then lose them.",
      mission: mission("shake_heat", "Shake the Heat", [
        { id: "raise", kind: "survive", until: { fact: "police_tier", atLeast: 3 }, label: "Raise three stars of heat", next: "lose" },
        { id: "lose", kind: "survive", until: { fact: "police_tier", atMost: 0 }, label: "Lose the cops" },
      ], 3500),
      beat: { "rita.known": true, "marco.trust": 10 },
    },
    ocean_loop: {
      title: "The Ocean Loop",
      act: 2,
      giver: "rita",
      requires: ["shake_heat"],
      pitch: "Win the Ocean Loop from my start line.",
      mission: mission("ocean_loop", "The Ocean Loop", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "garage", radius: 30, label: "Get a car to Sunset Motors", next: "win" },
        { id: "win", kind: "survive", until: { fact: "race_won", is: "race-loop" }, label: "Win the Ocean Loop" },
      ], 4000),
      beat: { "rita.trust": 20 },
    },
    hot_wheels: {
      title: "Hot Wheels",
      act: 2,
      giver: "rita",
      requires: ["ocean_loop"],
      pitch: "Steal Sal's Cicada GT and bring it to my lot.",
      mission: mission("hot_wheels", "Hot Wheels", [
        { id: "find", kind: "reach", actor: PLAYER, marker: "cicada_stage", radius: 15, label: "Find the Cicada GT in Palm Heights", next: "steal" },
        { id: "steal", kind: "survive", until: { fact: "driving", is: "car_sport" }, label: "Get in the Cicada", next: "deliver" },
        {
          id: "deliver",
          kind: "reach",
          actor: PLAYER,
          marker: "garage",
          radius: 9,
          label: "Deliver the Cicada to Sunset Motors",
          failOn: [{ kind: "fact", fact: "cicada_wrecked", is: true, to: "wrecked", message: "The Cicada burned." }],
        },
      ], 5000, [{ id: "wrecked", message: "The Cicada burned." }]),
      beat: { "carmine.mood": -15, "rita.trust": 20 },
    },
    convoy: {
      title: "Carmine Convoy",
      act: 3,
      giver: "marco",
      requires: ["hot_wheels"],
      pitch: "Sal's re-arming the docks. Break the convoy.",
      mission: mission("convoy", "Carmine Convoy", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "dock_fight", radius: 30, label: "Get to the docks", next: "break" },
        { id: "break", kind: "kill", count: 8, match: killed("ganger_dock"), label: "Break the convoy" },
      ], 6500),
      beat: { "carmine.mood": -30, "port.owner": "player" },
    },
    kingpin: {
      title: "Kingpin of Palm Heights",
      act: 3,
      giver: "marco",
      requires: ["convoy"],
      pitch: "Sal runs it all from his villa. End it.",
      mission: mission("kingpin", "Kingpin of Palm Heights", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "kingpin", radius: 30, label: "Storm Sal's villa", next: "drop" },
        { id: "drop", kind: "kill", count: 1, match: killed("kingpin_sal"), label: "Drop Sal" },
      ], 25000),
      beat: { "heights.owner": "player", "carmine.mood": -50, "story.act": 4 },
    },
    clean_hands: {
      title: "Clean Hands",
      kind: "side",
      giver: "dee",
      requires: ["dock_sweep"],
      when: { "dee.trust": { atLeast: 0 } },
      repeatable: true,
      pitch: "A Carmine runner is fencing guns at the docks. Put him down.",
      mission: mission("clean_hands", "Clean Hands", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "dock_fight", radius: 40, label: "Find the runner at the docks", next: "drop" },
        { id: "drop", kind: "kill", count: 1, match: killed("ganger_dock"), label: "Drop the gun runner" },
      ], 400),
      beat: { "dee.trust": 10, "carmine.mood": -5 },
    },
  },
  ripples: {
    gunfire: { place: { fear: 18 }, owner: { mood: -1 } },
    assault: { place: { fear: 30 }, owner: { mood: -4 }, out: { heat: 55 } },
    cop_shot: { place: { fear: 25 }, world: { "hhpd.mood": -10, "dee.trust": -10 }, out: { heat: 90 } },
    explosion: { place: { fear: 40 }, owner: { mood: -5 }, out: { heat: 70 }, note: "An explosion rocked {place}." },
    killing: { place: { fear: 45 }, owner: { mood: -8 }, out: { heat: 60 }, note: "Someone was killed in {place}." },
    ganger_down: { place: { fear: 20 }, faction: { mood: -6 }, note: "A Carmine soldier went down in {place}." },
    cop_down: { place: { fear: 35 }, faction: { mood: -25 }, world: { "dee.trust": -40 }, out: { heat: 110 }, note: "Officer down in {place}." },
    wreck: { place: { fear: 15 }, out: { heat: 45 } },
  },
  facts: { "story.act": 0 },
});

/** Mission actor id for the player, whichever body it is in. */
export const CITY_PLAYER = PLAYER;
