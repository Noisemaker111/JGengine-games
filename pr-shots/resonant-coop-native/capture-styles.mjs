import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='/workspace/games/.scratch/coop-evidence';
const plans=JSON.parse(readFileSync(`${root}/native-plans.json`,'utf8'));
const kind=process.argv[2];
const args=['scripts/drive-dev.ts','--url','http://127.0.0.1:5519','--timeout','300','--connect','9230'];
if(kind==='setup'){
 args.push('--size','half','--click','Begin expedition');
 for(let n=0;n<2;n++){
  if(n)args.push('--click','Swap hero');
  args.push(...plans[n].args,'--wait','20000','--probe',`setup-after-room-${n}`);
 }
}else if(kind==='desktop'||kind==='desktop-circuit'){
 args.push('--reuse-storage','--click','Continue','--probe','desktop-circuit-start','--key','KeyD:40','--probe','final-camera-key-east','--key','KeyA:40','--probe','final-camera-key-roundtrip');
 for(let i=0;i<plans[2].args.length;i+=2){
  args.push(plans[2].args[i],plans[2].args[i+1]);
  if(plans[2].args[i]==='--probe'&&plans[2].args[i+1]==='room_interlock-anchor-20'){args.push('--wait','5000','--shot',`${root}/style-circuit-desktop.png`,'--rpc','{"method":"debug_snapshot"}');if(kind==='desktop-circuit')break;}
 }
 if(kind==='desktop'){
 args.push('--wait','45000','--probe','desktop-courtyard-start','--click','Swap hero');
 for(let i=0;i<plans[3].args.length;i+=2){
  args.push(plans[3].args[i],plans[3].args[i+1]);
  if(plans[3].args[i]==='--probe'&&plans[3].args[i+1]==='room_crosswire-anchor-24')break;
 }
 args.push('--wait','5000','--shot',`${root}/style-courtyard-desktop.png`,'--rpc','{"method":"debug_snapshot"}');
 }
}else if(kind==='mobile-courtyard'){
 args.push('--device','mobile','--reuse-storage','--click','Continue','--probe','mobile-courtyard-start');
 for(let i=0;i<plans[3].args.length;i+=2){args.push(plans[3].args[i],plans[3].args[i+1]);if(plans[3].args[i]==='--probe'&&plans[3].args[i+1]==='room_crosswire-anchor-24')break;}
 args.push('--wait','5000','--shot',`${root}/style-courtyard-mobile.png`);
}else if(kind==='record-courtyard'){
 args.push('--size','half','--reuse-storage','--click','Continue','--record','resonant-court-first-relay','--record-fps','5','--probe','clip-court-start','--click','Ready','--key','KeyD:40','--probe','clip-key-east','--key','KeyA:40','--probe','clip-key-roundtrip');
 for(let i=0;i<plans[3].args.length;i+=2){
  if(plans[3].args[i]==='--click'&&plans[3].args[i+1]==='Drop Weight')args.push('--key','KeyE:120');else args.push(plans[3].args[i],plans[3].args[i+1]);
  if(plans[3].args[i]==='--probe'&&plans[3].args[i+1]==='room_crosswire-anchor-24')break;
 }
 args.push('--click','Hold','--wait','600','--click','Go!','--wait','3000','--probe','clip-court-first-relay-sealed','--shot',`${root}/clip-court-final.png`);
}else if(kind==='record'){
 args.push('--size','half','--reuse-storage','--click','Continue','--record','resonant-duet-two-stage','--record-fps','5','--probe','clip-circuit-start','--click','Ready');
 for(let i=0;i<plans[2].args.length;i+=2){args.push(plans[2].args[i],plans[2].args[i+1]);if(plans[2].args[i]==='--probe'&&plans[2].args[i+1]==='room_interlock-anchor-74')break;}
 args.push('--click','Go!','--wait','1000','--probe','clip-second-relay-sealed','--shot',`${root}/clip-two-stage-end.png`);
}else if(kind==='mobile-circuit'){
 args.push('--device','mobile','--reuse-storage','--click','Continue','--probe','mobile-circuit-start');
 for(let i=0;i<plans[2].args.length;i+=2){args.push(plans[2].args[i],plans[2].args[i+1]);if(plans[2].args[i]==='--probe'&&plans[2].args[i+1]==='room_interlock-anchor-20')break;}
 args.push('--wait','5000','--shot',`${root}/style-circuit-mobile.png`);
}else throw Error(kind);
writeFileSync(`${root}/${kind}-command.json`,JSON.stringify(args,null,2));
const t=performance.now();
const r=spawnSync('/home/agent/.npm/_npx/f87303d941e257a6/node_modules/.bin/bun',args,{cwd:'/workspace/engine/.claude/worktrees/coop-iteration',encoding:'utf8',timeout:600000,maxBuffer:10000000});
writeFileSync(`${root}/${kind}.log`,r.stdout+'\n'+r.stderr);console.log(JSON.stringify({kind,exit:r.status,ms:performance.now()-t,error:r.error?.message}));console.log(r.stdout.slice(-3000));console.log(r.stderr);process.exitCode=r.status??1;
