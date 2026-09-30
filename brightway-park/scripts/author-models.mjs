// Original Brightway Park geometry. Run from brightway-park with `bun run author-models`.
// No external artwork or source models are used in these meshes.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// GLTFExporter uses this browser interface to package buffers, without images.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
const out = new URL('../public/art/models/', import.meta.url);
await mkdir(out, { recursive: true });
const P = { cream: '#fff1cf', coral: '#ef7059', teal: '#247f83', gold: '#edbc5c', ink: '#24444c', wood: '#ad7960', leaf: '#4c8866', mint: '#a1cbb0', blue: '#77b8c8', pink: '#d77c9d' };
const materials = new Map();
const rotors = {};
function material(color, metal = 0) {
  const key = `${color}:${metal}`;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: .7, metalness: metal }));
  return materials.get(key);
}
function mesh(g, geometry, color, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new T.Mesh(geometry, material(color)); m.position.set(...pos); m.rotation.set(...rot); g.add(m); return m;
}
const box = (g, size, color, pos, rot) => mesh(g, new T.BoxGeometry(...size), color, pos, rot);
const cyl = (g, r, h, color, pos, top = r, segments = 24) => mesh(g, new T.CylinderGeometry(top, r, h, segments), color, pos);
const ball = (g, r, color, pos) => mesh(g, new T.IcosahedronGeometry(r, 1), color, pos);
const ring = (g, r, tube, color, pos, rot) => mesh(g, new T.TorusGeometry(r, tube, 8, 48), color, pos, rot);
function beam(g, a, b, radius, color) {
  const av = new T.Vector3(...a), bv = new T.Vector3(...b), delta = bv.clone().sub(av);
  const m = cyl(g, radius, delta.length(), color, av.clone().add(bv).multiplyScalar(.5).toArray(), radius, 8);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
}
function platform(g, r = 3.6) {
  cyl(g, r, .22, P.wood, [0,.11,0]); cyl(g, r-.12, .1, P.cream, [0,.27,0]);
  ring(g, r-.2, .07, P.gold, [0,.33,0], [Math.PI/2,0,0]);
}
function bulbs(g, r, y, count = 24) {
  for (let i=0;i<count;i++) { const a=i/count*Math.PI*2; ball(g,.085,i%2?P.gold:P.cream,[Math.cos(a)*r,y,Math.sin(a)*r]); }
}
function pennant(g, x, y, z, color) {
  beam(g,[x,y-1.3,z],[x,y+.8,z],.045,P.cream);
  const shape=new T.Shape(); shape.moveTo(0,0); shape.lineTo(.7,-.24); shape.lineTo(0,-.48); shape.closePath();
  mesh(g,new T.ShapeGeometry(shape),color,[x,y+.7,z]);
}
function horse(g, a) {
  const h = new T.Group(); h.position.set(Math.cos(a)*2.35,.65,Math.sin(a)*2.35); h.rotation.y=-a; g.add(h);
  cyl(h,.04,3.2,P.gold,[0,1.25,0],.04,8);
  const body=ball(h,.55,P.cream,[0,.8,0]); body.scale.set(1,.65,.48);
  beam(h,[.28,.9,0],[.5,1.55,0],.18,P.cream); ball(h,.24,P.cream,[.6,1.55,0]);
  box(h,[.22,.08,.36],P.coral,[0,1.08,0]);
  for(const x of [-.3,.3]) for(const z of [-.18,.18]) beam(h,[x,.75,z],[x+.12,.15,z],.065,P.cream);
  beam(h,[-.45,.8,0],[-.75,.5,0],.09,P.gold); ball(h,.035,P.ink,[.72,1.6,.19]);
}
function carousel() {
  const g=new T.Group(); platform(g); cyl(g,.32,4.8,P.teal,[0,2.7,0]);
  cyl(g,3.5,.4,P.coral,[0,3.9,0],3.5); cyl(g,3.5,1.4,P.cream,[0,4.75,0],.1);
  for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; beam(g,[Math.cos(a)*3.5,4.06,Math.sin(a)*3.5],[0,5.43,0],.055,P.coral); }
  bulbs(g,3.45,3.94); ball(g,.23,P.gold,[0,5.65,0]); pennant(g,0,6.1,0,P.teal);
  const rotor=new T.Group(); rotor.name='CarouselRotor';
  for(let i=0;i<6;i++) horse(rotor,i/6*Math.PI*2);
  rotors.carousel_rotor=rotor;
  return g;
}
function ferris() {
  const g=new T.Group(); platform(g,4.4);
  for(const z of [-1.2,1.2]) for(const x of [-2.7,2.7]) beam(g,[x,.3,z],[0,6,z],.18,P.teal);
  beam(g,[0,6,-1.5],[0,6,1.5],.2,P.gold); ball(g,.42,P.gold,[0,6,0]);
  const rotor=new T.Group(); rotor.name='FerrisRotor';
  for(const z of [-.35,.35]) ring(rotor,4.6,.12,P.coral,[0,0,z]);
  for(let i=0;i<10;i++){ const a=i/10*Math.PI*2, x=Math.cos(a)*4.6, y=Math.sin(a)*4.6;
    beam(rotor,[0,0,0],[x,y,0],.055,P.cream);
    const cabin=new T.Group(); cabin.name=`Cabin_${i}`; cabin.position.set(x,y,0); rotor.add(cabin);
    beam(cabin,[0,0,0],[0,-.65,0],.045,P.gold);
    box(cabin,[1,.65,.85],i%2?P.teal:P.coral,[0,-.98,0]); box(cabin,[1.15,.12,1],P.cream,[0,-.57,0]);
    ball(rotor,.12,P.gold,[x,y,.42]);
  } rotors.ferris_rotor=rotor; return g;
}
function drop() {
  const g=new T.Group(); platform(g,3.7);
  for(const x of [-.75,.75]) for(const z of [-.75,.75]) beam(g,[x,.3,z],[x,11.5,z],.12,P.teal);
  for(let y=1;y<11;y+=1.5){ box(g,[1.8,.1,1.8],P.gold,[0,y,0]); for(const z of [-.75,.75]) beam(g,[-.75,y,z],[.75,y+1.5,z],.055,P.cream); }
  cyl(g,1.6,.3,P.coral,[0,11.6,0]); cyl(g,1.6,1,P.cream,[0,12.2,0],.1);
  const carriage=new T.Group(); carriage.name='DropCarriage';
  box(carriage,[3.2,.35,3.2],P.coral,[0,0,0]); for(const x of [-1,0,1]) box(carriage,[.65,.8,.5],P.ink,[x,.55,1.15]);
  rotors.drop_carriage=carriage;
  bulbs(g,1.5,11.65,12); pennant(g,0,13.2,0,P.coral); return g;
}
function station() {
  const g=new T.Group(); box(g,[7.3,.35,6.3],P.wood,[0,.18,0]);
  for(const x of [-3,3]) for(const z of [-2.6,2.6]) beam(g,[x,.3,z],[x,3.1,z],.12,P.teal);
  box(g,[7.4,.22,6.6],P.coral,[0,3.1,0]);
  for(let i=0;i<8;i++) box(g,[.4,.1,6.8],P.cream,[-3.5+i,3.24,0]);
  box(g,[2.8,1.9,2],P.teal,[-1.8,1.35,-1.5]); box(g,[1.6,.7,.1],P.blue,[-1.8,1.8,-.44]);
  for(const x of [-.8,.8]) box(g,[.09,.13,6.6],P.ink,[x,1.1,0]);
  for(let i=0;i<3;i++){ const z=-1.8+i*1.6; box(g,[1.5,.6,1.3],P.coral,[0,1.6,z]); box(g,[1.1,.4,.8],P.gold,[0,2.05,z]); for(const x of [-.8,.8]) ball(g,.17,P.ink,[x,1.35,z]); }
  for(const x of [-3.6,3.6]) pennant(g,x,3.8,-2.8,P.gold); return g;
}
function track() {
  const g=new T.Group(); for(const x of [-.65,.65]) { box(g,[.1,.13,4],P.coral,[x,1.15,0]); for(const z of [-1.5,1.5]) beam(g,[x,0,z],[x,1.15,z],.07,P.teal); }
  for(let z=-1.8;z<2;z+=.4) box(g,[1.6,.12,.12],P.wood,[0,1.02,z]); return g;
}
function stall(color, kind) {
  const g=new T.Group(); box(g,[3.5,.2,3.5],P.wood,[0,.1,0]); box(g,[2.8,2.1,2.4],color,[0,1.25,0]);
  box(g,[2.4,.9,.06],P.ink,[0,1.7,1.24]); box(g,[3,.14,.7],P.cream,[0,1.17,1.52]);
  for(let i=0;i<8;i++) { const x=-1.4+i*.4; box(g,[.4,.12,3.3],i%2?color:P.cream,[x,2.65,.3],[.09,0,0]); box(g,[.4,.4,.1],i%2?color:P.cream,[x,2.45,1.95]); }
  box(g,[2.4,.65,.18],P.cream,[0,3.05,0]);
  if(kind==='food'){ cyl(g,.58,.17,P.gold,[0,3.65,0]); cyl(g,.61,.14,P.wood,[0,3.55,0]); cyl(g,.58,.14,P.gold,[0,3.43,0]); }
  if(kind==='drink'){ cyl(g,.35,.75,P.blue,[0,3.75,0],.46); beam(g,[.1,4.1,0],[.3,4.7,0],.045,P.coral); }
  if(kind==='gift'){ ball(g,.43,P.pink,[0,3.7,0]); for(const x of [-.33,.33]) ball(g,.2,P.pink,[x,4,0]); }
  for(const x of [-1.35,1.35]) beam(g,[x,1.2,1.8],[x,2.6,1.8],.045,P.gold); return g;
}
function tree() {
  const g=new T.Group(); cyl(g,.23,2.4,P.wood,[0,1.2,0],.17,8);
  for(const [x,y,z,r] of [[0,3.2,0,1.3],[-.8,2.6,.1,1],[.8,2.75,-.3,.95],[0,4.1,0,.8]]) ball(g,r,y>3.5?P.mint:P.leaf,[x,y,z]); return g;
}
function flowers() {
  const g=new T.Group(); box(g,[3.5,.35,2.8],P.wood,[0,.18,0]); box(g,[3.2,.08,2.5],P.ink,[0,.4,0]);
  for(let x=-1.1;x<=1.2;x+=.55) for(let z=-.8;z<=.9;z+=.55){ beam(g,[x,.4,z],[x,.9,z],.025,P.leaf); ball(g,.16,(Math.round(x*10+z*20)%2)?P.coral:P.gold,[x,.95,z]); }
  return g;
}
function lamp() {
  const g=new T.Group(); cyl(g,.35,.18,P.wood,[0,.09,0]); beam(g,[0,.1,0],[0,3.9,0],.09,P.teal);
  box(g,[.65,.85,.65],P.gold,[0,3.8,0]); cyl(g,.55,.4,P.teal,[0,4.35,0],.04,4); ball(g,.12,P.gold,[0,4.6,0]); return g;
}
function fountain() {
  const g=new T.Group(); cyl(g,1.85,.45,P.cream,[0,.23,0]); cyl(g,1.6,.12,P.blue,[0,.46,0]);
  cyl(g,.25,1.5,P.teal,[0,1.1,0]); cyl(g,.9,.2,P.cream,[0,1.7,0]); cyl(g,.78,.06,P.blue,[0,1.83,0]);
  ball(g,.32,P.gold,[0,2.2,0]); for(let i=0;i<8;i++){ const a=i/8*Math.PI*2; beam(g,[0,2.1,0],[Math.cos(a)*1.3,.6,Math.sin(a)*1.3],.026,P.blue); }
  return g;
}
function janitor(){ const g=new T.Group(); box(g,[2.9,2.8,2.7],P.teal,[0,1.4,0]); cyl(g,2.25,.75,P.cream,[0,3.1,0],.05,4); box(g,[1.1,2,.08],P.wood,[0,1,1.4]); box(g,[.7,.7,.1],P.blue,[0,1.5,1.47]);
  for(const x of [-1.4,1.4]){ cyl(g,.4,.85,P.coral,[x,.5,1.1]); cyl(g,.45,.08,P.gold,[x,.95,1.1]); } beam(g,[1.4,.1,-1.3],[1.7,2.3,-1.3],.045,P.wood); box(g,[.75,.25,.25],P.gold,[1.4,.2,-1.3]); return g; }
function path(){ const g=new T.Group(); box(g,[3.96,.12,3.96],P.wood,[0,.06,0]); for(let i=0;i<6;i++) box(g,[3.8,.05,.58],i%2?P.cream:'#e5ccaa',[0,.15,-1.65+i*.66]); return g; }
function topiary(){ const g=new T.Group(); cyl(g,.6,.6,P.coral,[0,.3,0],.8); cyl(g,.15,1.3,P.wood,[0,1,0]); ball(g,1.1,P.leaf,[0,2,0]); ball(g,.7,P.mint,[0,3,0]); return g; }
function guest(color, i){ const g=new T.Group(); const skin=['#edc1a2','#b37b5c','#d39f7d','#865640','#f1cfb2'][i];
  for(const x of [-.14,.14]){ box(g,[.19,.65,.23],P.ink,[x,.38,0]); box(g,[.23,.14,.4],P.cream,[x,.08,.07]); }
  cyl(g,.28,.7,color,[0,1,0],.34,8); ball(g,.28,skin,[0,1.63,0]);
  for(const x of [-.39,.39]) beam(g,[x,1.3,0],[x,.85,.05],.085,skin);
  cyl(g,.3,.12,P.ink,[0,1.84,0],.27,12); if(i%2===0) cyl(g,.39,.05,P.gold,[0,1.85,0]);
  box(g,[.3,.35,.18],P.wood,[0,1,-.29]); return g; }
const models={ ride_carousel:carousel(), ride_coaster:station(), ride_ferris:ferris(), ride_dropzone:drop(), track_piece:track(), path_walk:path(), stall_food:stall(P.coral,'food'), stall_drink:stall(P.teal,'drink'), stall_souvenir:stall(P.pink,'gift'), deco_tree:tree(), deco_flowerbed:flowers(), deco_lamp:lamp(), deco_fountain:fountain(), deco_topiary:topiary(), staff_janitor:janitor() };
for(let i=0;i<5;i++) models[`guest_${'abcde'[i]}`]=guest([P.coral,P.blue,P.gold,P.mint,P.pink][i],i);
Object.assign(models,rotors);
const exporter=new GLTFExporter(); let bytes=0;
for(const [name,g] of Object.entries(models)){
  g.name=name; const buffer=await exporter.parseAsync(g,{binary:true,copyright:'Original geometry authored for Brightway Park, 2026'});
  await writeFile(new URL(`${name}.glb`,out),Buffer.from(buffer)); bytes+=buffer.byteLength;
}
console.log(`Authored ${Object.keys(models).length} original GLBs (${bytes.toLocaleString()} bytes) in ${fileURLToPath(out)}`);
