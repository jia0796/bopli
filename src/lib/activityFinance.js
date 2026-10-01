import { applyRepayments, buildSettlementPlan, calculateBalances } from './money.js';
import { applyRoundingToBalances, buildRoundingModel } from './rounding.js';

/** One read model shared by activity screens, summaries, and deletion guards. */
export function activityFinance(activity, expenses = [], settlements = [], roundingConfig) {
  const base = calculateBalances(activity.participantIds || [], expenses);
  const model = buildRoundingModel(activity.participantIds || [], expenses);
  const config = roundingConfig ?? (activity.roundingLockedAt ? (activity.roundingConfig || {}) : { mode: 'current' });
  // Rounding defines the debt before repayment validation, not after it.
  const rounded = applyRoundingToBalances(base, model, config);
  const balances = applyRepayments(rounded.balances, settlements);
  const projectedBalances = applyRepayments(rounded.balances, settlements, true);
  const unroundedBalances = { ...base };
  for (const s of settlements.filter(s => s.status === 'confirmed')) {
    unroundedBalances[s.fromUid] += s.amount;
    unroundedBalances[s.toUid] -= s.amount;
  }
  const plan = buildSettlementPlan(projectedBalances, activity.settlementManualTransfers || [], { clamp: true });
  return { ...rounded, balances, unroundedBalances, projectedBalances, projected: projectedBalances,
    transfers: plan.transfers, suggested: plan.transfers,
    status: activityStatus(expenses, settlements, balances) };
}

export function activityStatus(expenses = [], settlements = [], balances = {}, error = '') {
  if (error) return 'unsettled';
  if (expenses.length === 0) return 'notStarted';
  if (settlements.some((s) => ['pending', 'disputed'].includes(s.status))) return 'unsettled';
  return Object.values(balances).every((n) => n === 0) ? 'settled' : 'unsettled';
}
