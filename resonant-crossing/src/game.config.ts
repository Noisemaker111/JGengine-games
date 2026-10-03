import { createElement, Fragment } from "react";
import { p2p } from "@jgengine/core/runtime/adapter";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectStyles } from "./game/objects/catalog";
import { DuetEnvironment, DuetVfx, renderDuetObject, renderHero } from "./game/render";
import { ROOMS } from "./game/rooms/catalog";
import { isWalkable } from "./game/rooms/engine";
import { currentRoomState } from "./game/rooms/setup";
import { duetStore } from "./game/stores";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";
import { buildResonantCrossingEditorLayers } from "./editorLayers";
import { NativeCapture, readDuetProbe } from "./game/nativeCapture";
import { syncAuthoredRooms } from "./game/rooms/live";
import { seatPlayer } from "./game/runtime";
import { actionContextStack } from "@jgengine/core/game/controlGate";

export const game = defineGame({
  name: "Resonant Crossing",
  world,
  physics,
  assets,
  input: keybinds,
  server: { mode: "coop" },
  save: "none",
  multiplayer: p2p({ topology: "private", room: "resonant-crossing" }),
  content,
  editorLayers: buildResonantCrossingEditorLayers(),
  scenePlacement: false,
  loop: {
    ...loop,
    onInit(ctx) {
      loop.onInit(ctx);
      seatPlayer(ctx, ctx.player.userId);
      // Published 0.18.1 caches its tracker in the menu; gameplay still gates these codes by phase.
      actionContextStack(ctx).push({ id: "menu", codes: keybinds, passthrough: false });
    },
    onTick(ctx, dt) {
      syncAuthoredRooms(ctx);
      loop.onTick(ctx, dt);
    },
  },
  GameUI,
  presentation: "3d",
  capture: {
    play: ["duet.start"],
    probe: readDuetProbe,
    states: {
      solved: ["debug.win"],
      complete: ["debug.complete"],
    },
  },
  environment: DuetEnvironment,
  WorldOverlay: DuetVfx,
  renderEntity: renderHero,
  renderObject: renderDuetObject,
  objectStyles,
  shadows: true,
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 12, pitch: 1.24, yaw: Math.PI, followSmoothing: 12 },
    frustum: { far: 400 },
  },
  movement: {
    mode: "grid",
    cellSize: 1,
    turnSpeed: 14,
    beforeCommit(frame) {
      const store = duetStore.peek(frame.ctx);
      if (store === undefined) return undefined;
      if (store.status !== "playing") return frame.current;
      const room = ROOMS[store.roomIndex];
      if (room === undefined) return undefined;
      const state = currentRoomState(frame.ctx, room);
      const target = { x: Math.round(frame.next[0]), z: Math.round(frame.next[2]) };
      if (isWalkable(room, state, target)) return undefined;
      return frame.current;
    },
  },
  lighting: {
    ambient: { color: "#7eacc2", intensity: 0.8 },
    hemisphere: { skyColor: "#bbdce4", groundColor: "#283247", intensity: 0.8 },
    directional: [{ color: "#ffe5bd", intensity: 2.2, position: [4, 16, 6], castShadow: true, shadowCameraSize: 22 }],
  },
  backdrop: {
    background: "#080b18",
    fog: { color: "#080b18", near: 26, far: 60 },
  },
});

// Room overlays consume only the active authored grid; the full document remains available to the editor.
game.WorldOverlay = () => createElement(Fragment, null, createElement(DuetVfx), createElement(NativeCapture));
