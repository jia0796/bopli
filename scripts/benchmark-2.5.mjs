import {performance} from 'node:perf_hooks';
import {buildSnapshot,snapshotValid} from '../src/lib/settlementBatch.js';
const results=[];
for(const members of [15,1000]) {
  const ids=Array.from({length:members},(_,i)=>'u'+i),activity={id:'a',participantIds:ids};
  const expenses=Array.from({length:1000},(_,i)=>({id:'e'+i,activityId:'a',title:'E',amount:members*(members===15?100:1),paidBy:ids[i%members],allocations:Object.fromEntries(ids.map(id=>[id,members===15?100:1]))}));
  for(let round=1;round<=3;round++) {
    const start=performance.now(),snapshot=buildSnapshot(activity,expenses,[],'s','2026-10-01','u0');
    const snapshotMs=performance.now()-start,check=performance.now();
    if(!snapshotValid({...activity,settlementSnapshot:snapshot},expenses))throw new Error('Invalid fresh snapshot');
    results.push({members,expenses:expenses.length,round,snapshotMs:Math.round(snapshotMs),signatureMs:Math.round(performance.now()-check),snapshotBytes:Buffer.byteLength(JSON.stringify(snapshot))});
  }
}
console.log(JSON.stringify(results,null,2));
