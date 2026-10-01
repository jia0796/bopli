import test from 'node:test';
import assert from 'node:assert/strict';
import { activityFinance, activityStatus } from './activityFinance.js';
import { memberLedger } from './ledger.js';
import { activityDeletionStatus } from './lifecycle.js';
import { calculateBalances, buildSettlementPlan } from './money.js';

const activity={id:'a',groupId:'g',participantIds:['a','b','c']};
const expense={id:'e',activityId:'a',amount:1000,paidBy:'b',allocations:{a:1000,b:0,c:0},participantIds:['a'],splitMode:'equal'};
const repayment=(id,amount,status)=>({id,activityId:'a',fromUid:'a',toUid:'b',amount,status});

test('activity status is global: empty, pending, disputed, outstanding, and settled',()=>{
  assert.equal(activityStatus([],[],{a:0}),'notStarted');
  assert.equal(activityStatus([expense],[],{a:-1000,b:1000,c:0}),'unsettled');
  for(const status of ['pending','disputed'])assert.equal(activityStatus([expense],[repayment('s',1000,status)],{a:0,b:0}),'unsettled');
  assert.equal(activityStatus([expense],[repayment('s',1000,'confirmed')],{a:0,b:0,c:0}),'settled');
  assert.equal(activityStatus([expense],[],{},'invalid ledger'),'unsettled');
});

test('partial pending payment reserves 300, leaving precisely 700 on both sides',()=>{
  const f=activityFinance(activity,[expense],[repayment('s',300,'pending')]);
  assert.deepEqual(f.balances,{a:-1000,b:1000,c:0});
  assert.deepEqual(f.projectedBalances,{a:-700,b:700,c:0});
  assert.equal(f.transfers.reduce((s,t)=>s+t.amount,0),700);
  assert.equal(f.status,'unsettled');
});

test('confirmation order cannot invalidate other pending reservations',()=>{
  const settlements=[repayment('first',300,'pending'),repayment('second',700,'confirmed')];
  assert.deepEqual(calculateBalances(activity.participantIds,[expense],settlements,true),{a:0,b:0,c:0});
  assert.equal(activityFinance(activity,[expense],settlements).status,'unsettled');
  settlements[0].status='confirmed';
  assert.equal(activityFinance(activity,[expense],settlements).status,'settled');
});

test('disputed payments stay reserved until the same payment is resubmitted and confirmed',()=>{
  const s=repayment('s',300,'disputed');
  assert.equal(activityFinance(activity,[expense],[s]).projectedBalances.a,-700);
  s.status='pending';
  assert.equal(activityFinance(activity,[expense],[s]).projectedBalances.a,-700);
  s.status='confirmed';
  const f=activityFinance(activity,[expense],[s]);
  assert.equal(f.balances.a,-700);
  assert.equal(f.projectedBalances.a,-700);
});

test('reserved and confirmed payments together cannot exceed the actual debt',()=>{
  for(const status of ['pending','disputed'])assert.throws(()=>activityFinance(activity,[expense],[repayment('s1',700,'confirmed'),repayment('s2',301,status)]),/超過/);
});

test('consumed manual route keeps its exact remaining amount across confirmation',()=>{
  const a={...activity,settlementManualTransfers:[{id:'m',fromUid:'a',toUid:'b',amount:100}]};
  for(const status of ['pending','confirmed']){
    const f=activityFinance(a,[expense],[repayment('s',300,status)]);
    assert.equal(f.transfers.find((t)=>t.source==='manual').amount,100);
    assert.equal(f.transfers.reduce((s,t)=>s+t.amount,0),700);
    assert.deepEqual(f.transfers,activityFinance(a,[expense],[repayment('s',300,status)]).transfers);
  }
});

test('locked tail adjustment is applied before validating repayments and deletion',()=>{
  const a={...activity,roundingLockedAt:'2026-10-01',roundingConfig:{mode:'assigned',tailUids:['c']}};
  const e={...expense,amount:100,paidBy:'b',participantIds:['a','b','c'],allocations:{a:34,b:33,c:33}};
  const settlements=[repayment('s1',33,'confirmed'),{...repayment('s2',34,'confirmed'),fromUid:'c'}];
  const f=activityFinance(a,[e],settlements);
  assert.deepEqual(f.balances,{a:0,b:0,c:0});
  assert.equal(f.status,'settled');
  const ledgers=memberLedger(a.participantIds,[e],settlements,f);
  assert.equal(ledgers.c.share,34);
  assert.equal(ledgers.c.balance,0);
  assert.equal(activityDeletionStatus({ownerUid:'b'},a,{expenses:[e],settlements},'b').allowed,true);
});

test('historical member ledger keeps advanced, share, and balance after leaving',()=>{
  const ledgers=memberLedger(['b'],[expense],[]);
  assert.equal(ledgers.a.share,1000);
  assert.equal(ledgers.a.balance,-1000);
  assert.equal(ledgers.b.advanced,1000);
});

test('manual and automatic transfers remain stable, direct, and precisely balanced',()=>{
  const balances={a:-400,b:-600,c:700,d:300};
  const manual=[{id:'m',fromUid:'b',toUid:'d',amount:200}];
  const plan=buildSettlementPlan(balances,manual);
  const leftover={...balances};
  for(const t of plan.transfers){
    assert.ok(balances[t.fromUid]<0&&balances[t.toUid]>0);
    leftover[t.fromUid]+=t.amount;leftover[t.toUid]-=t.amount;
  }
  assert.ok(Object.values(leftover).every(n=>n===0));
  assert.deepEqual(plan,buildSettlementPlan({d:300,c:700,b:-600,a:-400},manual));
});

test('edit history describes changed payment and allocation even when title and total stay fixed',async()=>{
  const {describeExpenseChanges}=await import('./expenseHistory.js');
  const before={title:'晚餐',amount:100,paidBy:'b',allocations:{a:50,b:50},splitMode:'equal'};
  const after={...before,paidBy:'a',allocations:{a:40,b:60},splitMode:'custom',customAmounts:{a:40,b:60}};
  const changes=describeExpenseChanges(before,after,id=>id.toUpperCase());
  assert.ok(changes.some(s=>s.includes('A 付款')));
  assert.ok(changes.some(s=>s.includes('B 分攤')&&s.includes('50')&&s.includes('60')));
  assert.ok(changes.some(s=>s.includes('分攤方式')));
  assert.ok(changes.every(s=>!s.includes('版')));
});
test('locked rounding preview and member ledger use the same adjusted balance',()=>{
  const a={...activity,roundingLockedAt:'2026-10-01',roundingConfig:{mode:'assigned',tailUids:['c']}};
  const e={...expense,amount:100,paidBy:'b',participantIds:['a','b','c'],allocations:{a:34,b:33,c:33}};
  const f=activityFinance(a,[e],[]);
  assert.deepEqual(f.unroundedBalances,{a:-34,b:67,c:-33});
  const ledgers=memberLedger(a.participantIds,[e],[],f);
  assert.deepEqual(Object.fromEntries(Object.entries(ledgers).map(([id,l])=>[id,l.balance])),f.balances);
});

test('round-up extra credit is included in member ledger and balances',()=>{
  const a={...activity,roundingLockedAt:'2026-10-01',roundingConfig:{mode:'roundUp'}};
  const e={...expense,amount:100,paidBy:'b',participantIds:['a','b','c'],allocations:{a:34,b:33,c:33}};
  const f=activityFinance(a,[e],[]);
  const ledgers=memberLedger(a.participantIds,[e],[],f);
  assert.equal(ledgers.b.roundingCredit,2);
  assert.equal(ledgers.b.balance,68);
  assert.equal(Object.values(ledgers).reduce((sum,l)=>sum+l.balance,0),0);
});
