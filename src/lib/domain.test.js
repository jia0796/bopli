import test from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_POLICY, canEditExpense, changeGroupPolicy, updateExpenseWithHistory } from './domain.js';

const group = {id:'g',ownerUid:'a',memberIds:['a','b','c'],editPolicy:EDIT_POLICY.OWNER_ONLY,policyHistory:[]};
const expense = {id:'e',activityId:'act',createdBy:'b',title:'晚餐',amount:90,paidBy:'b',participantIds:['a','b'],splitMode:'equal',allocations:{a:45,b:45},history:[],revision:1};
test('預設只有記帳人可編輯，群組管理員不自動代改', () => {
  assert.equal(canEditExpense(group,expense,'b'),true);
  assert.equal(canEditExpense(group,expense,'a'),false);
});
test('全部成員開放後可改，非成員仍不得改', () => {
  const all = {...group,editPolicy:EDIT_POLICY.ALL};
  assert.equal(canEditExpense(all,expense,'c'),true);
  assert.equal(canEditExpense(all,expense,'x'),false);
});
test('有待確認或已確認還款時封鎖修改', () => {
  const all = {...group,editPolicy:EDIT_POLICY.ALL};
  assert.equal(canEditExpense(all,expense,'c',[{activityId:'act',status:'pending'}]),false);
  assert.equal(canEditExpense(all,expense,'c',[{activityId:'act',status:'confirmed'}]),false);
  assert.equal(canEditExpense(all,expense,'c',[{activityId:'other',status:'confirmed'}]),true);
});
test('權限開關限建立者修改並留下紀錄', () => {
  assert.throws(()=>changeGroupPolicy(group,EDIT_POLICY.ALL,'b','now'),/建立者/);
  const next=changeGroupPolicy(group,EDIT_POLICY.ALL,'a','now');
  assert.equal(next.editPolicy,EDIT_POLICY.ALL);
  assert.deepEqual(next.policyHistory,[{at:'now',by:'a',from:EDIT_POLICY.OWNER_ONLY,to:EDIT_POLICY.ALL}]);
});
test('更新支出保留修改前後快照，不覆蓋歷史', () => {
  const edited=updateExpenseWithHistory(expense,{title:'早午餐',amount:100,allocations:{a:50,b:50}},'a','now','h1');
  assert.equal(edited.revision,2);
  assert.equal(edited.history[0].before.amount,90);
  assert.equal(edited.history[0].after.amount,100);
  assert.equal(expense.title,'晚餐');
  assert.equal(expense.history.length,0);
});

test('副群主最多三位且只有群主可指派', async () => {
  const { setDeputy } = await import('./domain.js');
  const base={...group,memberIds:['a','b','c','d','e'],deputyUids:[]};
  assert.throws(()=>setDeputy(base,'b',true,'c','now'),/只有群主/);
  const g1=setDeputy(base,'b',true,'a','1');
  const g2=setDeputy(g1,'c',true,'a','2');
  const g3=setDeputy(g2,'d',true,'a','3');
  assert.equal(g3.deputyUids.length,3);
  assert.throws(()=>setDeputy(g3,'e',true,'a','4'),/最多 3 位/);
});
