import "./style.css";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { defineGame } from "@jgengine/shell/defineGame";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { distance, floorAt, GARAGE, EXIT, PROPS, PRINT_ID, SALVAGE, STEAM, STASH, wallTiles, walkable, world, physics, editorLayers, WORLD_BOUNDS, ROOMS, RETURN_SPINE, DECOR, decorPoint, type Place, type Point } from "./world";
import { PALETTE as C, signTexture } from "./game/art";
import { initialize, keybinds, seatPlayer, setAim, tick, viewStore } from "./game/controls";
import { ITEMS } from "./game/state";
import { GameUI } from "./game/ui/GameUI";

type Triple = [number, number, number];
function Block({ at, size, color = C.panel, glow = false }: { at: Triple; size: Triple; color?: string; glow?: boolean }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.7} metalness={0.35} emissive={glow ? color : "#000000"} emissiveIntensity={glow ? 0.8 : 0} /></mesh>;
}
function Sign({ at, title, sub, color = C.cyan, turn = 0, width = 3.8 }: { at: Triple; title: string; sub: string; color?: string; turn?: number; width?: number }) {
  const texture = useMemo(() => signTexture(title, sub, color), [title, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={at} rotation-y={turn}><planeGeometry args={[width, width / 3]} /><meshBasicMaterial map={texture} /></mesh>;
}
function Tube({ at, radius = 0.18, height = 1, color = C.steel }: { at: Triple; radius?: number; height?: number; color?: string }) {
  return <mesh position={at} castShadow><cylinderGeometry args={[radius, radius, height, 12]} /><meshStandardMaterial color={color} metalness={0.65} roughness={0.4} /></mesh>;
}
function RailCart({ at, home = false }: { at: Triple; home?: boolean }) {
  return <group position={at}>
    <Block at={[0, 0.24, 0]} size={[2.5, 0.48, 1.8]} color={C.steel} />
    <Block at={[0, 0.65, 0.65]} size={[2.3, 0.65, 0.18]} color={C.wall} />
    <Block at={[-0.95, 0.7, -0.2]} size={[0.2, 0.9, 1.35]} color={C.brass} />
    <Block at={[0.95, 0.7, -0.2]} size={[0.2, 0.9, 1.35]} color={C.brass} />
    <Block at={[0, 0.51, 0]} size={[1.4, 0.08, 0.12]} color={C.cyan} glow />
    <Sign at={[0, 2.7, 0.9]} title={home ? "THE GARAGE" : "RETURN TO MARROW"} sub={home ? "BELLWETHER / LINE 06" : "THE WAY OUT IS THE WAY IN"} width={4.7} turn={home ? 0 : Math.PI} />
  </group>;
}
function Architecture({ place }: { place: Place }) {
  const walls = useMemo(() => wallTiles(place), [place]);
  const floors = useMemo(() => {
    const strips: { x: number; z: number; width: number }[] = [];
    for (let z = WORLD_BOUNDS.minZ + 0.5; z < WORLD_BOUNDS.maxZ; z++) {
      let start: number | null = null;
      for (let x = WORLD_BOUNDS.minX + 0.5; x <= WORLD_BOUNDS.maxX + 0.5; x++) {
        const filled = floorAt(x, z, place);
        if (filled && start === null) start = x;
        if (!filled && start !== null) { strips.push({ x: (start + x - 1) / 2, z, width: x - start }); start = null; }
      }
    }
    return strips;
  }, [place]);
  return <group>
    {floors.map((f, i) => <group key={i}>
      <Block at={[f.x, -0.08, f.z]} size={[f.width, 0.14, 1]} color={i % 3 === 0 ? "#223336" : C.floor} />
      <Block at={[f.x, 3.9, f.z]} size={[f.width, 0.16, 1]} color={C.panel} />
    </group>)}
    {walls.map((w, i) => <group key={i}>
      <Block at={[w.x, 1.9, w.z]} size={[1, 3.8, 1]} color={i % 4 === 0 ? C.wall : C.panel} />
      <Block at={[w.x, 0.15, w.z]} size={[1.03, 0.15, 1.03]} color={C.steel} />
    </group>)}
    {ROOMS.filter(room => room.place === place).map(room => <group key={room.id} position={[room.x, 0, room.z]}>
      <Block at={[0, 3.68, 0]} size={[Math.min(4, room.w - 1), 0.12, 0.16]} color={place === "home" ? C.amber : C.cyan} glow />
      <pointLight position={[0, 3.1, 0]} color={place === "home" ? "#f3c390" : "#a4ded2"} intensity={17} distance={15} decay={2} />
    </group>)}
    {place === "vault" && <>
      {[-1, 1].map(side => <Block key={side} at={[RETURN_SPINE!.x + side * RETURN_SPINE!.w * 0.27, 0.006, RETURN_SPINE!.z]} size={[0.075, 0.022, RETURN_SPINE!.d]} color={C.brass} glow />)}
      {ROOMS.filter(room => room.place === "vault" && room.id !== "room-return-spine").map(room => <group key={room.id} position={[room.x, 0, room.z + room.d / 2 - 1]}>
        <Block at={[-room.w / 2 + 0.3, 2, 0]} size={[0.22, 3.8, 0.25]} color={C.steel} />
        <Block at={[room.w / 2 - 0.3, 2, 0]} size={[0.22, 3.8, 0.25]} color={C.steel} />
        <Block at={[0, 3.7, 0]} size={[room.w - 0.4, 0.2, 0.25]} color={C.steel} />
        <Sign at={[0, 3.15, 0.15]} title={room.name.toUpperCase()} sub="RETURN RAIL  ↑  /  MARROW" width={Math.min(3.6, room.w - 1)} />
      </group>)}
    </>}
  </group>;
}
function SalvageModel({ kind, empty }: { kind: keyof typeof ITEMS; empty: boolean }) {
  const color = empty ? C.panel : ITEMS[kind].color;
  return <group>
    <Block at={[0, 0.35, 0]} size={[0.95, 0.65, 0.7]} color={C.steel} />
    <Block at={[0, 0.72, -0.2]} size={[0.98, 0.12, 0.78]} color={C.panel} />
    <Block at={[0, 0.58, 0.365]} size={[0.72, 0.11, 0.04]} color={color} glow={!empty} />
    {!empty && (kind === "wire" ? <mesh position={[0, 0.95, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.22, 0.085, 8, 16]} /><meshStandardMaterial color={color} metalness={0.6} /></mesh>
      : <Tube at={[0, 0.95, 0]} radius={kind === "ink" ? 0.22 : 0.14} height={0.38} color={color} />)}
  </group>;
}
function Fitter({ winding }: { winding: boolean }) {
  return <group>
    {[-1, 1].map(side => <group key={side}>
      <Block at={[side * 0.19, 0.35, 0]} size={[0.23, 0.65, 0.3]} color={C.panel} />
      <Block at={[side * 0.19, 0.09, 0.13]} size={[0.3, 0.16, 0.5]} color={C.steel} />
    </group>)}
    <Block at={[0, 1.02, 0]} size={[0.65, 0.7, 0.42]} color={C.brass} />
    <Block at={[0, 1.05, 0.24]} size={[0.34, 0.18, 0.06]} color={C.danger} glow />
    <Tube at={[0, 1.6, 0]} radius={0.24} height={0.35} color={C.steel} />
    <Block at={[0, 1.65, 0.22]} size={[0.35, 0.07, 0.06]} color={C.danger} glow />
    <Block at={[-0.43, 1.05, 0.1]} size={[0.2, 0.62, 0.24]} color={C.wall} />
    <group position={[0.4, winding ? 1.5 : 1.03, 0.35]} rotation-x={winding ? -0.9 : 0}>
      <Block at={[0, 0, 0]} size={[0.18, 0.22, 1.05]} color={C.steel} />
      <Block at={[0, 0, 0.58]} size={[0.08, 0.08, 0.22]} color={C.black} />
      <Block at={[0, -0.2, 0]} size={[0.13, 0.3, 0.15]} color={C.brass} />
    </group>
  </group>;
}
function renderEntity(entity: SceneEntity): ReactNode {
  return entity.id === PRINT_ID ? <PrintPresentation /> : <group />;
}
function PrintPresentation() {
  const view = useStore(viewStore);
  return <Fitter winding={view.dive?.print.mode === "winding"} />;
}
function Tracer({ from, to }: { from: Point; to: Point }) {
  const midpoint = new Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  const direction = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = direction.length();
  const ref = useRef<Group>(null);
  useEffect(() => { ref.current?.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()); }, [from, to]);
  return <group ref={ref} position={midpoint}><mesh><cylinderGeometry args={[0.018, 0.018, length, 6]} /><meshBasicMaterial color={C.amber} /></mesh></group>;
}
function Hand() {
  const ctx = useGameContext(), view = useStore(viewStore), ref = useRef<Group>(null);
  const dir = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(dir);
    setAim(ctx, [dir.x, dir.y, dir.z]);
    const hand = ref.current;
    if (hand === null) return;
    hand.position.copy(camera.position); hand.quaternion.copy(camera.quaternion);
    hand.translateX(0.26); hand.translateY(-0.26); hand.translateZ(-0.55);
  });
  const rifle = view.dive?.hand === "service-rifle", flash = (view.dive?.flash ?? 0) > 0;
  return <group ref={ref} visible={view.mode === "dive"}>
    <Block at={[0, -0.09, 0.12]} size={[0.11, 0.22, 0.14]} color={C.brass} />
    <Block at={[0, 0, rifle ? -0.1 : 0]} size={[0.12, 0.13, rifle ? 0.64 : 0.32]} color={C.steel} />
    <Block at={[0, 0.09, -0.07]} size={[0.025, 0.035, 0.06]} color={C.cyan} glow />
    {flash && <mesh position={[0, 0, rifle ? -0.5 : -0.22]}><octahedronGeometry args={[0.095]} /><meshBasicMaterial color="#ffe4a0" /></mesh>}
  </group>;
}
function WorldOverlay() {
  const view = useStore(viewStore), dive = view.dive;
  const steamOn = dive !== null && dive.elapsed % 8 < 3;
  return <>
    <Architecture place="home" /><Architecture place="vault" />
    <RailCart at={[GARAGE[0], GARAGE[1], GARAGE[2] - 0.7]} home /><RailCart at={[EXIT[0], EXIT[1], EXIT[2] + 0.5]} />
    <group position={[EXIT[0], 0, EXIT[2]]}>{[-0.8, 0.8].map(x => <Block key={x} at={[x, 0.01, 0]} size={[0.08, 0.04, 6]} color={C.steel} />)}</group>
    <group position={[STASH[0] - 0.4, 0, STASH[2]]}>
      <Block at={[0, 0.65, 0]} size={[1.7, 1.3, 1.3]} color={C.wall} />
      <Block at={[0.86, 0.82, 0]} size={[0.04, 0.15, 0.9]} color={C.cyan} glow />
      <Sign at={[0, 2.5, 0.7]} title="MARROW / STASH" sub={`${view.home.stash.length} ITEMS / SAVED AT HOME`} width={3.4} />
    </group>
    <group position={decorPoint("decor-home-printer")}>
      <Block at={[0, 0.4, 0]} size={[2.6, 0.75, 1.5]} color={C.steel} />
      <Block at={[0, 1.1, -0.6]} size={[2.6, 1.5, 0.2]} color={C.wall} />
      <Sign at={[0, 2.5, -0.45]} title="THE PRINTER" sub={`HALLOWAY / LIFE ${view.home.life}`} color={C.amber} width={3} />
      <Tube at={[-0.85, 1.6, -0.4]} height={0.7} color={C.ink} />
    </group>
    <Sign at={decorPoint("sign-marrow")} title="MARROW" sub="ONE OF THE LAST LIT VAULTS" color={C.amber} turn={Math.PI} width={5.5} />
    {DECOR.filter(entry => entry.id.startsWith("locker-shift-")).map(entry => <group key={entry.id} position={[entry.position.x, entry.position.y, entry.position.z]}>
      <Block at={[0, 1.1, 0]} size={[0.8, 2.2, 0.7]} color={C.wall} />
      <Sign at={[0, 1.6, 0.37]} title={String(entry.meta?.number ?? entry.label)} sub={String(entry.meta?.name ?? "SHIFT CREW")} width={0.65} />
    </group>)}
    <Sign at={decorPoint("sign-shift")} title="SHIFT 406" sub="REPORT TO YOUR POST" color={C.amber} />
    {SALVAGE.map(s => <group key={s.id} position={[s.at[0], 0, s.at[2]]}>
      <SalvageModel kind={s.kind} empty={dive?.collected.includes(s.id) ?? false} />
      <Sign at={[0, 1.65, -0.38]} title={s.id.toUpperCase()} sub={s.id === "ink" ? "PRINTER RESERVE" : "SHIFT SUPPLIES"} width={1.35} color={ITEMS[s.kind].color} />
    </group>)}
    {PROPS.map((p, i) => <group key={i} position={[p.x, 0, p.z]}>
      <Block at={[0, 0.7, 0]} size={[p.w, 1.4, p.d]} color={C.wall} />
      <Tube at={[0, 1.9, 0]} radius={0.5} height={1.3} />
      <Block at={[0, 1.1, p.d / 2 + 0.02]} size={[p.w * 0.6, 0.1, 0.05]} color={i === 2 ? C.ink : C.cyan} glow />
    </group>)}
    <Sign at={decorPoint("sign-printer")} title="PRINTER 06" sub="PATTERN: FITTER / COPY 406" color={C.ink} />
    <group position={[STEAM.x, 0, STEAM.z]}>
      <Block at={[0, 0.018, 0]} size={[STEAM.w, 0.025, STEAM.d]} color="#554437" />
      {Array.from({ length: 9 }, (_, i) => <Block key={i} at={[0, 0.04, -3 + i * 0.7]} size={[STEAM.w, 0.025, 0.17]} color={C.amber} />)}
      <Tube at={[1.6, 1.9, 0]} radius={0.14} height={3.8} />
      <Sign at={[0, 2.7, -3.8]} title="HOT SUPPRESSANT" sub={steamOn ? "VENTING / KEEP CLEAR" : "PRESSURE LOW / CROSS NOW"} color={C.danger} width={3.5} />
      {steamOn && <>
        <pointLight position={[0, 1, 0]} color={C.danger} intensity={12} distance={7} />
        {[-1, 0, 1].map(x => <mesh key={x} position={[x, 1.1, 0]}><cylinderGeometry args={[0.7, 0.25, 2.1, 10]} /><meshBasicMaterial color="#dec9b6" transparent opacity={0.16} depthWrite={false} /></mesh>)}
      </>}
    </group>
    {dive?.print.drop !== null && dive?.print.drop !== undefined && !dive.collected.includes("fitter") && <group position={[dive.print.drop[0], 0.12, dive.print.drop[2]]}>
      <Block at={[0, 0, 0]} size={[1.1, 0.18, 0.22]} color={ITEMS["service-rifle"].color} glow />
      <Block at={[0, -0.08, 0]} size={[0.2, 0.3, 0.15]} color={C.brass} />
    </group>}
    {view.trace !== null && <Tracer from={view.trace.from} to={view.trace.to} />}
    <Hand />
  </>;
}
const content: GameContextContent = {
  entityById(id): GameContextEntityEntry | null {
    if (id === "diver") return { stats: { health: { max: 100, min: 0 }, oxygen: { max: 110 }, ammo: { max: 6 } }, movement: { poses: ["standing", "running"], walkSpeed: 4.4 } };
    if (id === "fitter") return { stats: { health: { max: 80, min: 0 } }, movement: { poses: ["standing"], walkSpeed: 2.5 } };
    return null;
  },
  itemById(id) { return Object.hasOwn(ITEMS, id) ? { rarity: ITEMS[id as keyof typeof ITEMS].rarity.toLowerCase(), baseType: id } : null; },
};
export const credit = { text: "Original Deepward vault geometry, signage and item art", handle: "Deepward" };
export const game = defineGame({
  name: "Deepward", assets: createAssetCatalog(), world, physics, content, input: keybinds, editorLayers,
  server: { mode: "campaign" }, save: "none", persist: false,
  presentation: "3d", scenePlacement: false, touch: false,
  // Engine records own acquisition; the vault's authored meshes own presentation.
  worldItem: { filter: [{ id: "authored-salvage", when: {}, hide: true }] },
  loop: { onInit: initialize, onNewPlayer: seatPlayer, onTick: tick },
  GameUI, WorldOverlay, renderEntity,
  camera: { perspective: "first", firstPerson: { eyeHeight: 1.62, sensitivity: 0.0021, reticle: false, viewmodel: false }, frustum: { far: 95 } },
  movement: {
    beforeCommit(frame) {
      const view = viewStore.read(frame.ctx);
      if (view.paused || view.panel !== null || (view.mode !== "home" && view.mode !== "dive")) return frame.current;
      const place = view.mode === "home" ? "home" : "vault";
      // Subdivide the whole displacement so a long frame cannot tunnel through a wall.
      const steps = Math.max(1, Math.ceil(distance(frame.current, frame.next) / 0.15));
      let x = frame.current[0], z = frame.current[2];
      const dx = (frame.next[0] - x) / steps, dz = (frame.next[2] - z) / steps;
      for (let n = 0; n < steps; n++) {
        if (walkable(x + dx, z + dz, place)) { x += dx; z += dz; }
        else if (walkable(x + dx, z, place)) x += dx;
        else if (walkable(x, z + dz, place)) z += dz;
      }
      return [x, frame.next[1], z];
    },
  },
  lighting: { ambient: { color: "#b2c5c3", intensity: 0.55 }, hemisphere: { skyColor: "#a8d4cf", groundColor: "#57422e", intensity: 0.45 } },
  backdrop: { background: C.black, fog: { color: C.black, near: 24, far: 75 } },
  postProcessing: { toneMapping: "aces", exposure: 1.05, bloom: { strength: 0.2, radius: 0.4, threshold: 1.1 } },
  orientation: "landscape",
});
