import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresHarness } from './postgresHarness.js';
import { changes } from '../src/lib/cloudProtocol.js';
import { buildSnapshot, accountingSignature } from '../src/lib/settlementBatch.js';
import { edgeHandler } from '../server/edgeHandler.js';

test('PostgreSQL atomic commits: invites, rival revisions, overpay, double confirmation, tombstones and RLS',async()=>{
  const h=await postgresHarness();
  const uid=crypto.randomUUID(),bid=crypto.randomUUID(),oid=crypto.randomUUID();
  const call=(u,name,data={})=>h.service[name](u,data);
  const commit=(u,gid,patch,requestId=crypto.randomUUID())=>call(u,'syncCommit',{groupId:gid,patch,requestId});
  try {
    const a=await call(uid,'syncBootstrap',{name:'Alice'}),b=await call(bid,'syncBootstrap',{name:'Bob'});
    await call(oid,'syncBootstrap',{name:'Outsider'});
    assert.notEqual(a.id,uid);
    const gid=crypto.randomUUID(),aid=crypto.randomUUID();
    const group={id:gid,name:'SQL',ownerUid:a.id,deputyUids:[],memberIds:[a.id],nicknames:{[a.id]:'Alice'},editPolicy:'allMembers',allowMemberInvites:false};
    await commit(uid,gid,[{kind:'groups',id:gid,before:null,after:group}]);
    const {code}=await call(uid,'syncInvite',{groupId:gid});
    assert.equal(code.length,20);
    const invalid=await call(bid,'syncJoin',{code:'F'.repeat(20),nickname:'Bob'});assert.ok(invalid.error);
    await call(bid,'syncJoin',{code,nickname:'Bob'});
    assert.equal((await call(bid,'syncJoin',{code,nickname:'Bob'})).groupId,gid);
    await assert.rejects(()=>call(oid,'syncRead',{groupId:gid}),/不是這個群組/);
    const activity={id:aid,groupId:gid,title:'Dinner',participantIds:[a.id,b.id]};
    await commit(uid,gid,[{kind:'activities',id:aid,before:null,after:activity}]);
    const expense={id:crypto.randomUUID(),activityId:aid,title:'Meal',amount:100,paidBy:a.id,participantIds:[a.id,b.id],allocations:{[a.id]:50,[b.id]:50},createdBy:a.id,revision:1};
    const receipt=crypto.randomUUID(),first=[{kind:'expenses',id:expense.id,before:null,after:expense}];
    await commit(uid,gid,first,receipt);
    await commit(uid,gid,first,receipt); // repeated request is idempotent
    const initial=(await call(bid,'syncRead',{groupId:gid})).store;
    assert.equal(initial.expenses.length,1);
    const patch=[{kind:'expenses',id:expense.id,before:initial.expenses[0],after:{...initial.expenses[0],title:'Winner',revision:2}}];
    const rival=await Promise.allSettled([commit(uid,gid,patch),commit(bid,gid,patch)]);
    assert.equal(rival.filter(r=>r.status==='fulfilled').length,1);
    assert.match(rival.find(r=>r.status==='rejected').reason.message,/這筆支出已被其他成員更新，請重新確認/);
    const current=(await call(uid,'syncRead',{groupId:gid})).store;
    const act=current.activities[0],snapshot=buildSnapshot(act,current.expenses,[],crypto.randomUUID(),'now',a.id);
    await commit(uid,gid,[{kind:'activities',id:aid,before:act,after:{...act,settlementSnapshot:snapshot,settlementSnapshots:[snapshot]}}]);
    const payment=amount=>{const id=crypto.randomUUID();return {kind:'settlements',id,before:null,after:{id,activityId:aid,fromUid:b.id,toUid:a.id,amount,status:'pending',createdBy:b.id,snapshotId:snapshot.id,manualPlanConsumption:[]}};};
    const paid=await Promise.allSettled([commit(bid,gid,[payment(40)]),commit(bid,gid,[payment(40)])]);
    assert.equal(paid.filter(r=>r.status==='fulfilled').length,1);
    assert.match(paid.find(r=>r.status==='rejected').reason.message,/付款金額超過/);
    const repayment=(await call(uid,'syncRead',{groupId:gid})).store.settlements[0];
    const confirm=[{kind:'settlements',id:repayment.id,before:repayment,after:{...repayment,status:'confirmed'}}];
    await assert.rejects(()=>commit(bid,gid,confirm),/權限/);
    const confirmed=await Promise.allSettled([commit(uid,gid,confirm),commit(uid,gid,confirm)]);
    assert.equal(confirmed.filter(r=>r.status==='fulfilled').length,1);
    const last=payment(10);await commit(bid,gid,[last]);
    const lastSaved=(await call(uid,'syncRead',{groupId:gid})).store.settlements.find(s=>s.id===last.id);
    await commit(uid,gid,[{kind:'settlements',id:last.id,before:lastSaved,after:{...lastSaved,status:'confirmed'}}]);
    const clear=(await call(uid,'syncRead',{groupId:gid})).store;
    await commit(uid,gid,changes(clear,{...clear,activities:[],expenses:[],settlements:[]}));
    const historical=await h.pg.query('select data from public.bopli_documents where path=$1',[`groups/${gid}/repayments/${repayment.id}`]);
    assert.equal(historical.rows[0].data.status,'confirmed');assert.ok(historical.rows[0].data.deletedAt);
    // An ordinary payer consumes a manual route in the SAME SQL transaction.
    const aid2=crypto.randomUUID(),act2={...activity,id:aid2};
    await commit(uid,gid,[{kind:'activities',id:aid2,before:null,after:act2}]);
    const expense2={...expense,id:crypto.randomUUID(),activityId:aid2};
    await commit(uid,gid,[{kind:'expenses',id:expense2.id,before:null,after:expense2}]);
    let manual=(await call(uid,'syncRead',{groupId:gid})).store;
    const oldAct=manual.activities[0],routed={...oldAct,settlementManualTransfers:[{id:'route',fromUid:b.id,toUid:a.id,amount:50}]};
    const snap2=buildSnapshot(routed,manual.expenses,[],crypto.randomUUID(),'now',a.id);
    await commit(uid,gid,[{kind:'activities',id:aid2,before:oldAct,after:{...routed,settlementSnapshot:snap2,settlementSnapshots:[snap2]}}]);
    manual=(await call(uid,'syncRead',{groupId:gid})).store;
    const base=manual.activities[0],reduced={...base,settlementManualTransfers:[{...base.settlementManualTransfers[0],amount:10}]};
    reduced.settlementSnapshot={...base.settlementSnapshot,signature:accountingSignature(reduced,manual.expenses)};
    const mid=crypto.randomUUID(),payment2={id:mid,activityId:aid2,fromUid:b.id,toUid:a.id,amount:40,status:'pending',createdBy:b.id,snapshotId:snap2.id,manualPlanConsumption:[{id:'route',amount:40}]};
    const manualPatch=[{kind:'activities',id:aid2,before:base,after:reduced},{kind:'settlements',id:mid,before:null,after:payment2}];
    const manualRace=await Promise.allSettled([commit(bid,gid,manualPatch),commit(bid,gid,manualPatch)]);
    assert.equal(manualRace.filter(r=>r.status==='fulfilled').length,1,manualRace.filter(r=>r.status==='rejected').map(r=>r.reason.message).join('; '));
    manual=(await call(uid,'syncRead',{groupId:gid})).store;
    assert.equal(manual.activities[0].settlementManualTransfers[0].amount,10);
    assert.equal(manual.settlements[0].amount,40);
    // Snapshot invalidation never strands an already existing repayment.
    await commit(uid,gid,[{kind:'activities',id:aid2,before:manual.activities[0],after:{...manual.activities[0],settlementSnapshot:null}}]);
    let row=manual.settlements[0];
    await commit(uid,gid,[{kind:'settlements',id:mid,before:row,after:{...row,status:'disputed'}}]);
    row=(await call(uid,'syncRead',{groupId:gid})).store.settlements[0];
    await commit(bid,gid,[{kind:'settlements',id:mid,before:row,after:{...row,status:'pending'}}]);
    row=(await call(uid,'syncRead',{groupId:gid})).store.settlements[0];
    await commit(uid,gid,[{kind:'settlements',id:mid,before:row,after:{...row,status:'confirmed'}}]);
    assert.equal((await call(uid,'syncRead',{groupId:gid})).store.settlements[0].status,'confirmed');
    const visible=await h.asUser(uid,'select path from public.bopli_documents');
    assert.deepEqual(visible.rows.map(r=>r.path),[`groups/${gid}`]);
    assert.equal((await h.asUser(oid,'select path from public.bopli_documents')).rows.length,0);
    for(const sql of ["insert into public.bopli_documents(path,data) values('forged','{}')",'select public.bopli_commit(0,\'[]\')','select public.bopli_read(null,null)','select * from public.bopli_revision'])await assert.rejects(()=>h.asUser(uid,sql),/permission denied/);
    // A SQL error after an earlier write rolls back the WHOLE transaction.
    const begin=(await h.admin.rpc('bopli_read',{p_path:null,p_collection:null})).data;
    const failed=await h.admin.rpc('bopli_commit',{p_revision:begin.revision,p_writes:[{path:'test/rollback',mode:'create',data:{}},{path:`groups/${gid}`,mode:'create',data:{}}]});
    assert.ok(failed.error);
    assert.equal((await h.pg.query("select * from public.bopli_documents where path='test/rollback'")).rows.length,0);
  } finally {await h.close();}
});

test('Edge handler rejects missing/forged auth and derives identity from verified token',async()=>{
  let seen;
  const handler=edgeHandler({syncRead:async uid=>{seen=uid;return {ok:true};}},async token=>token==='valid'?{id:'verified'}:null);
  const req=token=>new Request('http://localhost',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify({name:'syncRead',data:{uid:'forged'}})});
  assert.equal((await handler(req())).status,401);
  assert.equal((await handler(req('forged'))).status,401);
  assert.equal((await handler(req('valid'))).status,200);assert.equal(seen,'verified');
});
