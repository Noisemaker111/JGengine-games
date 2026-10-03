import { readFileSync, writeFileSync } from 'node:fs';
import { deriveRoomState, activeSpikeCells } from '../../.claude/worktrees/coop-manager/resonant-crossing/src/game/rooms/engine.ts';

const root = '/workspace/games/.claude/worktrees/coop-manager/resonant-crossing';
const document = JSON.parse(readFileSync(`${root}/src/editor.scene.json`, 'utf8'));
const plans = [];
const moves = [['north',0,-1],['east',1,0],['south',0,1],['west',-1,0]] as const;
for (const grid of document.grids) {
  const meta = grid.meta;
  const room: any = { id: grid.id, floor: [], walls: [], spawn: {}, exit: {}, plates: [], receivers: [], gates: [], spikes: [], relays: meta.relays ?? [] };
  const gateMap = new Map(), spikeMap = new Map();
  for(let z=0;z<grid.rows;z++) for(let x=0;x<grid.cols;x++) {
    const glyph=grid.cells[`${x},${z}`] ?? '#', cell={x:x+grid.origin.x,z:z+grid.origin.z};
    if(glyph==='#'||glyph==='') { room.walls.push(cell); continue; }
    room.floor.push(cell);
    if(glyph==='L') room.spawn.lumen=cell;
    if(glyph==='A') room.spawn.anchor=cell;
    if(glyph==='o') room.exit.lumen=cell;
    if(glyph==='0') room.exit.anchor=cell;
    if('123456789'.includes(glyph)) room.plates.push({id:`p${glyph}`,cell});
    if('rstuvw'.includes(glyph)) room.receivers.push({id:`r_${glyph}`,cell});
    const map='GHIJK'.includes(glyph)?gateMap:'XYZ'.includes(glyph)?spikeMap:null;
    if(map) map.set(glyph,[...(map.get(glyph)??[]),cell]);
  }
  for(const [glyph,cells] of gateMap) room.gates.push({id:`g_${glyph}`,cells,plates:[],receivers:[],...meta.links?.gates?.[glyph]});
  for(const [glyph,cells] of spikeMap) room.spikes.push({id:`s_${glyph}`,cells,retractedBy:null,...meta.links?.spikes?.[glyph]});
  const heroes={...room.spawn};
  let active='lumen', latch: any={anchorCell:null,prism:null};
  const args=[]; let steps=0;
  const sync=()=>{latch={...latch,completedRelays:deriveRoomState(room,latch,heroes).completedRelays};};
  const select=(hero:string)=>{if(active!==hero){args.push('--click','Swap hero');active=hero;}};
  for(const operation of meta.solution??[]) {
    if(operation.kind==='move') {
      select(operation.hero);
      const [kind,id]=operation.target.split(':');
      const raw=kind==='exit'?room.exit[id]:(kind==='plate'?room.plates:room.receivers).find((item:any)=>item.id===id)?.cell;
      if(!raw) throw new Error(`${grid.id}: missing ${operation.target}`);
      const target={x:raw.x+(operation.offset?.x??0),z:raw.z+(operation.offset?.z??0)};
      const start=heroes[operation.hero], queue=[{cell:start,path:[]}], seen=new Set([`${start.x},${start.z}`]);
      let found:any;
      while(queue.length) {
        const next=queue.shift()!;
        if(next.cell.x===target.x&&next.cell.z===target.z){found=next.path;break;}
        const state=deriveRoomState(room,latch,{...heroes,[operation.hero]:next.cell});
        const danger=activeSpikeCells(room,state);
        for(const [dir,dx,dz] of moves) {
          const cell={x:next.cell.x+dx,z:next.cell.z+dz}, key=`${cell.x},${cell.z}`;
          if(seen.has(key)||state.blocked.has(key)||danger.has(key)||!room.floor.some((p:any)=>p.x===cell.x&&p.z===cell.z))continue;
          seen.add(key);queue.push({cell,path:[...next.path,dir]});
        }
      }
      if(!found) throw new Error(`${grid.id}: no safe path to ${operation.target}`);
      for(const dir of found){args.push('--click',`Move ${dir}`);steps++;}
      heroes[operation.hero]=target;sync();
    } else if(operation.kind==='anchor') {
      select('anchor');args.push('--click','Drop Weight','--wait','200');latch={...latch,anchorCell:heroes.anchor};sync();
    } else if(operation.kind==='prism') {
      select('lumen');args.push('--click',`Aim prism ${operation.dir}`,'--wait','200');latch={...latch,prism:{cell:heroes.lumen,dir:operation.dir}};sync();
    }
    args.push('--probe',`${grid.id}-${operation.kind}-${args.length}`);
  }
  plans.push({id:grid.id,label:grid.label,steps,args,expected:deriveRoomState(room,latch,heroes)});
}
writeFileSync('/workspace/games/.scratch/coop-evidence/native-plans.json',JSON.stringify(plans,null,2));
console.log(plans.map(p=>({id:p.id,steps:p.steps,solved:p.expected.solved,relays:p.expected.completedRelays})));
