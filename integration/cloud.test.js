import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, collection, query, where, onSnapshot } from 'firebase/firestore';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { changes } from '../src/lib/cloudProtocol.js';
import { buildSnapshot } from '../src/lib/settlementBatch.js';
const apps=[];
async function client(name) {
  const app=initializeApp({projectId:'demo-bopli',apiKey:'demo-key',appId:'demo-app'},`${name}-${Date.now()}`);apps.push(app);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const {user}=await signInAnonymously(auth);
  const fn=getFunctions(app,'asia-east1');connectFunctionsEmulator(fn,'127.0.0.1',5001);
  const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
  const call=async(name,data={})=>(await httpsCallable(fn,name)(data)).data;
  const profile=await call('syncBootstrap',{name});
  return {db,call,profile,uid:user.uid};
}
const commit=(c,groupId,patch,requestId=crypto.randomUUID())=>c.call('syncCommit',{groupId,patch,requestId});
test('emulators: invite join, two real clients sync, revision conflict, atomic overpay/confirmation and rules',async()=>{
  const a=await client('Alice'),b=await client('Bob'),outsider=await client('Outsider');
  try {
    const gid=crypto.randomUUID(),aid=crypto.randomUUID();
    const group={id:gid,name:'Integration',ownerUid:a.profile.id,deputyUids:[],memberIds:[a.profile.id],nicknames:{[a.profile.id]:'Alice'},editPolicy:'allMembers',allowMemberInvites:false};
    await commit(a,gid,[{kind:'groups',id:gid,before:null,after:group}]);
    const {code}=await a.call('syncInvite',{groupId:gid});
    assert.equal(code.length,20);
    const joined=await b.call('syncJoin',{code,nickname:'Bob'});assert.equal(joined.groupId,gid);
    assert.equal((await b.call('syncJoin',{code,nickname:'Bob'})).groupId,gid);
    await assert.rejects(()=>outsider.call('syncRead',{groupId:gid}),/不是這個群組/);
    const s=(await a.call('syncRead',{groupId:gid})).store;
    assert.equal(s.users[b.profile.id].authUid,b.uid);
    assert.notEqual(a.profile.id,a.uid);
    const activity={id:aid,groupId:gid,title:'Dinner',participantIds:[a.profile.id,b.profile.id]};
    await commit(a,gid,[{kind:'activities',id:aid,before:null,after:activity}]);
    const current=(await a.call('syncRead',{groupId:gid})).store;
    const expense={id:crypto.randomUUID(),activityId:aid,title:'Meal',amount:100,paidBy:a.profile.id,participantIds:activity.participantIds,allocations:{[a.profile.id]:50,[b.profile.id]:50},createdBy:a.profile.id,createdAt:new Date().toISOString(),revision:1};
    const received=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('listener did not receive update')),12000);
      const stop=onSnapshot(query(collection(b.db,'groups'),where('readerAuthUids','array-contains',b.uid)),snap=>{
        if(snap.docs.some(d=>d.id===gid&&d.data().epoch>=4)){clearTimeout(timer);stop();resolve();}
      },reject);
    });
    await commit(a,gid,[{kind:'expenses',id:expense.id,before:null,after:expense}]);await received;
    assert.equal((await b.call('syncRead',{groupId:gid})).store.expenses[0].title,'Meal');
    const state=(await a.call('syncRead',{groupId:gid})).store;
    const revised={...state.expenses[0],title:'Updated',revision:2};
    const patch=[{kind:'expenses',id:expense.id,before:state.expenses[0],after:revised}];
    const rivals=await Promise.allSettled([commit(a,gid,patch),commit(b,gid,patch)]);
    assert.equal(rivals.filter(r=>r.status==='fulfilled').length,1);
    assert.match(rivals.find(r=>r.status==='rejected').reason.message,/這筆支出已被其他成員更新，請重新確認/);
    const settled=(await a.call('syncRead',{groupId:gid})).store;
    const act=settled.activities[0];const snapshot=buildSnapshot(act,settled.expenses,[],crypto.randomUUID(),new Date().toISOString(),a.profile.id);
    await commit(a,gid,[{kind:'activities',id:aid,before:act,after:{...act,settlementSnapshot:snapshot,settlementSnapshots:[snapshot]}}]);
    const payment=(id,amount)=>({kind:'settlements',id,before:null,after:{id,activityId:aid,fromUid:b.profile.id,toUid:a.profile.id,amount,status:'pending',createdBy:b.profile.id,createdAt:new Date().toISOString(),snapshotId:snapshot.id,manualPlanConsumption:[]}});
    const payments=await Promise.allSettled([commit(b,gid,[payment(crypto.randomUUID(),40)]),commit(b,gid,[payment(crypto.randomUUID(),40)])]);
    assert.equal(payments.filter(r=>r.status==='fulfilled').length,1);
    const paid=(await a.call('syncRead',{groupId:gid})).store;
    assert.equal(paid.settlements.length,1);
    const repayment=paid.settlements[0];assert.ok(repayment.accountingBasis.length);
    const confirm=[{kind:'settlements',id:repayment.id,before:repayment,after:{...repayment,status:'confirmed'}}];
    const confirmations=await Promise.allSettled([commit(a,gid,confirm),commit(a,gid,confirm)]);
    assert.equal(confirmations.filter(r=>r.status==='fulfilled').length,1);
    const finalPayment=payment(crypto.randomUUID(),10);
    await commit(b,gid,[finalPayment]);
    const finalPending=(await a.call('syncRead',{groupId:gid})).store.settlements.find(s=>s.id===finalPayment.id);
    await commit(a,gid,[{kind:'settlements',id:finalPending.id,before:finalPending,after:{...finalPending,status:'confirmed'}}]);
    const clear=(await a.call('syncRead',{groupId:gid})).store;
    await commit(a,gid,changes(clear,{...clear,activities:[],expenses:[],settlements:[]}));
    assert.equal((await a.call('syncRead',{groupId:gid})).store.settlements.length,0);
    const historical=await getDoc(doc(a.db,`groups/${gid}/repayments/${repayment.id}`));
    assert.equal(historical.data().status,'confirmed');assert.ok(historical.data().deletedAt);
    const env=await initializeTestEnvironment({projectId:'demo-bopli',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}});
    try {
      const member=env.authenticatedContext(a.uid).firestore();const stranger=env.authenticatedContext(outsider.uid).firestore();
      await assertSucceeds(getDoc(doc(member,`groups/${gid}/expenses/${expense.id}`)));
      await assertFails(getDoc(doc(stranger,`groups/${gid}/expenses/${expense.id}`)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),`groups/${gid}`)));
      for(const collectionName of ['members','expenses','repayments','activities','settlementSnapshots'])await assertFails(setDoc(doc(member,`groups/${gid}/${collectionName}/forged`),{id:'forged',authUid:a.uid,amount:999999}));
      await assertFails(setDoc(doc(member,`identities/${a.uid}`),{id:b.profile.id}));
      await assertFails(getDoc(doc(member,'invites/forged')));
    } finally {await env.cleanup();}
  } finally {await Promise.all(apps.map(deleteApp));}
});
