import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCloudChanges, changes, CONFLICT } from './cloudProtocol.js';
import { buildSnapshot, accountingSignature } from './settlementBatch.js';
export function fixture() {
  const group={id:'g',name:'Friends',ownerUid:'a',deputyUids:[],memberIds:['a','b','c','d'],nicknames:{a:'A',b:'B',c:'C',d:'D'},editPolicy:'allMembers',allowMemberInvites:true};
  const activity={id:'act',groupId:'g',title:'Dinner',participantIds:['a','b','c','d']};
  const expense={id:'e',activityId:'act',title:'Dinner',amount:100,paidBy:'a',participantIds:['a','b'],allocations:{a:50,b:50},createdBy:'a',createdAt:'2026-10-01',revision:1};
  return {version:26,users:{a:{id:'a'},b:{id:'b'},c:{id:'c'},d:{id:'d'}},groups:[group],activities:[activity],expenses:[expense],settlements:[],drafts:[]};
}
const edit=(s,amount)=>{const n=structuredClone(s);n.expenses[0]={...n.expenses[0],amount,allocations:{a:amount/2,b:amount/2},revision:2};return changes(s,n);};
const settled=()=>{const s=fixture();s.activities[0].settlementSnapshot=buildSnapshot(s.activities[0],s.expenses,[],'snap','now','a');s.activities[0].settlementSnapshots=[s.activities[0].settlementSnapshot];return s;};
const pay=(s,id,amount)=>{const n=structuredClone(s);n.settlements.push({id,activityId:'act',fromUid:'b',toUid:'a',amount,status:'pending',createdBy:'b',snapshotId:'snap',accountingBasis:[],manualPlanConsumption:[],createdAt:'now'});return changes(s,n);};
test('first expense revision wins; later editor conflicts',()=>{
  const s=fixture(),p=edit(s,120),q=edit(s,140);
  const saved=applyCloudChanges(s,p,'a');
  assert.equal(saved.expenses[0].amount,120);
  assert.throws(()=>applyCloudChanges(saved,q,'b'),new RegExp(CONFLICT));
});
test('transaction revalidation reserves pending/disputed and prevents concurrent overpay',()=>{
  const s=settled(),p=pay(s,'p',40),q=pay(s,'q',40);
  const saved=applyCloudChanges(s,p,'b');
  assert.throws(()=>applyCloudChanges(saved,q,'b'),/付款金額超過/);
  const n=structuredClone(saved);n.settlements[0].status='disputed';
  const disputed=applyCloudChanges(saved,changes(saved,n),'a');
  assert.throws(()=>applyCloudChanges(disputed,pay(disputed,'q',40),'b'),/付款金額超過/);
});
test('only recipient confirms once; dirty snapshot still permits existing confirmation',()=>{
  const s=applyCloudChanges(settled(),pay(settled(),'p',40),'b');
  s.activities[0].settlementSnapshot=null;
  const n=structuredClone(s);n.settlements[0].status='confirmed';
  const p=changes(s,n);
  assert.throws(()=>applyCloudChanges(s,p,'b'),/權限/);
  const confirmed=applyCloudChanges(s,p,'a');
  assert.throws(()=>applyCloudChanges(confirmed,p,'a'),/資料已更新/);
});
test('related expense locked; unrelated expense mutation revalidates historical debts',()=>{
  const s=applyCloudChanges(settled(),pay(settled(),'p',40),'b');
  assert.throws(()=>applyCloudChanges(s,edit(s,120),'a'),/還款保護/);
  const n=structuredClone(s);n.expenses.push({id:'other',activityId:'act',title:'Other',amount:100,paidBy:'c',participantIds:['c','d'],allocations:{c:50,d:50},createdBy:'c',revision:1});
  const saved=applyCloudChanges(s,changes(s,n),'c');
  assert.equal(saved.expenses.length,2);
  assert.equal(saved.settlements.length,1);
});
test('reject identity forgery, snapshot forgery and membership injection',()=>{
  const s=fixture(),n=structuredClone(s);n.groups[0].memberIds.push('hacker');
  assert.throws(()=>applyCloudChanges(s,changes(s,n),'a'),/邀請碼/);
  const q=structuredClone(s);q.activities[0].settlementSnapshot={id:'x',signature:'fake'};
  assert.throws(()=>applyCloudChanges(s,changes(s,q),'a'),/快照/);
  const p=pay(settled(),'p',10);p[0].after.fromUid='a';
  assert.throws(()=>applyCloudChanges(settled(),p,'b'),/只能記錄自己的/);
});
test('owner can remove a fully settled activity while server retains tombstoned history',()=>{
  let s=applyCloudChanges(settled(),pay(settled(),'p',50),'b');
  const n=structuredClone(s);n.settlements[0].status='confirmed';s=applyCloudChanges(s,changes(s,n),'a');
  const removed={...s,activities:[],expenses:[],settlements:[]};
  assert.equal(applyCloudChanges(s,changes(s,removed),'a').activities.length,0);
  assert.throws(()=>applyCloudChanges(s,changes(s,removed),'b'),/權限/);
});
test('ordinary payer atomically consumes manual route and can cancel own pending payment',()=>{
  const s=fixture();s.activities[0].settlementManualTransfers=[{id:'route',fromUid:'b',toUid:'a',amount:30}];
  const snap=buildSnapshot(s.activities[0],s.expenses,[],'snap','now','a');
  Object.assign(s.activities[0],{settlementSnapshot:snap,settlementSnapshots:[snap]});
  const n=structuredClone(s);n.settlements.push(pay(s,'p',40)[0].after);n.settlements[0].manualPlanConsumption=[{id:'route',amount:30}];
  n.activities[0].settlementManualTransfers=[];n.activities[0].settlementSnapshot={...snap,signature:accountingSignature(n.activities[0],n.expenses)};
  const saved=applyCloudChanges(s,changes(s,n),'b');
  assert.deepEqual(saved.activities[0].settlementManualTransfers,[]);
  const cancelled=structuredClone(saved);cancelled.activities[0].settlementSnapshot=null;cancelled.settlements[0].status='cancelled';
  assert.equal(applyCloudChanges(saved,changes(saved,cancelled),'b').settlements[0].status,'cancelled');
});
