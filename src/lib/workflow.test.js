import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestStore } from './store.js';
import { calculateBalances, suggestTransfers, splitEqual } from './money.js';
import { canEditExpense, changeGroupPolicy, EDIT_POLICY, updateExpenseWithHistory } from './domain.js';

test('完整示範流程：群組分帳 → 開放共同編輯 → 留存稽核 → 建立待確認還款', () => {
  const store = createGuestStore('我', true);
  const group = store.groups[0];
  const activity = store.activities[0];
  const expenses = store.expenses.filter((expense)=>expense.activityId===activity.id);
  const [me, friend] = group.memberIds;
  assert.equal(group.editPolicy, EDIT_POLICY.OWNER_ONLY);
  assert.equal(canEditExpense(group, expenses[1], me), false);
  const opened = changeGroupPolicy(group, EDIT_POLICY.ALL, me, '2026-01-01T00:00:00.000Z');
  assert.equal(canEditExpense(opened, expenses[1], me), true);
  const newShares = splitEqual(241, expenses[1].participantIds);
  const edited = updateExpenseWithHistory(expenses[1], {
    amount: 241, allocations: newShares,
  }, me, '2026-01-01T00:01:00.000Z', 'audit-1');
  assert.equal(edited.history.length, 1);
  assert.equal(edited.history[0].before.amount, 240);
  assert.equal(edited.history[0].after.amount, 241);
  const balances = calculateBalances(activity.participantIds, [expenses[0], edited]);
  const suggestions = suggestTransfers(balances);
  assert.ok(suggestions.length > 0);
  assert.equal(Object.values(balances).reduce((sum, n)=>sum+n, 0), 0);
  const transfer = suggestions[0];
  const pending = {activityId:activity.id,...transfer,status:'pending'};
  assert.equal(canEditExpense(opened, edited, me, [pending]), false);
  const projected = calculateBalances(activity.participantIds, [expenses[0], edited], [pending], true);
  assert.equal(projected[transfer.fromUid], balances[transfer.fromUid] + transfer.amount);
  assert.equal(projected[transfer.toUid], balances[transfer.toUid] - transfer.amount);
  assert.ok(group.memberIds.includes(friend));
});
