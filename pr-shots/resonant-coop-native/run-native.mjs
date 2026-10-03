import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='/workspace/games/.scratch/coop-evidence';
const plans=JSON.parse(readFileSync(`${root}/native-plans.json`,'utf8'));
const startIndex=Number(process.argv[2]??0);
const args=['scripts/drive-dev.ts','--url','http://127.0.0.1:5519','--size','half','--timeout','300'];
if(startIndex)args.push('--reuse-storage','--click','Continue','--probe','checkpoint-resumed-after-role-preservation');
else args.push('--click','Begin expedition','--probe','start','--key','KeyD:40','--probe','keyboard-east','--key','KeyA:40','--probe','keyboard-west-roundtrip','--click','Pause','--key','KeyD:40','--probe','paused-pose-held','--click','Resume expedition','--probe','resumed-pose-held');
for(const [index,plan] of plans.entries()){
  if(index<startIndex)continue;
  if(index!==startIndex&&index!==2)args.push('--click','Swap hero');
  args.push('--rpc','{"method":"debug_perf_reset"}');
  let hazardChecked=false;
  for(let i=0;i<plan.args.length;i+=2){
    const option=plan.args[i],value=plan.args[i+1];
    if(index===0&&option==='--click'&&value==='Drop Weight')args.push('--key','KeyE:120');
    else args.push(option,value);
    if(option==='--probe'&&value.includes('-anchor-')&&index>=2){
      args.push('--click','Hold','--shot',`${root}/${value}.png`);
      if(index===3&&!hazardChecked){
        hazardChecked=true;
        args.push('--click','Swap hero');
        for(let n=0;n<6;n++)args.push('--click','Move east');
        for(let n=0;n<2;n++)args.push('--click','Move south');
        args.push('--wait','1000','--probe','before-live-hazard','--click','Move south','--wait','1000','--probe','live-hazard-recovered','--click','Recover','--shot',`${root}/live-hazard-recovery.png`);
        for(let n=0;n<2;n++)args.push('--click','Move north');
        for(let n=0;n<6;n++)args.push('--click','Move west');
        args.push('--click','Swap hero','--probe','live-hazard-returned-to-station');
      }
    }
  }
  args.push('--wait','700','--probe',`${plan.id}-both-exits`,'--rpc','{"method":"debug_snapshot"}','--wait','20000','--probe',`${plan.id}-advanced`);
  if(index===1)args.push('--reload','--probe','checkpoint-menu','--click','Continue','--probe','checkpoint-resumed');
}
args.push('--shot',`${root}/final-complete.png`);
writeFileSync(`${root}/native-command.json`,JSON.stringify(args,null,2));
const start=performance.now();
const result=spawnSync('/home/agent/.npm/_npx/f87303d941e257a6/node_modules/.bin/bun',args,{cwd:'/workspace/engine/.claude/worktrees/coop-iteration',encoding:'utf8',timeout:600000,maxBuffer:10000000});
writeFileSync(`${root}/native-gameplay-from-${startIndex}.log`,result.stdout+'\n'+result.stderr);
console.log(JSON.stringify({exit:result.status,elapsedMs:performance.now()-start,error:result.error?.message}));
console.log(result.stdout.slice(-12000));
console.log(result.stderr);
process.exitCode=result.status??1;
