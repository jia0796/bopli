import { activityFinance } from './activityFinance.js';
import { expensePayments } from './ledger.js';

export const activeRepayment = s => ['pending','disputed','confirmed'].includes(s.status);
export function expenseNet(expense, uid) {
  return expensePayments(expense).filter(p=>p.uid===uid).reduce((sum,p)=>sum+p.amount,0)
    -(expense.change?.receiverUid===uid?(expense.change.amount||0):0)-(expense.allocations?.[uid]||0);
}
export function accountingSignature(activity, expenses) {
  return JSON.stringify({participants:activity.participantIds,expenses:expenses.map(e=>({id:e.id,title:e.title,revision:e.revision,amount:e.amount,allocations:e.allocations,payments:expensePayments(e),change:e.change||null})).sort((a,b)=>a.id.localeCompare(b.id)),manual:activity.settlementManualTransfers||[],rounding:activity.roundingLockedAt?activity.roundingConfig:null});
}
export function snapshotValid(activity, expenses) {
  return Boolean(activity.settlementSnapshot&&activity.settlementSnapshot.signature===accountingSignature(activity,expenses));
}
export function buildSnapshot(activity, expenses, settlements, id, at, actorId) {
  const finance=activityFinance(activity,expenses,settlements);
  if(finance.error)throw new Error(finance.error);
  return {id,createdAt:at,createdBy:actorId,signature:accountingSignature(activity,expenses),routes:finance.transfers.map(t=>({...t})),basis:expenses.map(e=>({expenseId:e.id,net:Object.fromEntries(Object.keys(finance.balances).map(uid=>[uid,expenseNet(e,uid)]).filter(([,net])=>net!==0))}))};
}
export function repaymentReferencesExpense(repayment, expense) {
  if(!activeRepayment(repayment)||repayment.activityId!==expense.activityId)return false;
  if(!repayment.fromUid||!repayment.toUid)return true;
  const basis=repayment.accountingBasis?.find(row=>row.expenseId===expense.id);
  if(repayment.accountingBasis)return Boolean(basis&&((basis.net[repayment.fromUid]||0)!==0||(basis.net[repayment.toUid]||0)!==0));
  return expenseNet(expense,repayment.fromUid)!==0||expenseNet(expense,repayment.toUid)!==0;
}
export function validateHistoricalRepayments(store) {
  for(const activity of store.activities) {
    const repayments=store.settlements.filter(s=>s.activityId===activity.id&&activeRepayment(s));
    if(!repayments.length)continue;
    const finance=activityFinance(activity,store.expenses.filter(e=>e.activityId===activity.id),repayments);
    if(finance.error)throw new Error(finance.error);
  }
  return store;
}
