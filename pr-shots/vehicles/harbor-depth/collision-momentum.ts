import { createKinematicVehicle } from '../../harbor-heat/node_modules/@jgengine/core/dist/physics/kinematicVehicle.js';
import { createVehicleObstacleClamp } from '../../harbor-heat/node_modules/@jgengine/core/dist/physics/vehicleObstacles.js';
import { vehicleById } from '../../harbor-heat/src/game/entities/vehicles/catalog.ts';
const def=vehicleById('car_muscle')!;
if(def.dynamics.type!=='ground')throw Error('ground');
const dt=1/60;
const clamp=createVehicleObstacleClamp({obstacles:()=>[{position:[0,0,0.3],halfExtents:[1.4,1.2,1.4]}],dt:()=>dt,radius:1.4});
const sim=createKinematicVehicle(def.dynamics.tuning,{position:[0,1.28,0],heading:-Math.PI,clampMove:clamp.clampMove});
const rows=[];
for(let i=1;i<=60;i++) {const s=sim.tick(dt,{throttle:0,brake:1,steer:0,handbrake:0});if(i===1||i===2||i===60)rows.push({t:i*dt,position:s.position,velocity:sim.velocity(),forwardSpeed:s.forwardSpeed,gear:s.gear,impact:clamp.takeImpact()});}
console.log(JSON.stringify(rows,null,2));
await Bun.write(new URL('./collision-momentum-result.json',import.meta.url),JSON.stringify(rows,null,2));
