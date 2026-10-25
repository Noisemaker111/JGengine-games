import type { DriverIdea } from "./ideaShape";

/**
 * Apex Nights: "arcade street racer: win night races, earn cash, upgrade your car"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: DriverIdea = {
  "player": "driver",
  "id": "apex-nights",
  "spec": "apex_nights",
  "name": "Apex Nights",
  "pitch": "arcade street racer: win night races, earn cash, upgrade your car",
  "tagline": "Win races. Tune the car. Own the night.",
  "kit": "arcade",
  "look": "cinematic",
  "mood": "night",
  "accent": "#ff3d8b",
  "ground": {
    "material": "slate",
    "low": "#2c2f36",
    "high": "#4a4e57"
  },
  "guide": {
    "name": "Vee",
    "title": "Crew chief"
  },
  "currency": {
    "id": "cash",
    "label": "Cash",
    "start": 200
  },
  "car": {
    "model": "vehicle/sports-car",
    "height": 1.3
  },
  "rivals": [
    {
      "model": "/models/imported/kaykit-city-builder/car_taxi.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_police.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_hatchback.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_stationwagon.glb",
      "height": 1.5
    }
  ],
  "upgrades": [
    {
      "id": "engine",
      "label": "Engine",
      "cost": 150,
      "levels": 5,
      "boost": 0.08
    },
    {
      "id": "grip",
      "label": "Tyres",
      "cost": 120,
      "levels": 5,
      "boost": 0.08
    },
    {
      "id": "nitro",
      "label": "Nitro",
      "cost": 180,
      "levels": 4,
      "boost": 0.2
    }
  ],
  "races": [
    {
      "id": "rookie",
      "title": "Rookie sprint",
      "laps": 2,
      "rivals": 3,
      "pay": 220,
      "pitch": "Three locals, two laps. Show them you're real."
    },
    {
      "id": "docks",
      "title": "Dockside dash",
      "laps": 3,
      "rivals": 4,
      "pay": 380,
      "pitch": "The dock crews race for keeps. Three laps."
    },
    {
      "id": "crown",
      "title": "Crown of the city",
      "laps": 3,
      "rivals": 4,
      "pay": 700,
      "pitch": "The best in the city. Win this and the streets are yours."
    }
  ],
  "scenery": [
    {
      "model": "/models/imported/kaykit-city-builder/building_A.glb",
      "height": 12
    },
    {
      "model": "/models/imported/kaykit-city-builder/building_C.glb",
      "height": 14
    },
    {
      "model": "/models/imported/kaykit-city-builder/building_E.glb",
      "height": 16
    },
    {
      "model": "/models/imported/kaykit-city-builder/building_G.glb",
      "height": 18
    },
    {
      "model": "/models/imported/kaykit-city-builder/building_H.glb",
      "height": 15
    },
    {
      "model": "/models/imported/kaykit-city-builder/watertower.glb",
      "height": 9
    }
  ],
  "trackside": {
    "model": "city/street-lamp",
    "height": 6
  }
};
