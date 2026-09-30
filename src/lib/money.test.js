import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual, splitCustom, splitByRatio, calculateAllocation, calculateBalances, suggestTransfers } from './money.js';

test('平均分攤餘數固定分配，總和不變', () => {
  assert.deepEqual(splitEqual(100, ['a','b','c']), { a: 34, b: 33, c: 33 });
  assert.equal(Object.values(splitEqual(101, ['a','b','c'])).reduce((a,b)=>a+b), 101);
});
test('指定參與者只有選中者負擔', () => assert.deepEqual(splitEqual(90, ['b','c']), { b:45,c:45 }));
test('自訂金額精確加總', () => assert.deepEqual(splitCustom(300, ['a','b'], {a:120,b:180}), {a:120,b:180}));
test('自訂金額不平衡會拒絕', () => assert.throws(()=>splitCustom(300,['a','b'],{a:100,b:100}), /加總/));
test('比例分攤：1:2:3', () => assert.deepEqual(splitByRatio(100,['a','b','c'],{a:'1',b:'2',c:'3'}),{a:17,b:33,c:50}));
test('比例分攤支援兩位小數且整數安全', () => assert.deepEqual(splitByRatio(101,['a','b'],{a:'0.25',b:'0.75'}),{a:25,b:76}));
test('比例不合法會拒絕', () => assert.throws(()=>splitByRatio(100,['a'],{a:'0'}), /比例/));
test('金額必須為安全正整數', () => assert.throws(()=>splitEqual(12.5,['a']), /整數/));
test('參與者不能重複', () => assert.throws(()=>splitEqual(100,['a','a']), /不重複/));
test('不合法模式拒絕', () => assert.throws(()=>calculateAllocation({amount:100,participantIds:['a'],splitMode:'foo'}), /不支援/));
test('確認還款更新淨額，待確認不更新正式餘額', () => {
  const expense = {paidBy:'a',amount:900,allocations:{a:300,b:300,c:300}};
  const settlements = [{fromUid:'b',toUid:'a',amount:100,status:'pending'}, {fromUid:'c',toUid:'a',amount:200,status:'confirmed'}];
  assert.deepEqual(calculateBalances(['a','b','c'],[expense],settlements),{a:400,b:-300,c:-100});
  assert.deepEqual(calculateBalances(['a','b','c'],[expense],settlements,true),{a:300,b:-200,c:-100});
});
test('轉帳建議總額與欠款相同', () => {
  const transfers = suggestTransfers({a:400,b:-250,c:-150});
  assert.equal(transfers.reduce((sum,t)=>sum+t.amount,0),400);
  assert.deepEqual(transfers,[{fromUid:'b',toUid:'a',amount:250},{fromUid:'c',toUid:'a',amount:150}]);
});
test('所有人結清後沒有建議', () => assert.deepEqual(suggestTransfers({a:0,b:0}),[]));
test('不平衡餘額拒絕轉帳建議', () => assert.throws(()=>suggestTransfers({a:100,b:-50}), /不平衡/));
