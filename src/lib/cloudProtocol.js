import { canEditExpense, canManageActivity, isOwner, updateExpenseWithHistory } from './domain.js';
import { assertAmount, buildSettlementPlan } from './money.js';
import { expensePayments } from './ledger.js';
import { activityFinance } from './activityFinance.js';
import { buildSnapshot, snapshotValid, validateHistoricalRepayments, accountingSignature } from './settlementBatch.js';
import { activityDeletionStatus, groupDeletionStatus } from './lifecycle.js';
import { assertName } from './inputRules.js';

export const CONFLICT = '這筆支出已被其他成員更新，請重新確認';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function fail(message, code='failed-precondition') { const e=new Error(message);e.code=code;throw e; }
export function assertId(id) { if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))fail('無效的 ID','invalid-argument');return id; }
export function changes(before, after) {
  const result=[];
  for(const kind of ['groups','activities','expenses','settlements']) {
    const old=new Map(before[kind].map(x=>[x.id,x]));
    const next=new Map(after[kind].map(x=>[x.id,x]));
    for(const id of new Set([...old.keys(),...next.keys()])) {
      if(!equal(old.get(id),next.get(id)))result.push({kind,id,before:old.get(id)||null,after:next.get(id)||null});
    }
  }
  return result;
}
const immutable=(a,b,keys)=>keys.every(k=>equal(a[k],b[k]));
function validExpense(e, activity, users) {
  assertAmount(e.amount);
  if(!e.title?.trim()||!Array.isArray(e.participantIds)||!e.participantIds.length||new Set(e.participantIds).size!==e.participantIds.length)fail('支出資料不完整');
  const known=id=>Boolean(users[id]);
  const values=Object.values(e.allocations||{});
  if(!values.length||values.some(x=>!Number.isSafeInteger(x)||x<0)||values.reduce((a,b)=>a+b,0)!==e.amount)fail('支出分攤加總不一致');
  const payments=expensePayments(e);
  if(!payments.length||payments.some(p=>!known(p.uid)||!Number.isSafeInteger(p.amount)||p.amount<0))fail('付款資料不正確');
  const change=e.change?.amount||0;
  if(!Number.isSafeInteger(change)||change<0||(change&&!known(e.change.receiverUid))||payments.reduce((s,p)=>s+p.amount,0)-change!==e.amount)fail('付款與找零不一致');
  if([...e.participantIds,...Object.keys(e.allocations)].some(id=>!known(id)||!activity.participantIds.includes(id)))fail('支出包含非活動成員');
  if(e.lines?.length&&e.lines.reduce((s,l)=>s+l.amount,0)!==e.amount)fail('品項加總不一致');
}

/** Trusted server validator. The client sends document changes, never an app-state blob.
 * Every before value is checked against transaction reads. Accounting is recalculated
 * from authoritative rows. Unsupported combinations fail closed. */
export function applyCloudChanges(store, patch, actor, at=new Date().toISOString()) {
  if(!Array.isArray(patch)||!patch.length||patch.length>100)fail('變更數量不正確','invalid-argument');
  const next=structuredClone(store);
  const seen=new Set();
  for(const c of patch) {
    if(!['groups','activities','expenses','settlements'].includes(c.kind))fail('不支援的資料');
    assertId(c.id);
    if(seen.has(`${c.kind}/${c.id}`))fail('重複變更');seen.add(`${c.kind}/${c.id}`);
    const current=store[c.kind].find(x=>x.id===c.id)||null;
    if(!equal(current,c.before))fail(c.kind==='expenses'?CONFLICT:'資料已更新，請重新確認','aborted');
    if(c.after&&c.after.id!==c.id)fail('不可變更 ID');
    next[c.kind]=next[c.kind].filter(x=>x.id!==c.id);
    if(c.after)next[c.kind].push(structuredClone(c.after));
  }
  for(const c of patch) {
    const old=c.before, row=next[c.kind].find(x=>x.id===c.id)||null;
    if(c.kind==='groups') {
      if(!old) {
        if(!row||row.ownerUid!==actor||!equal(row.memberIds,[actor])||row.deputyUids.length)fail('群組建立者不正確','permission-denied');
      } else if(!isOwner(old,actor)) {
        // Personal nickname/last-used changes only. Membership joins use invite endpoint.
        const allowed={...old,lastUsedAt:row?.lastUsedAt,nicknames:{...old.nicknames,[actor]:row?.nicknames?.[actor]},policyHistory:row?.policyHistory};
        const exited={...old,memberIds:old.memberIds.filter(id=>id!==actor),deputyUids:old.deputyUids.filter(id=>id!==actor)};
        if(!row||!old.memberIds.includes(actor)||(!equal(allowed,row)&&!equal(exited,row)))fail('只有群主可以管理群組','permission-denied');
      }
      if(!row) {if(!groupDeletionStatus(old,store,actor).allowed)fail('群組仍有未結清帳務');continue;}
      if(old&&row.memberIds.some(id=>!old.memberIds.includes(id)))fail('成員加入需使用邀請碼');
      if(!row.name?.trim()||!row.memberIds.includes(row.ownerUid)||row.deputyUids.length>3||row.deputyUids.some(id=>!row.memberIds.includes(id)||id===row.ownerUid))fail('群組角色不正確');
      for(const [id,nick] of Object.entries(row.nicknames||{}))if(nick!==old?.nicknames?.[id])assertName(nick);
      if(!['creatorOnly','allMembers'].includes(row.editPolicy))fail('無效權限');
      if(!equal(old?.policyHistory||[],(row.policyHistory||[]).slice(0,(old?.policyHistory||[]).length)))fail('不可改寫群組歷史');
    }
    const target=row||old;
    const activity=c.kind==='activities'?target:store.activities.find(a=>a.id===target.activityId)||next.activities.find(a=>a.id===target.activityId);
    const group=store.groups.find(g=>g.id===activity?.groupId)||next.groups.find(g=>g.id===activity?.groupId);
    const deletingActivity=activity&&!next.activities.some(a=>a.id===activity.id)&&activityDeletionStatus(group,activity,store,actor).allowed;
    if(c.kind==='activities') {
      const selfExit=old&&row&&equal({...old,participantIds:old.participantIds.filter(id=>id!==actor),memberReviewIds:(old.memberReviewIds||[]).filter(id=>id!==actor)},row)&&patch.some(p=>p.kind==='groups'&&p.before?.memberIds.includes(actor)&&!p.after?.memberIds.includes(actor));
      const consumingManual=old&&row&&patch.some(p=>p.kind==='settlements'&&!p.before&&p.after?.activityId===old.id&&p.after.fromUid===actor)&&equal({...old,settlementManualTransfers:row.settlementManualTransfers,settlementSnapshot:row.settlementSnapshot},row);
      const cancellingOwnPayment=old&&row&&equal({...old,settlementSnapshot:null},row)&&patch.some(p=>p.kind==='settlements'&&p.before?.activityId===old.id&&p.before.fromUid===actor&&p.after?.status==='cancelled');
      if(!canManageActivity(group,actor)&&!selfExit&&!consumingManual&&!cancellingOwnPayment)fail('沒有管理活動權限','permission-denied');
      if(old&&row&&!immutable(old,row,['id','groupId','createdAt']))fail('活動來源不可改寫');
      if(!row) {if(!activityDeletionStatus(group,old,store,actor).allowed)fail('活動仍有未結清帳務');continue;}
      if(!row.title?.trim()||row.participantIds.some(id=>!group.memberIds.includes(id)&&!old?.participantIds.includes(id)))fail('活動成員不正確');
      const repayments=store.settlements.filter(s=>s.activityId===row.id);
      const expenses=next.expenses.filter(e=>e.activityId===row.id);
      if(!equal(old?.auditHistory||[],(row.auditHistory||[]).slice(0,(old?.auditHistory||[]).length)))fail('不可改寫活動歷史');
      if(repayments.some(s=>['pending','disputed','confirmed'].includes(s.status))&&old&&(!equal(old.roundingConfig,row.roundingConfig)||old.roundingLockedAt!==row.roundingLockedAt))fail('還款開始後不可更改尾差方案');
      const oldSnapshots=old?.settlementSnapshots||[];
      const newSnapshots=row.settlementSnapshots||[];
      if(!equal(oldSnapshots,newSnapshots.slice(0,oldSnapshots.length))||newSnapshots.length>oldSnapshots.length+1)fail('不可改寫歷史結算快照');
      if(!equal(old?.settlementManualTransfers,row.settlementManualTransfers))buildSettlementPlan(activityFinance(old||row,store.expenses.filter(e=>e.activityId===row.id),repayments).projectedBalances,row.settlementManualTransfers||[]);
      if(row.settlementSnapshot&&!equal(old?.settlementSnapshot,row.settlementSnapshot)) {
        const expected=buildSnapshot(row,expenses,next.settlements.filter(s=>s.activityId===row.id),row.settlementSnapshot.id,row.settlementSnapshot.createdAt,actor);
        // A payment consumes manual routes while retaining its original accounting basis.
        const newPayment=patch.some(p=>p.kind==='settlements'&&!p.before&&p.after?.activityId===row.id);
        if(newPayment) {
          if(!equal(row.settlementSnapshot,{...old?.settlementSnapshot,signature:accountingSignature(row,expenses)}))fail('付款快照不正確');
        } else if(!equal(expected,row.settlementSnapshot))fail('結算快照與帳務不一致');
      }
      if(newSnapshots.length>oldSnapshots.length&&!equal(newSnapshots.at(-1),row.settlementSnapshot))fail('結算歷史快照不正確');
    }
    if(c.kind==='expenses') {
      if(!group?.memberIds.includes(actor)||!activity)fail('沒有支出權限','permission-denied');
      if(old&&!canEditExpense(group,old,actor,store.settlements)&&!(deletingActivity&&!row))fail('支出受還款保護或沒有編輯權限','permission-denied');
      if(row) {
        if(old&&!immutable(old,row,['id','activityId','createdBy','createdAt']))fail('歷史支出來源不可改寫');
        if(!old&&row.createdBy!==actor)fail('不可冒用支出建立者');
        if(!Number.isInteger(row.revision)||row.revision!==(old?(old.revision||1)+1:1))fail(CONFLICT,'aborted');
        validExpense(row,next.activities.find(a=>a.id===row.activityId),next.users);
        row.updatedAt=at;
        row.history=old?updateExpenseWithHistory(old,row,actor,at,globalThis.crypto.randomUUID()).history:[];
        if(!old)row.createdAt=at;
      }
    }
    if(c.kind==='settlements') {
      if(!row) {if(deletingActivity)continue;fail('付款歷史不可刪除');}
      if(!old) {
        if(row.fromUid!==actor||row.createdBy!==actor||row.status!=='pending'||!group?.memberIds.includes(actor)||!snapshotValid(activity,store.expenses.filter(e=>e.activityId===activity.id)))fail('請先結算，且只能記錄自己的付款','permission-denied');
        assertAmount(row.amount);
        const routes=activityFinance(activity,store.expenses.filter(e=>e.activityId===activity.id),store.settlements.filter(s=>s.activityId===activity.id)).transfers;
        const capacity=routes.filter(t=>t.fromUid===actor&&t.toUid===row.toUid).reduce((s,t)=>s+t.amount,0);
        if(row.fromUid===row.toUid||row.amount>capacity)fail('付款金額超過目前可支付金額');
        if(row.snapshotId!==activity.settlementSnapshot.id)fail('付款快照已過期');
        row.accountingBasis=activity.settlementSnapshot.basis.map(b=>({expenseId:b.expenseId,net:{[row.fromUid]:b.net[row.fromUid]||0,[row.toUid]:b.net[row.toUid]||0}})).filter(b=>Object.values(b.net).some(Boolean));
        let remaining=row.amount;
        const consumed=[];
        for(const route of routes.filter(t=>t.fromUid===actor&&t.toUid===row.toUid&&t.source==='manual')) {
          const amount=Math.min(remaining,route.amount);
          if(amount>0){consumed.push({id:route.manualId,amount});remaining-=amount;}
        }
        if(!equal(row.manualPlanConsumption||[],consumed))fail('手動路線使用金額不正確');
        const updatedActivity=next.activities.find(a=>a.id===activity.id);
        const expectedManual=(activity.settlementManualTransfers||[]).map(r=>({...r,amount:r.amount-(consumed.find(c=>c.id===r.id)?.amount||0)})).filter(r=>r.amount>0);
        if(!equal(updatedActivity.settlementManualTransfers||[],expectedManual))fail('手動路線未原子更新');
      } else {
        if(!immutable(old,row,['id','activityId','fromUid','toUid','amount','createdBy','createdAt','snapshotId','accountingBasis','manualPlanConsumption','method','methodOther','note','paidDate']))fail('不可改寫付款歷史');
        const receiver=old.toUid===actor&&old.status==='pending'&&['confirmed','disputed'].includes(row.status);
        const payer=old.fromUid===actor&&((old.status==='disputed'&&row.status==='pending')||(['pending','disputed'].includes(old.status)&&row.status==='cancelled'));
        if(!receiver&&!payer)fail('付款狀態已變更或沒有權限','permission-denied');
      }
      row.events=[...(old?.events||[]),{type:row.status,by:actor,at}];
      if(!old)row.createdAt=at;
      if(row.status==='confirmed')row.confirmedAt=at;
    }
  }
  // No disappearing historical identities or orphaned accounting rows.
  for(const e of next.expenses)if(!next.activities.some(a=>a.id===e.activityId))fail('不可留下孤立支出');
  for(const s of next.settlements)if(!next.activities.some(a=>a.id===s.activityId))fail('不可刪除付款歷史');
  for(const a of next.activities)if(!next.groups.some(g=>g.id===a.groupId))fail('不可留下孤立活動');
  validateHistoricalRepayments(next);
  for(const a of next.activities)activityFinance(a,next.expenses.filter(e=>e.activityId===a.id),next.settlements.filter(s=>s.activityId===a.id));
  return next;
}
