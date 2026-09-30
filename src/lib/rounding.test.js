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
