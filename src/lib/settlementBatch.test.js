import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSnapshot,snapshotValid,repaymentReferencesExpense,validateHistoricalRepayments,accountingSignature} from './settlementBatch.js';
import {canEditExpense} from './domain.js';
const activity={id:'a',participantIds:['A','B','C','D']};
const expense=(id,payer,debtor,amount)=>({id,activityId:'a',amount,paidBy:payer,createdBy:'A',allocations:{[debtor]:amount},participantIds:[debtor],splitMode:'custom'});
const expenses=[expense('one','B','A',500),expense('two','A','C',300),expense('other','D','C',100)];
const snapshot=()=>buildSnapshot(activity,expenses,[],'snap','now','A');
const repayment=()=>({id:'r',activityId:'a',fromUid:'A',toUid:'B',amount:200,status:'pending',snapshotId:'snap',accountingBasis:snapshot().basis});

test('JSONB field reordering preserves snapshot validity, including legacy JSON signatures',()=>{
 const reverse=x=>Array.isArray(x)?x.map(reverse):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).reverse().map(k=>[k,reverse(x[k])])):x;
 const routed={...activity,settlementManualTransfers:[{id:'route',fromUid:'A',toUid:'B',amount:100}]};
 const snap=buildSnapshot(routed,expenses,[],'snap','now','A');
 const legacy=JSON.stringify(reverse(JSON.parse(snap.signature)));
 const reloaded={...reverse(routed),settlementSnapshot:{...snap,signature:legacy}};
 assert.equal(accountingSignature(reverse(routed),reverse(expenses)),snap.signature);
 assert.equal(snapshotValid(reloaded,reverse(expenses)),true);
 assert.equal(reloaded.settlementSnapshot.signature,legacy); // history untouched
 assert.equal(snapshotValid({...reloaded,settlementSnapshot:{...snap,signature:'not-json'}},expenses),false);
});
test('snapshot stable until expense, name, routes, rounding or members change',()=>{
 const a={...activity,settlementSnapshot:snapshot()};assert.ok(snapshotValid(a,expenses));
 for(const changed of [[...expenses,expense('new','B','C',10)],expenses.slice(1),expenses.map(e=>e.id==='one'?{...e,title:'rename'}:e)])assert.equal(snapshotValid(a,changed),false);
 assert.equal(snapshotValid({...a,settlementManualTransfers:[{id:'m',fromUid:'A',toUid:'B',amount:1}]},expenses),false);
 assert.equal(snapshotValid({...a,roundingLockedAt:'now',roundingConfig:{mode:'assigned'}},expenses),false);
});
test('snapshot without repayments never permanently locks an expense',()=>{
 const group={memberIds:['A','B'],editPolicy:'allMembers'};
 assert.ok(canEditExpense(group,expenses[0],'A',[]));
});
test('A owes B 500 and C owes A 300: both receipts protect A to B 200, unrelated C/D does not',()=>{
 const r=repayment();assert.ok(repaymentReferencesExpense(r,expenses[0]));assert.ok(repaymentReferencesExpense(r,expenses[1]));assert.equal(repaymentReferencesExpense(r,expenses[2]),false);
 const group={memberIds:['A','B','C','D'],editPolicy:'allMembers'};
 assert.equal(canEditExpense(group,expenses[1],'C',[r]),false);assert.ok(canEditExpense(group,expenses[2],'C',[r]));
 assert.ok(buildSnapshot(activity,expenses.slice(0,2),[],'s','now','A').routes.some(t=>t.fromUid==='A'&&t.toUid==='B'&&t.amount===200));
});
test('cancelled source unlocks only if no other active repayment still references it',()=>{
 const group={memberIds:['A'],editPolicy:'allMembers'},r=repayment();
 assert.ok(canEditExpense(group,expenses[0],'A',[{...r,status:'cancelled'}]));
 for(const status of ['pending','confirmed','disputed'])assert.equal(canEditExpense(group,expenses[0],'A',[{...r,status:'cancelled'},{...r,id:'second',status}]),false);
});
test('unrelated edit that starts affecting repayment parties must preserve historical overpay invariants',()=>{
 const store={activities:[activity],expenses,settlements:[repayment()]};assert.equal(validateHistoricalRepayments(store),store);
 // Old C/D receipt is editable, but changing it to A owes D 400 removes A's net debtor capacity.
 const changed={...store,expenses:expenses.map(e=>e.id==='other'?expense('other','A','D',400):e)};
 assert.throws(()=>validateHistoricalRepayments(changed),/還款金額/);
 assert.equal(store.settlements[0].status,'pending');
});
