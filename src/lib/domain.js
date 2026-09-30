export const EDIT_POLICY = Object.freeze({ OWNER_ONLY: 'creatorOnly', ALL: 'allMembers' });

export function isOwner(group, userId) {
  return Boolean(group && group.ownerUid === userId);
}

export function isDeputy(group, userId) {
  return Boolean(group && Array.isArray(group.deputyUids) && group.deputyUids.includes(userId));
}

export function canManageActivity(group, userId) {
  return isOwner(group, userId) || isDeputy(group, userId);
}

export function canManageFinalRounding(group, userId) {
  return canManageActivity(group, userId);
}

export function canEditExpense(group, expense, userId, settlements = []) {
  if (!group || !expense || !group.memberIds.includes(userId)) return false;
  // Once repayments exist, protect settled/pending data from unilateral edits.
  if (settlements.some((item) => item.activityId === expense.activityId &&
    (item.status === 'pending' || item.status === 'confirmed' || item.status === 'disputed'))) return false;
  return group.editPolicy === EDIT_POLICY.ALL || expense.createdBy === userId;
}

export function changeGroupPolicy(group, newPolicy, actorId, at) {
  if (!isOwner(group, actorId)) throw new Error('只有群主（群組建立者）可以修改記帳權限。');
  if (!Object.values(EDIT_POLICY).includes(newPolicy)) throw new Error('無效的權限設定。');
  if (group.editPolicy === newPolicy) return group;
  return {
    ...group,
    editPolicy: newPolicy,
    policyHistory: [...(group.policyHistory || []), {
      at, by: actorId, from: group.editPolicy, to: newPolicy,
    }],
  };
}

export function setDeputy(group, targetUid, enabled, actorId, at) {
  if (!isOwner(group, actorId)) throw new Error('只有群主可以設定副群主。');
  if (!group.memberIds.includes(targetUid) || targetUid === group.ownerUid) throw new Error('這位成員不能設定為副群主。');
  const current = [...(group.deputyUids || [])];
  const exists = current.includes(targetUid);
  if (enabled && !exists && current.length >= 3) throw new Error('副群主最多 3 位。');
  const deputyUids = enabled ? [...new Set([...current, targetUid])] : current.filter((id) => id !== targetUid);
  if (exists === enabled) return group;
  return {
    ...group,
    deputyUids,
    policyHistory: [...(group.policyHistory || []), {
      at, by: actorId, type: enabled ? 'deputyAdded' : 'deputyRemoved', targetUid,
    }],
  };
}

function auditSnapshot(expense) {
  return {
    title: expense.title,
    amount: expense.amount,
    expenseType: expense.expenseType || 'simple',
    paidBy: expense.paidBy,
    payments: [...(expense.payments || [])],
    change: expense.change ? { ...expense.change } : null,
    participantIds: [...expense.participantIds],
    splitMode: expense.splitMode,
    shoppingMode: expense.shoppingMode || null,
    commonParticipants: [...(expense.commonParticipants || [])],
    lines: (expense.lines || []).map((line) => ({ ...line, allocations: { ...(line.allocations || {}) } })),
    customAmounts: { ...(expense.customAmounts || {}) },
    ratios: { ...(expense.ratios || {}) },
    allocations: { ...expense.allocations },
  };
}

export function updateExpenseWithHistory(expense, nextFields, actorId, at, historyId) {
  const before = auditSnapshot(expense);
  const after = auditSnapshot({ ...expense, ...nextFields });
  if (JSON.stringify(before) === JSON.stringify(after)) return expense;
  return {
    ...expense,
    ...nextFields,
    updatedAt: at,
    revision: (expense.revision || 1) + 1,
    history: [...(expense.history || []), { id: historyId, type: 'edited', at, by: actorId, before, after }],
  };
}
