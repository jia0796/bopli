import { calculateBalances } from './money.js';
import { isOwner } from './domain.js';

const activeSettlement = (item) => ['pending','disputed'].includes(item?.status);

export function activityDeletionStatus(group, activity, data, actorId) {
  if (!group || !activity) return { allowed:false, reason:'找不到群組或活動。' };
  if (!isOwner(group, actorId)) return { allowed:false, reason:'只有群主可以永久刪除活動。' };

  const expenses=(data.expenses||[]).filter((e)=>e.activityId===activity.id);
  const settlements=(data.settlements||[]).filter((s)=>s.activityId===activity.id);
  if (settlements.some(activeSettlement)) {
    return { allowed:false, reason:'活動仍有待確認或有爭議的還款，請先處理完成。' };
  }

  try {
    const balances=calculateBalances(activity.participantIds||[],expenses,settlements);
    if (Object.values(balances).some((value)=>value!==0)) {
      return { allowed:false, reason:'活動仍有未結清餘額，完成結算後才能永久刪除。' };
    }
  } catch (error) {
    return { allowed:false, reason:`活動帳務資料無法安全驗證：${error.message}` };
  }

  return {
    allowed:true,
    reason:'',
    counts:{
      expenses:expenses.length,
      settlements:settlements.length,
      drafts:(data.drafts||[]).filter((d)=>d.activityId===activity.id).length,
    },
  };
}

export function groupDeletionStatus(group, data, actorId) {
  if (!group) return { allowed:false, reason:'找不到群組。' };
  if (!isOwner(group, actorId)) return { allowed:false, reason:'只有群主可以永久刪除群組。' };

  const activities=(data.activities||[]).filter((a)=>a.groupId===group.id);
  for (const activity of activities) {
    const status=activityDeletionStatus(group,activity,data,actorId);
    if (!status.allowed) {
      return { allowed:false, reason:`「${activity.title}」：${status.reason}`, activityId:activity.id };
    }
  }
  return { allowed:true, reason:'', counts:{ activities:activities.length } };
}

export function deleteActivityCascade(data, activityId) {
  return {
    ...data,
    activities:(data.activities||[]).filter((a)=>a.id!==activityId),
    expenses:(data.expenses||[]).filter((e)=>e.activityId!==activityId),
    settlements:(data.settlements||[]).filter((s)=>s.activityId!==activityId),
    drafts:(data.drafts||[]).filter((d)=>d.activityId!==activityId),
    notifications:(data.notifications||[]).filter((n)=>n.activityId!==activityId),
  };
}

export function deleteGroupCascade(data, groupId) {
  const activityIds=new Set((data.activities||[]).filter((a)=>a.groupId===groupId).map((a)=>a.id));
  return {
    ...data,
    groups:(data.groups||[]).filter((g)=>g.id!==groupId),
    activities:(data.activities||[]).filter((a)=>a.groupId!==groupId),
    expenses:(data.expenses||[]).filter((e)=>!activityIds.has(e.activityId)),
    settlements:(data.settlements||[]).filter((s)=>!activityIds.has(s.activityId)),
    drafts:(data.drafts||[]).filter((d)=>!activityIds.has(d.activityId)),
    notifications:(data.notifications||[]).filter((n)=>n.groupId!==groupId&&!activityIds.has(n.activityId)),
  };
}
