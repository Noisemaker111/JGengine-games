export function observe(){
 const el=document.getElementById('root');
 const key=Object.keys(el).find(k=>k.startsWith('__reactContainer$'));
 const stack=[el[key]?.stateNode?.current??el[key]];let ctx;
 for(let n=0;stack.length&&n<5000;n++){
  const f=stack.pop();if(!f)continue;
  for(const value of [f.memoizedProps?.value,f.memoizedProps?.context,f.memoizedProps?.ctx])if(value?.scene?.entity&&value?.game?.store){ctx=value;break;}
  if(ctx)break;stack.push(f.child,f.sibling);
 }
 if(!ctx)return {observerError:'GameProvider context not found'};
 const drivingId=ctx.game.store.get('harbor.driving')??null;
 const session=ctx.game.store.get('runSession')?.snapshot();
 return {player:ctx.scene.entity.get(ctx.player.userId),drivingId,vehicle:drivingId?ctx.scene.entity.get(drivingId):null,courier:ctx.game.store.get('harbor.courier'),race:ctx.game.store.get('harbor.race'),session:ctx.game.store.get('harbor.session'),run:session?{...session,clearedGateIds:[...session.clearedGateIds],collectedIds:[...session.collectedIds]}:undefined,vehicles:ctx.scene.entity.list().filter(e=>e.id.startsWith('traffic')||e.id.startsWith('car')||e.name.includes('car')).map(e=>({id:e.id,name:e.name,position:e.position,rotationY:e.rotationY}))};
}
