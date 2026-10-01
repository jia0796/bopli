import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqualRotating } from './money.js';
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

test('round-up ceils each original allocation, never the accumulated share or net balance', () => {
  const ids=['A','B','C'];
  const expenses=Array.from({length:3},()=>({amount:100,paidBy:'C',splitMode:'equal',participantIds:ids,allocations:{A:34,B:33,C:33}}));
  const model=buildRoundingModel(ids,expenses);
  const result=applyRoundingToBalances({A:-102,B:-99,C:201},model,{mode:'roundUp',receiverMode:'selected',receiverUids:['C']});
  assert.deepEqual(result.shares,{A:102,B:102,C:102});
  assert.equal(result.extraPool,6);
  assert.deepEqual(result.poolAllocations,{C:6});
  assert.deepEqual(result.balances,{A:-102,B:-102,C:204});
  assert.equal(result.error,'');
  // The recipient also pays its own allocation increment: credit 6 minus share 3.
  assert.equal(result.balances.C-201,result.poolAllocations.C-(result.shares.C-model.currentShare.C));
});

test('shopping lines round separately; fixed allocations and exited members remain unchanged', () => {
  const lines=[
    {amount:100,splitMode:'equal',participantIds:['A','B','C'],allocations:{A:34,B:33,C:33}},
    {amount:100,splitMode:'equal',participantIds:['A','B','C'],allocations:{A:34,B:33,C:33}},
    {amount:10,splitMode:'custom',participantIds:['A','B'],allocations:{A:7,B:3}},
  ];
  const model=buildRoundingModel(['A','C'],[{amount:210,lines,allocations:{A:75,B:69,C:66}}]);
  const result=applyRoundingToBalances({A:-75,B:-69,C:144},model,{mode:'roundUp'});
  assert.deepEqual(result.shares,{A:75,C:68});
  assert.equal(result.balances.B,-69);
  assert.equal(result.extraPool,2);
  assert.equal(result.poolAllocations.C,2);
  assert.equal(result.error,'');
});

test('round-up pool equals allocation increases and distributed credits across rotating splits', () => {
  for(let count=2;count<=15;count++) {
    const ids=Array.from({length:count},(_,i)=>String(i));
    const expenses=Array.from({length:20},(_,i)=>({amount:100+i,splitMode:'equal',participantIds:ids,allocations:splitEqualRotating(100+i,ids,i)}));
    const model=buildRoundingModel(ids,expenses);
    const base=Object.fromEntries(ids.map(id=>[id,-model.currentShare[id]]));
    base['0']+=expenses.reduce((sum,e)=>sum+e.amount,0);
    const result=applyRoundingToBalances(base,model,{mode:'roundUp'});
    assert.equal(result.error,'');
    for(const id of ids) {
      assert.equal(result.shares[id],expenses.reduce((sum,e)=>sum+Math.ceil(e.amount/count),0));
      assert.ok(result.shares[id]>=model.currentShare[id]);
      assert.equal(result.balances[id]-base[id],(result.poolAllocations[id]||0)-(result.shares[id]-model.currentShare[id]));
    }
    assert.equal(result.extraPool,Object.values(result.shares).reduce((sum,n)=>sum+n,0)-model.originalTotal);
    assert.equal(result.extraPool,Object.values(result.poolAllocations).reduce((sum,n)=>sum+n,0));
    assert.equal(Object.values(result.balances).reduce((sum,n)=>sum+n,0),0);
  }
});
