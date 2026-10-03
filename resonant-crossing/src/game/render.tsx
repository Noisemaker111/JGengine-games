import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { useStore } from "@jgengine/react/store";
import { HEROES } from "./entities/players/catalog";
import { ROOMS, roomBounds, getAuthoredDocument } from "./rooms/catalog";
import { duetStore } from "./stores";
import { DIR_VECTORS, type V2 } from "./types";

// Original Observatory of the Duet geometry. No downloaded textures or model requests.
const BRASS = "#bda36e";
const STONE = "#324a59";
const DARK = "#172735";
const CYAN = HEROES.lumen.color;
const AMBER = HEROES.anchor.color;
const EMPTY_RELAYS: readonly string[] = [];

function Block({ at = [0, 0, 0], size, color = STONE, glow = false }: {
  at?: [number, number, number]; size: [number, number, number]; color?: string; glow?: boolean;
}) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.55} metalness={0.3}
      emissive={glow ? color : "#000000"} emissiveIntensity={glow ? 0.65 : 0} /></mesh>;
}
function Ring({ radius, y, color, thick = 0.025 }: { radius: number; y: number; color: string; thick?: number }) {
  return <mesh position-y={y} rotation-x={-Math.PI / 2}><torusGeometry args={[radius, thick, 6, 32]} />
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} metalness={0.6} roughness={0.4} /></mesh>;
}
function Crystal({ color, y = 0.7, scale = 0.25 }: { color: string; y?: number; scale?: number }) {
  return <mesh position-y={y} scale={[scale, scale * 1.7, scale]} castShadow><octahedronGeometry />
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} metalness={0.5} roughness={0.18} /></mesh>;
}

function HeroMesh({ entity }: { entity: SceneEntity }) {
  const active = useStore(duetStore, s => s.active);
  const hero = entity.name === "anchor" ? HEROES.anchor : HEROES.lumen;
  const anchor = hero.id === "anchor";
  const selected = active === hero.id;
  return <group>
    <Ring radius={0.4} y={0.07} color={selected ? hero.color : "#485968"} thick={selected ? 0.04 : 0.02} />
    {anchor ? <>
      <Block at={[0, 0.48, 0]} size={[0.48, 0.46, 0.35]} color={BRASS} />
      <Block at={[0, 0.51, 0.19]} size={[0.24, 0.19, 0.06]} color={AMBER} glow />
      {[-1, 1].map(side => <group key={side}>
        <Block at={[side * 0.32, 0.49, 0]} size={[0.18, 0.32, 0.29]} color={STONE} />
        <Block at={[side * 0.15, 0.15, 0.03]} size={[0.22, 0.22, 0.35]} color={DARK} />
      </group>)}
      <mesh position-y={0.85} castShadow><cylinderGeometry args={[0.2, 0.24, 0.25, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.35} /></mesh>
      <Block at={[0, 0.87, 0.2]} size={[0.26, 0.055, 0.025]} color={AMBER} glow />
    </> : <>
      <mesh position-y={0.39} castShadow><coneGeometry args={[0.33, 0.64, 6]} />
        <meshStandardMaterial color={STONE} metalness={0.25} roughness={0.45} /></mesh>
      <Ring radius={0.22} y={0.45} color={CYAN} />
      <Crystal color={CYAN} y={0.85} scale={0.2} />
      <mesh position-y={1.09} rotation-x={Math.PI / 2}><torusGeometry args={[0.26, 0.028, 6, 24]} />
        <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.3} /></mesh>
      <Block at={[0.32, 0.55, 0.05]} size={[0.045, 0.65, 0.045]} color={BRASS} />
      <Crystal color={CYAN} y={0.9} scale={0.09} />
    </>}
    {/* Forward chevron makes prism aim visible from the overhead camera. */}
    <mesh position={[0, 0.08, 0.51]} rotation-x={-Math.PI / 2}>
      <coneGeometry args={[0.09, 0.2, 3]} /><meshBasicMaterial color={hero.color} /></mesh>
  </group>;
}
export function renderHero(entity: SceneEntity): ReactNode {
  return entity.name === "lumen" || entity.name === "anchor" ? <HeroMesh entity={entity} /> : null;
}

export function renderDuetObject(object: SceneObject): ReactNode {
  const color = object.visual?.color ?? BRASS;
  switch (object.catalogId) {
    case "wall": return <></>;
    case "gate": return <group>
      {[-0.38, 0.38].map(x => <Block key={x} at={[x, 0.43, 0]} size={[0.12, 0.86, 0.22]} color={BRASS} />)}
      <Block at={[0, 0.85, 0]} size={[0.9, 0.12, 0.25]} color={BRASS} />
      {[-0.24, 0, 0.24].map(x => <Block key={x} at={[x, 0.42, 0]} size={[0.045, 0.76, 0.11]} color={color} glow />)}
      <Crystal color={color} y={0.86} scale={0.1} />
    </group>;
    case "plate": return <group>
      <mesh position-y={0.05} receiveShadow><cylinderGeometry args={[0.4, 0.43, 0.1, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.4} /></mesh>
      <Ring radius={0.3} y={0.12} color={color} />
      <Block at={[0, 0.12, 0]} size={[0.23, 0.025, 0.23]} color={AMBER} glow />
    </group>;
    case "receiver": return <group>
      <Block at={[0, 0.09, 0]} size={[0.52, 0.18, 0.52]} color={BRASS} />
      <Block at={[0, 0.29, 0]} size={[0.15, 0.36, 0.15]} />
      <mesh position-y={0.58} rotation-y={Math.PI / 2}><torusGeometry args={[0.23, 0.06, 8, 24]} />
        <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.3} /></mesh>
      <Crystal color={color} y={0.58} scale={0.13} />
    </group>;
    case "spike": return <group>
      <Block at={[0, 0.03, 0]} size={[0.8, 0.06, 0.8]} color={DARK} />
      {[-0.23, 0.23].flatMap(x => [-0.23, 0.23].map(z => <mesh key={`${x}:${z}`} position={[x, 0.24, z]} castShadow>
        <coneGeometry args={[0.09, 0.42, 5]} /><meshStandardMaterial color={color} metalness={0.65} roughness={0.35} /></mesh>))}
    </group>;
    case "exit_lumen": case "exit_anchor": {
      const tint = object.catalogId === "exit_lumen" ? CYAN : AMBER;
      return <group>
        <mesh position-y={0.045}><cylinderGeometry args={[0.43, 0.46, 0.09, 12]} />
          <meshStandardMaterial color={DARK} metalness={0.5} roughness={0.5} /></mesh>
        <Ring radius={0.35} y={0.1} color={tint} thick={0.035} />
        <Ring radius={0.23} y={0.11} color={tint} />
        <Block at={[0, 0.1, 0]} size={[0.06, 0.03, 0.32]} color={tint} glow />
        <Block at={[0, 0.1, 0]} size={[0.32, 0.03, 0.06]} color={tint} glow />
      </group>;
    }
    case "emitter": return <Crystal color={CYAN} />;
    default: return null;
  }
}

function Wire({ from, to, color, lit, width = 0.035 }: { from: V2; to: V2; color: string; lit: boolean; width?: number }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return <mesh position={[(from.x + to.x) / 2, 0.025, (from.z + to.z) / 2]} rotation-y={Math.atan2(dx, dz)}>
    <boxGeometry args={[width, 0.02, length]} /><meshStandardMaterial color={lit ? color : "#6c6a5c"}
      emissive={lit ? color : "#000000"} emissiveIntensity={0.8} /></mesh>;
}

interface InstancePose {
  x: number; y: number; z: number; color?: string; scale?: number;
}

function InstancedStone({ poses, size, color }: {
  poses: readonly InstancePose[]; size: [number, number, number]; color: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i]!;
      transform.position.set(pose.x, pose.y, pose.z);
      transform.scale.setScalar(pose.scale ?? 1);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(i, new THREE.Color(pose.color ?? color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [poses, color]);
  return <instancedMesh ref={ref} args={[undefined, undefined, poses.length]} castShadow receiveShadow>
    <boxGeometry args={size} /><meshStandardMaterial color="white" roughness={0.55} metalness={0.3} />
  </instancedMesh>;
}

function AmbientStars() {
  const document = getAuthoredDocument();
  const stars = useMemo(() => document.markers.filter(marker => marker.kind === "observatory-star"), [document]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    stars.forEach((star, i) => {
      transform.position.set(star.position.x, star.position.y, star.position.z);
      transform.scale.setScalar(Number(star.meta?.radius ?? 0.025));
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(i, new THREE.Color(star.color ?? "#7299b0"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [stars]);
  return <group>
    <instancedMesh ref={ref} args={[undefined, undefined, stars.length]}>
      <sphereGeometry args={[1, 4, 4]} /><meshBasicMaterial color="white" />
    </instancedMesh>
    {document.markers.filter(marker => marker.kind === "observatory-ring").map(marker =>
      <group key={marker.id} position={[marker.position.x, marker.position.y, marker.position.z]} rotation-z={Number(marker.meta?.tilt ?? 0)}>
        <Ring radius={Number(marker.meta?.radius ?? 1)} y={0} color={marker.color ?? BRASS} thick={Number(marker.meta?.thickness ?? 0.04)} />
      </group>)}
  </group>;
}

export function DuetEnvironment() {
  const index = useStore(duetStore, s => s.roomIndex);
  const pressed = useStore(duetStore, s => s.pressedPlates);
  const powered = useStore(duetStore, s => s.poweredReceivers);
  const completed = useStore(duetStore, s => s.latch.completedRelays ?? EMPTY_RELAYS);
  const room = ROOMS[index] ?? ROOMS[0]!;
  const bounds = roomBounds(room);
  const camera = useThree(s => s.camera);
  const size = useThree(s => s.size);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const viewWidth = (size.width / size.height) * 24 * Math.tan(camera.fov * Math.PI / 360);
      camera.zoom = Math.min(1, viewWidth / (bounds.width + 2));
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height, bounds.width]);
  const floor = useMemo(() => room.floor.map(cell => ({ ...cell, y: -0.06,
    color: (cell.x + cell.z) % 2 === 0 ? "#536773" : "#465b68" })), [room]);
  const corners = useMemo(() => room.floor.map(cell => ({ x: cell.x - 0.38, y: 0.01, z: cell.z - 0.38 })), [room]);
  const walls = useMemo(() => [0.12, 0.32, 0.4, 0.46].map(y => room.walls.map(cell => ({ ...cell, y }))), [room]);
  const document = getAuthoredDocument();
  const routes = document.paths.filter(path => path.meta?.roomId === room.id);
  const zones = document.volumes.filter(zone => zone.meta?.roomId === room.id);
  return <group>
    <Block at={[bounds.centerX, -0.32, bounds.centerZ]} size={[bounds.width + 0.12, 0.55, bounds.depth + 0.12]} color={DARK} />
    <Block at={[bounds.centerX, -0.61, bounds.centerZ]} size={[bounds.width - 0.25, 0.12, bounds.depth - 0.25]} color={BRASS} />
    <InstancedStone poses={floor} size={[0.96, 0.12, 0.96]} color={STONE} />
    <InstancedStone poses={corners} size={[0.04, 0.02, 0.04]} color={BRASS} />
    <InstancedStone poses={walls[0]!} size={[0.98, 0.32, 0.98]} color={DARK} />
    <InstancedStone poses={walls[1]!} size={[0.86, 0.12, 0.86]} color={STONE} />
    <InstancedStone poses={walls[2]!} size={[0.66, 0.06, 0.66]} color={BRASS} />
    <InstancedStone poses={walls[3]!} size={[0.18, 0.05, 0.18]} color={DARK} />
    {routes.flatMap(path => path.points.slice(1).map((to, i) =>
      <Wire key={`${path.id}:${i}`} from={path.points[i]!} to={to} color={path.color ?? BRASS} width={path.width}
        lit={path.meta?.role === "lumen" ? powered.length > 0 : path.meta?.role === "anchor" ? pressed.length > 0 : false} />))}
    {zones.map(zone => zone.halfExtents && <mesh key={zone.id} position={[zone.center.x, 0.013, zone.center.z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[zone.halfExtents.x * 2 - 0.12, zone.halfExtents.z * 2 - 0.12]} />
      <meshBasicMaterial color={completed.includes(String(zone.meta?.relay)) ? "#4c9b8c" : "#bda36e"} transparent opacity={0.08} depthWrite={false} />
    </mesh>)}
    {room.gates.flatMap(gate => [
      ...gate.plates.flatMap(id => {
        const signal = room.plates.find(p => p.id === id);
        return signal ? gate.cells.map((cell, i) => <Wire key={`${gate.id}:${id}:${i}`} from={signal.cell} to={cell} color={AMBER} lit={pressed.includes(id)} />) : [];
      }),
      ...gate.receivers.flatMap(id => {
        const signal = room.receivers.find(r => r.id === id);
        return signal ? gate.cells.map((cell, i) => <Wire key={`${gate.id}:${id}:${i}`} from={signal.cell} to={cell} color={CYAN} lit={powered.includes(id)} />) : [];
      }),
    ])}
    <AmbientStars />
  </group>;
}

function Prism({ cell, dir }: { cell: V2; dir: keyof typeof DIR_VECTORS }) {
  const ref = useRef<THREE.Group>(null);
  const status = useStore(duetStore, s => s.status);
  const reducedMotion = useStore(duetStore, s => s.reducedMotion);
  useFrame((_state, delta) => {
    if (ref.current && status === "playing" && !reducedMotion) ref.current.rotation.y += delta * 0.8;
  });
  const direction = DIR_VECTORS[dir];
  return <group position={[cell.x, 0, cell.z]}>
    <Ring radius={0.28} y={0.12} color={CYAN} />
    <group ref={ref}><Crystal color={CYAN} y={0.6} scale={0.2} /></group>
    <Block at={[direction.x * 0.3, 0.12, direction.z * 0.3]} size={[0.1, 0.05, 0.1]} color={CYAN} glow />
  </group>;
}
export function DuetVfx() {
  const latch = useStore(duetStore, s => s.latch);
  return <group>
    {latch.prism && <Prism cell={latch.prism.cell} dir={latch.prism.dir} />}
    {latch.anchorCell && <group position={[latch.anchorCell.x, 0, latch.anchorCell.z]}>
      <mesh position-y={0.24} castShadow><cylinderGeometry args={[0.23, 0.32, 0.42, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.3} /></mesh>
      <Ring radius={0.24} y={0.36} color={AMBER} />
      <Block at={[0, 0.49, 0]} size={[0.15, 0.12, 0.15]} color={DARK} />
    </group>}
  </group>;
}
