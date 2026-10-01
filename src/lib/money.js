/** All values are integer TWD. Expense allocations are immutable snapshots. */
export function assertAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error('金額必須是 1～1,000,000,000 的整數。');
  }
  return amount;
}

function assertParticipants(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length === 0 ||
      new Set(participantIds).size !== participantIds.length ||
      participantIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('請選擇至少一位不重複的分攤成員。');
  }
}

/** Stable largest-remainder allocation. Equal fractions break ties by input order. */
function allocateByIntegerWeights(amount, participantIds, weights) {
  assertAmount(amount);
  assertParticipants(participantIds);
  if (weights.length !== participantIds.length || weights.some((w) => typeof w !== 'bigint' || w <= 0n)) {
    throw new Error('每位分攤成員的比例都必須大於 0。');
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0n);
  const target = BigInt(amount);
  const allocations = weights.map((weight, index) => ({
    id: participantIds[index],
    value: Number(target * weight / totalWeight),
    remainder: target * weight % totalWeight,
    index,
  }));
  let remaining = amount - allocations.reduce((sum, item) => sum + item.value, 0);
  const ranked = [...allocations].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let i = 0; i < remaining; i += 1) ranked[i].value += 1;
  return Object.fromEntries(allocations.map(({ id, value }) => [id, value]));
}

export function splitEqual(amount, participantIds) {
  assertParticipants(participantIds);
  return allocateByIntegerWeights(amount, participantIds, participantIds.map(() => 1n));
}

/** Equal integer split with a rotating starting point for the unavoidable +NT$1 remainder.
 * The total always equals amount. offset is normalized to the participant count.
 */
export function splitEqualRotating(amount, participantIds, offset = 0) {
  assertAmount(amount);
  assertParticipants(participantIds);
  const count = participantIds.length;
  const base = Math.floor(amount / count);
  const remainder = amount % count;
  const allocations = Object.fromEntries(participantIds.map((id) => [id, base]));
  const start = ((Number(offset) || 0) % count + count) % count;
  for (let i = 0; i < remainder; i += 1) {
    const id = participantIds[(start + i) % count];
    allocations[id] += 1;
  }
  return allocations;
}

export function splitCustom(amount, participantIds, custom) {
  assertAmount(amount);
  assertParticipants(participantIds);
  const allocations = {};
  let sum = 0;
  for (const id of participantIds) {
    const value = custom[id];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('自訂金額須為 0 或正整數。');
    }
    allocations[id] = value;
    sum += value;
  }
  if (sum !== amount) throw new Error(`自訂分攤加總為 NT$ ${sum.toLocaleString('zh-TW')}，須等於支出總額。`);
  return allocations;
}

function ratioToWeight(value) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('比例須為正數，最多兩位小數。');
  const [whole, decimal = ''] = raw.split('.');
  const weight = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0') || '0');
  if (weight <= 0n || weight > 1_000_000n) throw new Error('比例須大於 0 且不超過 10,000。');
  return weight;
}

export function splitByRatio(amount, participantIds, ratios) {
  assertParticipants(participantIds);
  return allocateByIntegerWeights(amount, participantIds, participantIds.map((id) => ratioToWeight(ratios[id])));
}

export function calculateAllocation({ amount, participantIds, splitMode, customAmounts, ratios }) {
  if (splitMode === 'equal') return splitEqual(amount, participantIds);
  if (splitMode === 'custom') return splitCustom(amount, participantIds, customAmounts);
  if (splitMode === 'ratio') return splitByRatio(amount, participantIds, ratios);
  throw new Error('不支援的分攤方式。');
}

export function assertSettlement(settlement) {
  if (!settlement || typeof settlement !== 'object') throw new Error('還款資料不合法。');
  if (typeof settlement.fromUid !== 'string' || !settlement.fromUid ||
      typeof settlement.toUid !== 'string' || !settlement.toUid) {
    throw new Error('還款成員不合法。');
  }
  if (settlement.fromUid === settlement.toUid) throw new Error('不能自己還款給自己。');
  if (!Number.isSafeInteger(settlement.amount) || settlement.amount <= 0 || settlement.amount > 1_000_000_000) {
    throw new Error('還款金額必須是 1～1,000,000,000 的整數。');
  }
  return settlement;
}

function assertUniqueSettlementIds(settlements) {
  const seen = new Set();
  for (const settlement of settlements) {
    if (!settlement?.id) continue;
    if (seen.has(settlement.id)) throw new Error('偵測到重複的還款紀錄。');
    seen.add(settlement.id);
  }
}

/** Confirmed transfers reduce debt. Pending transfers are only reserved for new suggestions. */
export function calculateBalances(participantIds, expenses, settlements = [], includePending = false) {
  // Current activity members and historical ledger participants are different concepts.
  // A person may leave an activity/group while their earlier allocation/payment/repayment must stay valid.
  const ledgerIds = new Set(participantIds);
  for (const expense of expenses) {
    for (const uid of Object.keys(expense.allocations || {})) ledgerIds.add(uid);
    const payments = Array.isArray(expense.payments) && expense.payments.length
      ? expense.payments : [{ uid: expense.paidBy, amount: expense.amount }];
    for (const payment of payments) if (payment?.uid) ledgerIds.add(payment.uid);
    if (expense.change?.receiverUid) ledgerIds.add(expense.change.receiverUid);
  }
  for (const settlement of settlements) {
    if (settlement.fromUid) ledgerIds.add(settlement.fromUid);
    if (settlement.toUid) ledgerIds.add(settlement.toUid);
  }
  const balances = Object.fromEntries([...ledgerIds].map((id) => [id, 0]));
  for (const expense of expenses) {
    assertAmount(expense.amount);
    const payments = Array.isArray(expense.payments) && expense.payments.length
      ? expense.payments.map((item) => ({ uid: item.uid, amount: item.amount }))
      : [{ uid: expense.paidBy, amount: expense.amount }];
    let totalPaid = 0;
    for (const payment of payments) {
      if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) throw new Error('付款金額不合法。');
      totalPaid += payment.amount;
      if (!(payment.uid in balances)) throw new Error('付款人不在活動成員中。');
      balances[payment.uid] += payment.amount;
    }
    const changeAmount = expense.change?.amount || 0;
    if (!Number.isSafeInteger(changeAmount) || changeAmount < 0) throw new Error('找零金額不合法。');
    if (totalPaid - changeAmount !== expense.amount) throw new Error('付款扣除找零後與支出總額不符。');
    if (changeAmount > 0 && !expense.change?.receiverUid) throw new Error('有找零時必須指定領取人。');
    if (expense.change?.receiverUid && changeAmount > 0) {
      if (!(expense.change.receiverUid in balances)) throw new Error('找零領取人不在活動成員中。');
      balances[expense.change.receiverUid] -= changeAmount;
    }
    const allocationSum = Object.values(expense.allocations || {}).reduce((sum, amount) => {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('分攤金額不合法。');
      return sum + amount;
    }, 0);
    if (allocationSum !== expense.amount) throw new Error('分攤合計與支出總額不符。');
    for (const [uid, share] of Object.entries(expense.allocations)) {
      if (!(uid in balances)) throw new Error('分攤成員不在活動成員中。');
      balances[uid] -= share;
    }
  }
  assertUniqueSettlementIds(settlements);
  for (const settlement of settlements) {
    if (!['pending', 'confirmed', 'disputed'].includes(settlement.status)) continue;
    assertSettlement(settlement);
    if (settlement.status !== 'confirmed' && !(includePending && settlement.status === 'pending')) continue;
    if (!(settlement.fromUid in balances) || !(settlement.toUid in balances)) {
      throw new Error('還款涉及非活動成員。');
    }
    const debtorOutstanding = Math.max(0, -(balances[settlement.fromUid] || 0));
    const creditorOutstanding = Math.max(0, balances[settlement.toUid] || 0);
    const maximumPayable = Math.min(debtorOutstanding, creditorOutstanding);
    if (settlement.amount > maximumPayable) {
      throw new Error(`還款金額超過目前可結算金額 NT$ ${maximumPayable.toLocaleString('zh-TW')}。`);
    }
    balances[settlement.fromUid] += settlement.amount;
    balances[settlement.toUid] -= settlement.amount;
  }
  if (Object.values(balances).reduce((sum, n) => sum + n, 0) !== 0) {
    throw new Error('帳目不平衡，請檢查資料。');
  }
  return balances;
}

/** Deterministic greedy suggestions, not a guarantee of global minimum transfers. */
export function suggestTransfers(balances) {
  const entries = Object.entries(balances);
  const creditors = entries.filter(([, n]) => n > 0).map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const debtors = entries.filter(([, n]) => n < 0).map(([id, value]) => ({ id, value: -value }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].value, creditors[j].value);
    if (amount > 0) transfers.push({ fromUid: debtors[i].id, toUid: creditors[j].id, amount });
    debtors[i].value -= amount;
    creditors[j].value -= amount;
    if (debtors[i].value === 0) i += 1;
    if (creditors[j].value === 0) j += 1;
  }
  if (i !== debtors.length || j !== creditors.length) throw new Error('帳目不平衡，無法建議轉帳。');
  return transfers;
}

export function formatMoney(value) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
}
