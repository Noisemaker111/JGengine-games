import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { pathFollowSeek } from "@jgengine/core/nav/pathFollow";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Group, Mesh, Plane, Raycaster, TextureLoader, Vector2, Vector3 } from "three";
import { session } from "../session";
import { cellCentres, cellFor, park, parkObject, parkObjects, type ParkObject } from "../park";
import { BUILDABLES } from "../objects/catalog";
import { coasterCircuit, rideView } from "../rides";
import { placementAt } from "../build/placement";
import { GRID, snapToGrid } from "../catalog";
import { traceNative } from "../evidence";
import { hoverRefusal, placementHintStore } from "../build/placementHint";
import { SceneCaptureBinding } from "@jgengine/shell/render/sceneCapture";
import { bindParkCapture } from "../parkProfile";

const rotors: Record<string,string> = {
  ride_carousel: new URL("../../../public/art/models/carousel_rotor.glb",import.meta.url).href,
  ride_ferris: new URL("../../../public/art/models/ferris_rotor.glb",import.meta.url).href,
  ride_dropzone: new URL("../../../public/art/models/drop_carriage.glb",import.meta.url).href,
};
function RideMotion({object}:{object:ParkObject}) {
  const gltf=useLoader(GLTFLoader,rotors[object.kind]!);
  const clock=useGameStore(ctx=>ctx.time);
  const reduced=useGameStore(ctx=>Boolean(ctx.game.store.get("park.reduced-motion")));
  const ref=useRef<Group>(null);
  const scene=useMemo(()=>{const copy=gltf.scene.clone();copy.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});return copy;},[gltf]);
  useFrame(()=>{
    const root=ref.current; if(!root)return;
    const t=reduced?0:clock.now();
    if(object.kind==="ride_carousel") root.rotation.y=t*.25;
    if(object.kind==="ride_ferris") {
      root.rotation.z=t*.09;
      scene.traverse(n=>{if(n.name.startsWith("Cabin_"))n.rotation.z=-root.rotation.z;});
    }
    if(object.kind==="ride_dropzone") {const phase=(t%12)/12;root.position.y=1+(phase<.8?phase/.8:Math.pow((1-phase)/.2,3))*8.5;}
  });
  return <group userData={{jgObjectId:object.id}} position={[object.x,object.kind==="ride_ferris"?6:0,object.z]}><group ref={ref}><primitive object={scene}/></group></group>;
}
const trainModel = new URL("../../../public/art/models/coaster_train.glb", import.meta.url).href;

/**
 * The train is the ride made visible. The shared path follower places it at the lap fraction the
 * ride sim's own cycle reports, so it leaves the station, runs the ring and is back at the platform
 * when the lap the track measured is over.
 */
function CoasterTrain({object,circuit}:{object:ParkObject;circuit:ReturnType<typeof coasterCircuit>}) {
  const gltf=useLoader(GLTFLoader,trainModel);
  const ref=useRef<Group>(null);
  const reduced=useGameStore(ctx=>Boolean(ctx.game.store.get("park.reduced-motion")));
  const scene=useMemo(()=>{const copy=gltf.scene.clone();copy.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});return copy;},[gltf]);
  const path=useMemo(()=>({waypoints:circuit.waypoints,speed:Math.max(1,circuit.averageSpeed),loop:true}),[circuit]);
  useFrame(()=>{
    const root=ref.current; if(!root) return;
    if(!circuit.closed||path.waypoints.length<3){root.visible=false;return;}
    root.visible=true;
    const view=rideView(object.id);
    const lap=Math.max(4,circuit.lapSeconds);
    const progress=view?.phase==="riding"&&!reduced?Math.min(1,Math.max(0,1-view.phaseSeconds/lap)):0;
    const pose=pathFollowSeek(path,{kind:"normalized",value:progress});
    root.position.set(pose.position[0],pose.position[1]+1.2,pose.position[2]);
    root.rotation.y=pose.heading;
  });
  return <group userData={{jgObjectId:object.id}}><group ref={ref}><primitive object={scene}/></group></group>;
}
function Entrance() {  const sign=useLoader(TextureLoader,new URL("../../../public/art/brightway-sign.svg",import.meta.url).href);
  return <group position={[0,0,56]}>
    {[-6,6].map(x=><group key={x}><mesh castShadow position={[x,2.3,0]}><boxGeometry args={[.65,4.6,.65]}/><meshStandardMaterial color="#247f83"/></mesh><mesh position={[x,4.85,0]}><sphereGeometry args={[.4,12,8]}/><meshStandardMaterial color="#edbc5c"/></mesh><mesh castShadow position={[x,1.2,0]}><boxGeometry args={[2,2.4,2.4]}/><meshStandardMaterial color="#ef7059"/></mesh><mesh position={[x,1.65,1.22]}><boxGeometry args={[1.4,.8,.06]}/><meshStandardMaterial color="#77b8c8"/></mesh></group>)}
    <mesh position={[0,4.2,0]}><boxGeometry args={[12,.35,.4]}/><meshStandardMaterial color="#edbc5c"/></mesh>
    <mesh position={[0,4.4,.24]}><planeGeometry args={[9,2.8]}/><meshBasicMaterial map={sign} transparent/></mesh>
    <mesh position={[0,4.4,-.24]} rotation={[0,Math.PI,0]}><planeGeometry args={[9,2.8]}/><meshBasicMaterial map={sign} transparent/></mesh>
  </group>;
}
function Fence() {
  const posts=useMemo(()=>{
    const points:[number,number][]=[];
    for(let i=-60;i<=60;i+=8){points.push([-60,i],[60,i],[i,-60]);if(Math.abs(i)>8)points.push([i,60]);}return points;
  },[]);
  return <group>
    {posts.map(([x,z],i)=><mesh key={i} castShadow position={[x,.8,z]}><boxGeometry args={[.23,1.6,.23]}/><meshStandardMaterial color="#fff1cf"/></mesh>)}
    {[.6,1.2].map(y=><group key={y}>{[-60,60].map(x=><mesh key={x} position={[x,y,0]}><boxGeometry args={[.12,.1,120]}/><meshStandardMaterial color="#ad7960"/></mesh>)}<mesh position={[0,y,-60]}><boxGeometry args={[120,.1,.12]}/><meshStandardMaterial color="#ad7960"/></mesh>{[-35,35].map(x=><mesh key={x} position={[x,y,60]}><boxGeometry args={[50,.1,.12]}/><meshStandardMaterial color="#ad7960"/></mesh>)}</group>)}
    <Entrance/>
  </group>;
}
function Blueprint() {
  const {gl,camera}=useThree(); const ctx=useGameContext(); const [hover,setHover]=useState<[number,number]|null>(null);
  const selected=useGameStore(()=>session.selectedTool);
  useGameStore(c=>park.store.read(c));
  useEffect(()=>{
    const ray=new Raycaster(),plane=new Plane(new Vector3(0,1,0),0),hit=new Vector3();
    const move=(e:PointerEvent)=>{
      const r=gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      if(!ray.ray.intersectPlane(plane,hit)){setHover(null);return;}
      const x=snapToGrid(hit.x),z=snapToGrid(hit.z);
      setHover(old=>old?.[0]===x&&old?.[1]===z?old:[x,z]);
    };
    const leave=()=>setHover(null);
    const inspect=(e:PointerEvent)=>traceNative("canvas-pointer",{screen:[e.clientX,e.clientY],camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),viewport:gl.domElement.getBoundingClientRect().toJSON()});
    gl.domElement.addEventListener("pointerdown",inspect);
    gl.domElement.addEventListener("pointermove",move);gl.domElement.addEventListener("pointerleave",leave);
    return()=>{gl.domElement.removeEventListener("pointermove",move);gl.domElement.removeEventListener("pointerleave",leave);gl.domElement.removeEventListener("pointerdown",inspect);};
  },[gl,camera]);
  const def=selected?BUILDABLES[selected]:null;
  const check=def&&hover?placementAt(park.of(ctx),def.id,...hover):null;
  const refusal=check===null?null:hoverRefusal(check);
  useEffect(()=>{if(placementHintStore.read(ctx)!==refusal)placementHintStore.write(ctx,refusal);return()=>{if(placementHintStore.read(ctx)!==null)placementHintStore.write(ctx,null);};},[ctx,refusal]);
  if(!def||!hover)return null;
  const valid=refusal===null;
  const color=valid?"#7cf3c8":"#ef7059";
  const centres=cellCentres(def.id,cellFor(def.id,...hover));
  return <group>{centres.map(([x,z])=>{const key=`${x},${z}`;return <mesh key={key} position={[x,.22,z]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><planeGeometry args={[GRID-.12,GRID-.12]}/><meshBasicMaterial color={color} transparent opacity={.4} depthWrite={false}/></mesh>;})}</group>;
}
export function BrightwayParkWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding bind={bindParkCapture} />
      <OverlayBodies />
    </>
  );
}

function OverlayBodies() {
  const ctx=useGameContext();
  const selection=useGameStore(()=>session.selectedObject);
  const objects=useGameStore(c=>parkObjects(c));
  const circuit=useMemo(()=>coasterCircuit(ctx),[ctx,objects]);
  const obj=parkObject(ctx,selection);
  return <group><Fence/><Blueprint/>
    {objects.filter(o=>rotors[o.kind]).map(o=><RideMotion key={o.id} object={o}/>)}
    {objects.filter(o=>o.kind==="ride_coaster").map(o=><CoasterTrain key={o.id} object={o} circuit={circuit}/>)}
    {obj&&<mesh position={[obj.x,.23,obj.z]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><ringGeometry args={[Math.max(2,obj.def.footprint*.65),Math.max(2,obj.def.footprint*.65)+.18,48]}/><meshBasicMaterial color="#edbc5c"/></mesh>}
  </group>;
}


