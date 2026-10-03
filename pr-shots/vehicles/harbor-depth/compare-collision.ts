import {createKinematicVehicle as publishedVehicle} from '../../harbor-heat/node_modules/@jgengine/core/dist/physics/kinematicVehicle.js';
import {createVehicleObstacleClamp as publishedClamp} from '../../harbor-heat/node_modules/@jgengine/core/dist/physics/vehicleObstacles.js';
import {createKinematicVehicle as candidateVehicle} from '/workspace/jgengine/.claude/worktrees/vehicles-collision/packages/core/src/physics/kinematicVehicle.ts';
import {createVehicleObstacleClamp as candidateClamp} from '/workspace/jgengine/.claude/worktrees/vehicles-collision/packages/core/src/physics/vehicleObstacles.ts';
import {createGameContext} from '../../harbor-heat/node_modules/@jgengine/core/dist/runtime/gameContext.js';
import {advanceBehaviors} from '../../harbor-heat/node_modules/@jgengine/core/dist/scene/behaviorRuntime.js';
import {tickDrivableVehicle} from '../../harbor-heat/node_modules/@jgengine/core/dist/physics/drivableVehicle.js';
import {roadSurfaceSampler,distanceToRoadEdge} from '../../harbor-heat/node_modules/@jgengine/core/dist/world.js';
import {game} from '../../harbor-heat/src/game.config.ts';
import {content} from '../../harbor-heat/src/game/content.ts';
import {streets} from '../../harbor-heat/src/world.ts';
import {vehicleById} from '../../harbor-heat/src/game/entities/vehicles/catalog.ts';
import {objectById} from '../../harbor-heat/src/game/objects/catalog.ts';
import {createDriving} from '../../harbor-heat/src/game/handroll/driving.ts';
import {createPursuit} from '../../harbor-heat/src/game/handroll/pursuit.ts';
import {createRace} from '../../harbor-heat/src/game/handroll/race.ts';
import {handrollOf} from '../../harbor-heat/src/game/handroll/index.ts';
const DT=1/60,ID='veh_10',HERO='audit-player';
const def=vehicleById('car_muscle')!;if(def.dynamics.type!=='ground')throw Error('ground');
const axis={throttle:0,brake:1,steer:0,handbrake:0};
const report:any={provenance:'Deterministic Bun fixture; published 0.18.1 game source/content and real authored world/race/pursuit/behaviors. Candidate constructors imported explicitly from dedicated SDK worktree. No game dependency aliases, browser execution, or unpublished package adoption.',minimal:{},harbor:{}};
for(const [label,createVehicle,createClamp] of [['published',publishedVehicle,publishedClamp],['candidate',candidateVehicle,candidateClamp]] as const){
 const clamp=createClamp({obstacles:()=>[{position:[0,0,.3],halfExtents:[1.4,1.2,1.4]}],dt:()=>DT,radius:1.4});
 const sim=createVehicle(def.dynamics.tuning,{position:[0,1.28,0],heading:-Math.PI,clampMove:clamp.clampMove});
 const rows=[];for(let i=1;i<=60;i++){const s=sim.tick(DT,axis);const impact=clamp.takeImpact();if(i<=2||i===60)rows.push({t:i*DT,position:s.position,velocity:sim.velocity(),forwardSpeed:s.forwardSpeed,gear:s.gear,impact});}
 report.minimal[label]=rows;
}
function context(){const ctx=createGameContext({definition:game.game,content,player:{userId:HERO,isNew:true}});game.loop.onInit(ctx);ctx.scene.entity.spawn('street_runner',{id:HERO,position:[-176.7,1.28,-4],role:'player'});return ctx;}
function adapter(ctx:any,createVehicle:any,createClamp:any){
 const base=createDriving();base.enterVehicle(ctx,ID);
 const frame:{obstacles:any[],dt:number}={obstacles:[],dt:DT};
 const clamp=createClamp({obstacles:()=>frame.obstacles,dt:()=>frame.dt,radius:def.collisionRadius});
 const car=ctx.scene.entity.get(ID);
 const surfaceFriction=roadSurfaceSampler(streets,{onRoad:1,offRoad:.72,shoulder:3});
 const sim=createVehicle(def.dynamics.tuning,{position:car.position,heading:car.rotationY,surfaceFriction,dragAt:(x:number,z:number)=>{const edge=distanceToRoadEdge(streets,x,z);return edge<=0?0:.35*Math.min(1,edge/3);},clampMove:clamp.clampMove});
 const impactRows:any[]=[];let lastStep:any;
 const driving={...base,tickDriving(c:any,dt:number){
  const position=sim.pose().position;const [cx,cy,cz]=position;const gather=30+def.collisionRadius;const obstacles=[];
  for(const obj of c.scene.object.inBox([cx-gather,cy-4,cz-gather],[cx+gather,cy+12,cz+gather])){const d=objectById(obj.catalogId);if(d?.solid)obstacles.push({position:obj.position,halfExtents:[d.footprint.w/2,d.footprint.h/2,d.footprint.d/2]});}
  for(const e of c.scene.entity.list()){if(e.id===ID)continue;const d=vehicleById(e.name);if(d?.dynamics.type!=='ground')continue;if((e.position[0]-cx)**2+(e.position[2]-cz)**2>gather*gather)continue;obstacles.push({position:e.position,halfExtents:[d.collisionRadius,1.2,d.collisionRadius]});}
  frame.obstacles=obstacles;frame.dt=dt;
  const result=tickDrivableVehicle(sim,dt,c.input.axis({throttle:{positive:['moveForward']},brake:{positive:['moveBack']},steer:{positive:['moveRight'],negative:['moveLeft']},handbrake:{positive:['jump']}}),{groundHeight:(x:number,z:number)=>c.world.groundHeightAt(x,z)});
  lastStep=result.step;c.scene.entity.setPose(ID,result.pose);c.scene.entity.setPose(HERO,{...result.pose,position:[result.pose.position[0],result.pose.position[1]+.4,result.pose.position[2]],dt:undefined});
  const impact=clamp.takeImpact();if(impact)impactRows.push({t:c.time.now(),...impact});
 },carSpeedKmh:()=>Math.abs(lastStep?.forwardSpeed??0)*3.6,telemetry:()=>({mode:'ground',speedMs:Math.abs(lastStep?.forwardSpeed??0),altitude:0,verticalSpeed:0,gear:lastStep?.gear??1,rpm:lastStep?.rpm??0,stalled:false,vtol:false})};
 const pursuit=createPursuit(driving),race=createRace(driving),hand=handrollOf(ctx);
 Object.assign(hand,{...driving,startRace:(c:any)=>race.startRace(c),tick(c:any,dt:number){driving.tickDriving(c,dt);pursuit.tickWanted(c,dt);pursuit.tickPedPanic(c);pursuit.tickCops(c,dt);pursuit.tickCruisers(c,dt);race.tick(c,dt);}});
 return {hand,impactRows,motorVelocity:()=>sim.velocity()};
}
for(const label of ['actual-published','adapter-published','adapter-candidate']){
 const ctx=context();const built=label==='actual-published'?null:adapter(ctx,label==='adapter-published'?publishedVehicle:candidateVehicle,label==='adapter-published'?publishedClamp:candidateClamp);
 const hand=built?.hand??handrollOf(ctx);if(!built)hand.enterVehicle(ctx,ID);ctx.game.commands.run('game.start',{});hand.startRace(ctx);ctx.input.publish(['moveBack']);
 const rows=[];let oppositeVelocityFrames=0,oppositeMotorFrames=0,negativePositionFrames=0,maxSpeed=0,maxMotorSpeed=0,lastZ=-4;
 for(let i=1;i<=1800;i++){ctx.time.advance(DT);game.loop.onTick(ctx,DT);advanceBehaviors(ctx,DT);const car=ctx.scene.entity.get(ID);if(!car){rows.push({t:i*DT,removed:true});break;}const motor=built?.motorVelocity()??[car.velocity[0],car.velocity[2]];maxMotorSpeed=Math.max(maxMotorSpeed,Math.hypot(...motor));if(motor[1]<-1e-6)oppositeMotorFrames++;const speed=Math.hypot(car.velocity[0],car.velocity[2]);maxSpeed=Math.max(maxSpeed,speed);if(car.velocity[2]<-1e-6)oppositeVelocityFrames++;if(car.position[2]<lastZ-1e-6)negativePositionFrames++;lastZ=car.position[2];if(i%60===0)rows.push({t:i*DT,position:car.position,velocity:car.velocity,motorVelocity:motor,heading:car.rotationY,telemetry:hand.telemetry()});}
 report.harbor[label]={rows,oppositeVelocityFrames,oppositeMotorFrames,negativePositionFrames,maxSpeed,maxMotorSpeed,impacts:built?.impactRows??null};console.log(JSON.stringify({label,oppositeVelocityFrames,oppositeMotorFrames,negativePositionFrames,maxSpeed,maxMotorSpeed,final:rows.at(-1)}));
}
const actual=report.harbor['actual-published'].rows,fixture=report.harbor['adapter-published'].rows;
report.adapterValidation={maxPositionDelta:Math.max(...actual.map((r:any,i:number)=>Math.hypot(...r.position.map((v:number,k:number)=>v-fixture[i].position[k])))),maxVelocityDelta:Math.max(...actual.map((r:any,i:number)=>Math.hypot(...r.velocity.map((v:number,k:number)=>v-fixture[i].velocity[k]))))};
await Bun.write(new URL('./collision-comparison.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report.adapterValidation));
