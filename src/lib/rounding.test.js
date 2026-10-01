import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqualRotating } from './money.js';
import { balanceActivityAllocations, balanceStoreAllocations } from './allocationBalance.js';
import { buildRoundingModel, applyRoundingToBalances } from './rounding.js';

test('平均分攤尾差可依 offset 輪流 +1', () => {
  const ids=['A','B','C'];
  assert.deepEqual(splitEqualRotating(100,ids,0),{A:34,B:33,C:33});
  assert.deepEqual(splitEqualRotating(100,ids,1),{A:33,B:34,C:33});
  assert.deepEqual(splitEqualRotating(100,ids,2),{A:33,B:33,C:34});
});

test('完整結算可重新指定必要尾差承擔者，總額仍平衡', () => {
  const ids=['A','B','C'];
  const expense={amount:976,splitMode:'equal',participantIds:ids,allocations:{A:326,B:325,C:325}};
  const model=buildRoundingModel(ids,[expense]);
  assert.equal(model.requiredTailUnits,1);
  const base={A:-326,B:-325,C:651};
  const result=applyRoundingToBalances(base,model,{mode:'assigned',tailUids:['B']});
  assert.equal(Object.values(result.balances).reduce((s,n)=>s+n,0),0);
  assert.equal(result.balances.A,-325);
  assert.equal(result.balances.B,-326);
});

test('全員向上補齊的多出金額平均分給仍應收者', () => {
  const ids=['A','B','C'];
  const expense={amount:976,splitMode:'equal',participantIds:ids,allocations:{A:326,B:325,C:325}};
  const model=buildRoundingModel(ids,[expense]);
  const base={A:-326,B:-325,C:651};
  const result=applyRoundingToBalances(base,model,{mode:'roundUp',receiverMode:'selected',receiverUids:['C'],receiverOrder:['C']});
  assert.equal(result.extraPool,2);
  assert.equal(result.poolAllocations.C,2);
  assert.equal(Object.values(result.balances).reduce((s,n)=>s+n,0),0);
});

test('round-up ceils the cumulative original share, never each expense or net balance', () => {
  const ids=['A','B','C'];
  const expenses=Array.from({length:3},()=>({amount:100,paidBy:'C',splitMode:'equal',participantIds:ids,allocations:{A:34,B:33,C:33}}));
  const model=buildRoundingModel(ids,expenses);
  const result=applyRoundingToBalances({A:-102,B:-99,C:201},model,{mode:'roundUp',receiverMode:'selected',receiverUids:['C']});
  assert.deepEqual(result.shares,{A:100,B:100,C:100});
  assert.equal(result.extraPool,0);
  assert.deepEqual(result.poolAllocations,{});
  assert.deepEqual(result.balances,{A:-100,B:-100,C:200});
  assert.equal(result.error,'');
  // Net changes use allocation changes and credits once.
  assert.equal(result.balances.C-201,(result.poolAllocations.C||0)-(result.shares.C-model.currentShare.C));
});

test('fixed allocations and rows involving exited members remain unchanged', () => {
  const lines=[
    {amount:100,splitMode:'equal',participantIds:['A','B','C'],allocations:{A:34,B:33,C:33}},
    {amount:100,splitMode:'equal',participantIds:['A','B','C'],allocations:{A:34,B:33,C:33}},
    {amount:10,splitMode:'custom',participantIds:['A','B'],allocations:{A:7,B:3}},
  ];
  const model=buildRoundingModel(['A','C'],[{amount:210,lines,allocations:{A:75,B:69,C:66}}]);
  const result=applyRoundingToBalances({A:-75,B:-69,C:144},model,{mode:'roundUp'});
  assert.deepEqual(result.shares,{A:75,C:66});
  assert.equal(result.balances.B,-69);
  assert.equal(result.extraPool,0);
  assert.deepEqual(result.poolAllocations,{});
  assert.equal(result.error,'');
});

test('round-up pool equals allocation increases and distributed credits across rotating splits', () => {
  for(let count=2;count<=15;count++) {
    const ids=Array.from({length:count},(_,i)=>String(i));
    const expenses=balanceActivityAllocations(ids,Array.from({length:20},(_,i)=>({amount:100+i,splitMode:'equal',participantIds:ids,allocations:splitEqualRotating(100+i,ids,i)})));
    const model=buildRoundingModel(ids,expenses);
    const base=Object.fromEntries(ids.map(id=>[id,-model.currentShare[id]]));
    base['0']+=expenses.reduce((sum,e)=>sum+e.amount,0);
    const result=applyRoundingToBalances(base,model,{mode:'roundUp'});
    assert.equal(result.error,'');
    for(const id of ids) {
      assert.equal(result.shares[id],Math.ceil(expenses.reduce((sum,e)=>sum+e.amount,0)/count));
      assert.ok(result.shares[id]>=model.currentShare[id]);
      assert.equal(result.balances[id]-base[id],(result.poolAllocations[id]||0)-(result.shares[id]-model.currentShare[id]));
    }
    assert.equal(result.extraPool,Object.values(result.shares).reduce((sum,n)=>sum+n,0)-model.originalTotal);
    assert.equal(result.extraPool,Object.values(result.poolAllocations).reduce((sum,n)=>sum+n,0));
    assert.equal(Object.values(result.balances).reduce((sum,n)=>sum+n,0),0);
  }
});

test('4000 plus 2000 across 15 people backfills each expense to exactly 400 per person',()=>{
  const ids=Array.from({length:15},(_,i)=>'u'+i);
  const expenses=[4000,2000].map((amount,i)=>({id:'e'+i,amount,splitMode:'equal',participantIds:ids,allocations:splitEqualRotating(amount,ids,i)}));
  const original=structuredClone(expenses);
  const balanced=balanceActivityAllocations(ids,expenses);
  for(const id of ids)assert.equal(balanced.reduce((sum,e)=>sum+e.allocations[id],0),400);
  balanced.forEach(e=>{
    assert.equal(Object.values(e.allocations).reduce((sum,n)=>sum+n,0),e.amount);
    for(const id of ids)assert.ok([Math.floor(e.amount/15),Math.ceil(e.amount/15)].includes(e.allocations[id]));
  });
  assert.deepEqual(expenses,original);
  assert.deepEqual(balanceActivityAllocations(ids,balanced),balanced);
  const model=buildRoundingModel(ids,balanced);
  const base=Object.fromEntries(ids.map(id=>[id,-400]));base.u0+=6000;
  const rounded=applyRoundingToBalances(base,model,{mode:'roundUp'});
  assert.equal(rounded.extraPool,0);
  assert.deepEqual(rounded.balances,base);
});

test('400.8 cumulative share gives twelve 401 and three 400; round-up gives all 401',()=>{
  const ids=Array.from({length:15},(_,i)=>'u'+i);
  const expenses=balanceActivityAllocations(ids,[4000,2012].map((amount,i)=>({amount,splitMode:'equal',participantIds:ids,allocations:splitEqualRotating(amount,ids,i)})));
  const model=buildRoundingModel(ids,expenses);
  assert.equal(Object.values(model.currentShare).filter(n=>n===401).length,12);
  assert.equal(Object.values(model.currentShare).filter(n=>n===400).length,3);
  const base=Object.fromEntries(ids.map(id=>[id,-model.currentShare[id]]));base.u0+=6012;
  const result=applyRoundingToBalances(base,model,{mode:'roundUp'});
  assert.ok(Object.values(result.shares).every(n=>n===401));
  assert.equal(result.extraPool,3);
  assert.equal(Object.values(result.poolAllocations).reduce((sum,n)=>sum+n,0),3);
  assert.equal(Object.values(result.balances).reduce((sum,n)=>sum+n,0),0);
});

test('overlapping groups balance cumulative shares while each expense and custom share stay intact',()=>{
  const ids=['a','b','c','d'];
  const source=[
    {amount:101,splitMode:'equal',participantIds:['a','b','c'],allocations:{a:34,b:34,c:33}},
    {amount:101,splitMode:'equal',participantIds:['b','c','d'],allocations:{b:34,c:34,d:33}},
    {amount:10,splitMode:'equal',participantIds:['a','d'],allocations:{a:5,d:5}},
    {amount:9,splitMode:'custom',participantIds:['a','c'],allocations:{a:8,c:1}},
  ];
  const balanced=balanceActivityAllocations(ids,source);
  const exact={a:101/3+5+8,b:202/3,c:202/3+1,d:101/3+5};
  for(const id of ids){const sum=balanced.reduce((s,e)=>s+(e.allocations[id]||0),0);assert.ok(sum===Math.floor(exact[id])||sum===Math.ceil(exact[id]));}
  balanced.forEach(e=>assert.equal(Object.values(e.allocations).reduce((s,n)=>s+n,0),e.amount));
  assert.equal(balanced[3],source[3]);
});

test('backfilled shopping allocations agree with line sums and frozen repayment history is untouched',()=>{
  const ids=['a','b','c'];
  const lines=Array.from({length:3},()=>({amount:100,splitMode:'equal',participantIds:ids,allocations:{a:34,b:33,c:33}}));
  const expense={id:'e',activityId:'x',amount:300,lines,allocations:{a:102,b:99,c:99}};
  const source={activities:[{id:'x',participantIds:ids}],expenses:[expense],settlements:[]};
  const balanced=balanceStoreAllocations(source);
  assert.deepEqual(balanced.expenses[0].allocations,{a:100,b:100,c:100});
  for(const id of ids)assert.equal(balanced.expenses[0].lines.reduce((sum,l)=>sum+l.allocations[id],0),100);
  for(const status of ['pending','confirmed','disputed']) {
    const frozen={...source,settlements:[{activityId:'x',status}]};
    assert.equal(balanceStoreAllocations(frozen),frozen);
  }
  const locked={...source,activities:[{...source.activities[0],roundingLockedAt:'now'}]};
  assert.equal(balanceStoreAllocations(locked),locked);
  assert.equal(balanceActivityAllocations(['a','c'],[expense])[0],expense);
});

test('varying overlapping equal splits preserve every row and cumulative floor/ceil bounds',()=>{
  const ids=Array.from({length:8},(_,i)=>String(i));
  for(let seed=1;seed<=30;seed++) {
    let value=seed;
    const next=()=>{value=(value*1664525+1013904223)>>>0;return value;};
    const exact=Object.fromEntries(ids.map(id=>[id,0]));
    const source=Array.from({length:20},()=>{
      const participants=ids.filter(()=>next()%3!==0);
      if(!participants.length)participants.push(ids[0]);
      const amount=1+next()%1000;
      participants.forEach(id=>{exact[id]+=amount/participants.length;});
      return {amount,splitMode:'equal',participantIds:participants,allocations:splitEqualRotating(amount,participants,next())};
    });
    const balanced=balanceActivityAllocations(ids,source);
    for(const id of ids){const sum=balanced.reduce((s,e)=>s+(e.allocations[id]||0),0);assert.ok(sum===Math.floor(exact[id]+1e-7)||sum===Math.ceil(exact[id]-1e-7));}
    balanced.forEach(e=>assert.equal(Object.values(e.allocations).reduce((s,n)=>s+n,0),e.amount));
    assert.deepEqual(balanceActivityAllocations(ids,balanced),balanced);
  }
});
