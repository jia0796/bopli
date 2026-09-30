/** Read models for member ledgers; amounts are integer New Taiwan dollars. */
import { calculateBalances } from './money.js';

export function expensePayments(expense) {
  if (Array.isArray(expense.payments) && expense.payments.length) return expense.payments;
  return expense.paidBy ? [{ uid: expense.paidBy, amount: expense.amount }] : [];
}

export function expenseChange(expense) {
  const amount = expense.change?.amount || 0;
  return amount ? { amount, receiverUid: expense.change.receiverUid } : null;
}

export function expensePaymentSummary(expense) {
  const payers = new Set(expensePayments(expense).map((item) => item.uid));
  const lines = expense.lines?.length || 0;
  const people = Object.values(expense.allocations || {}).filter((amount) => amount > 0).length;
  return {
    payerCount: payers.size,
    itemCount: expense.expenseType === 'shopping' ? lines : 1,
    memberCount: people,
    hasChange: Boolean(expenseChange(expense)),
    type: expense.expenseType === 'shopping' ? '購物單' : '一般支出',
  };
}

/** A confirmed repayment transfers net credit, but is never a new expense. */
export function memberLedger(participantIds, expenses, settlements = []) {
  const ids = [...participantIds];
  const ledgers = Object.fromEntries(ids.map((uid) => [uid, {
    uid, paid: 0, changeReceived: 0, advanced: 0, share: 0,
    repaid: 0, received: 0, pendingOut: 0, pendingIn: 0,
    balance: 0, expenseRows: [], repaymentRows: [],
  }]));
  const ensure = (uid) => {
    if (!Object.hasOwn(ledgers, uid)) {
      ledgers[uid] = {
        uid, paid: 0, changeReceived: 0, advanced: 0, share: 0,
        repaid: 0, received: 0, pendingOut: 0, pendingIn: 0,
        balance: 0, expenseRows: [], repaymentRows: [],
      };
    }
    return ledgers[uid];
  };
  for (const expense of expenses) {
    for (const payment of expensePayments(expense)) {
      ensure(payment.uid).paid += payment.amount;
    }
    const change = expenseChange(expense);
    if (change) ensure(change.receiverUid).changeReceived += change.amount;
    for (const [uid, amount] of Object.entries(expense.allocations || {})) {
      ensure(uid).share += amount;
    }
    const peopleInExpense = new Set([
      ...expensePayments(expense).map((item) => item.uid),
      ...Object.keys(expense.allocations || {}),
      ...(change ? [change.receiverUid] : []),
    ]);
    for (const uid of peopleInExpense) {
      const paid = expensePayments(expense)
        .filter((item) => item.uid === uid).reduce((sum, item) => sum + item.amount, 0);
      const returned = change?.receiverUid === uid ? change.amount : 0;
      const share = expense.allocations?.[uid] || 0;
      if (paid || returned || share) ensure(uid).expenseRows.push({
        expenseId: expense.id, title: expense.title,
        paid, changeReceived: returned, advanced: paid - returned, share,
        net: paid - returned - share,
      });
    }
  }
  for (const settlement of settlements) {
    if (!['pending', 'confirmed', 'disputed'].includes(settlement.status)) continue;
    const from = ensure(settlement.fromUid);
    const to = ensure(settlement.toUid);
    const row = {
      id: settlement.id, amount: settlement.amount, status: settlement.status,
      method: settlement.method || 'transfer', fromUid: settlement.fromUid,
      toUid: settlement.toUid, createdAt: settlement.createdAt,
    };
    from.repaymentRows.push(row);
    to.repaymentRows.push(row);
    if (settlement.status === 'confirmed') {
      from.repaid += settlement.amount;
      to.received += settlement.amount;
    } else if (settlement.status === 'pending') {
      from.pendingOut += settlement.amount;
      to.pendingIn += settlement.amount;
    }
  }
  const expected = calculateBalances(ids, expenses, settlements);
  for (const uid of ids) {
    const member = ledgers[uid];
    member.advanced = member.paid - member.changeReceived;
    member.balance = member.advanced - member.share + member.repaid - member.received;
    if (member.balance !== expected[uid]) throw new Error('個人帳目與活動結算不一致。');
  }
  return ledgers;
}

export function activityTotals(expenses, settlements = []) {
  return {
    expenseAmount: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    expenseCount: expenses.length,
    paid: expenses.reduce((sum, expense) => sum + expensePayments(expense).reduce((p, item) => p + item.amount, 0), 0),
    change: expenses.reduce((sum, expense) => sum + (expenseChange(expense)?.amount || 0), 0),
    repaid: settlements.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + item.amount, 0),
  };
}
