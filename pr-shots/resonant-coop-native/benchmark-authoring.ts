import { createEditorHost } from "/workspace/games/resonant-crossing/node_modules/@jgengine/editor/dist/session.js";
import { readFileSync, writeFileSync } from "node:fs";
const source = JSON.parse(readFileSync("/workspace/games/.claude/worktrees/coop-manager/resonant-crossing/src/editor.scene.json", "utf8"));
const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))) : entry);
const results = [];
for (const roomId of ["interlock", "crosswire"]) {
  const layer = source.grids.find(layer => layer.id === `room_${roomId}`);
  const cells = Object.entries(layer.cells).map(([key, value]) => { const [col,row]=key.split(",").map(Number);return {col,row,value}; });
  const samples = { single: [], batch: [] };
  for (let repeat=0;repeat<5;repeat++) for (const mode of ["single","batch"]) {
    const host=createEditorHost({gameId:"resonant-crossing",layers:structuredClone(source)});
    const start=performance.now();let calls=0;
    const rpc=(request)=>{calls++;const response=host.api.handle(request);if(!response.ok)throw Error(response.error);};
    rpc({method:"remove_grid_layer",id:layer.id});
    rpc({method:"dispatch",command:{type:"addGridLayer",layer:{...layer,cells:{}}}});
    if(mode==="single") for(const cell of cells)rpc({method:"paint_grid_cells",id:layer.id,cells:[cell]});
    else rpc({method:"paint_grid_cells",id:layer.id,cells});
    const exported=host.session.getState().document.grids.find(row=>row.id===layer.id);
    if(canonical(exported)!==canonical(layer))throw Error("Recreation differs from saved authored room");
    samples[mode].push({ms:performance.now()-start,calls});host.dispose();
  }
  const summary=(mode)=>({calls:samples[mode][0].calls,medianMs:Number(samples[mode].map(x=>x.ms).sort((a,b)=>a-b)[2].toFixed(2))});
  results.push({roomId,style:layer.meta.style,cells:cells.length,trials:5,singleCell:summary("single"),wholeRoomBatch:summary("batch"),document:"identical"});
}
writeFileSync("/workspace/games/.scratch/coop-map/authoring-benchmark.json",JSON.stringify(results,null,2)+"\n");console.log(JSON.stringify(results));
