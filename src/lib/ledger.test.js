import test from 'node:test';
import assert from 'node:assert/strict';
import { memberLedger, activityTotals, expensePaymentSummary } from './ledger.js';
import { appendCostcoDemo } from './demo.js';
import { createGuestStore } from './store.js';
import { calculateBalances } from './money.js';

test('17 人購物單：7000 元，三人付款，私人商品與酒各自分攤', () => {
  const original = createGuestStore('Cayden');
  const { store, activityId, groupId } = appendCostcoDemo(original, original.currentUserId);
  const group = store.groups.find((item) => item.id === groupId);
  const expense = store.expenses.find((item) => item.activityId === activityId);
  const ledger = memberLedger(group.memberIds, [expense]);
  assert.equal(group.memberIds.length, 17);
  assert.equal(expense.amount, 7000);
  assert.deepEqual(expense.payments.map((item) => item.amount), [4000, 2000, 1000]);
  assert.equal(expense.lines.reduce((sum, line) => sum + line.amount, 0), 7000);
  assert.equal(Object.values(expense.allocations).reduce((sum, amount) => sum + amount, 0), 7000);
  assert.equal(ledger[group.memberIds[4]].share, 1318);
  assert.equal(ledger[group.memberIds[5]].share, 615);
  assert.equal(ledger[group.memberIds[0]].advanced, 4000);
  assert.equal(Object.values(ledger).reduce((sum, member) => sum + member.balance, 0), 0);
  assert.equal(expensePaymentSummary(expense).payerCount, 3);
});

test('找零算在收款人的實際墊付；與分攤及還款分開', () => {
  const e = { id: 'e', title:'超市', amount: 6800,
    payments: [{uid:'A',amount:4000},{uid:'B',amount:2000},{uid:'C',amount:1000}],
    change: {amount:200,receiverUid:'A'},
    allocations: {A:1700,B:1700,C:1700,D:1700},
  };
  const settlements = [
    {id:'s1',fromUid:'D',toUid:'A',amount:300,status:'confirmed',method:'cash'},
    {id:'s2',fromUid:'D',toUid:'B',amount:100,status:'pending',method:'transfer'},
  ];
  const ledgers = memberLedger(['A','B','C','D'], [e], settlements);
  assert.equal(ledgers.A.paid, 4000);
  assert.equal(ledgers.A.changeReceived, 200);
  assert.equal(ledgers.A.advanced, 3800);
  assert.equal(ledgers.A.received, 300);
  assert.equal(ledgers.A.balance, 1800);
  assert.equal(ledgers.D.repaid, 300);
  assert.equal(ledgers.D.pendingOut, 100);
  assert.equal(ledgers.D.balance, -1400);
  assert.equal(ledgers.A.balance, calculateBalances(['A','B','C','D'], [e], settlements).A);
  assert.equal(activityTotals([e], settlements).expenseAmount, 6800);
});

test('舊版單付款支出可直接顯示帳目', () => {
  const old = {id:'old',title:'停車費',amount:100,paidBy:'A',allocations:{A:50,B:50}};
  const ledgers = memberLedger(['A','B'],[old]);
  assert.equal(ledgers.A.balance,50);
  assert.equal(ledgers.B.balance,-50);
  assert.equal(expensePaymentSummary(old).payerCount,1);
});

test('重複載入範例不新增第二本帳', () => {
  const store = createGuestStore('測試者');
  const first = appendCostcoDemo(store, store.currentUserId);
  const second = appendCostcoDemo(first.store, store.currentUserId);
  assert.equal(second.added, false);
  assert.equal(second.store.groups.length, 1);
});

test('付款與找零不平衡的支出不得進入結算', () => {
  const bad = {id:'bad',title:'錯誤收據',amount:7000,
    payments:[{uid:'A',amount:4000},{uid:'B',amount:2000},{uid:'C',amount:1000}],
    change:{amount:200,receiverUid:'A'},
    allocations:{A:7000}};
  assert.throws(()=>memberLedger(['A','B','C'],[bad]),/付款扣除找零/);
});
