import { splitEqual } from './money.js';
import { makeId, now } from './store.js';
import { EDIT_POLICY } from './domain.js';

/** Adds one isolated 17-person Costco demo; never changes existing expenses. */
export function appendCostcoDemo(store, actorId) {
  if (!store.users[actorId]) throw new Error('請先輸入帳號名稱。');
  const existing = store.groups.find((group) => group.demoType === 'costco17' && group.ownerUid === actorId);
  if (existing) {
    const activity = store.activities.find((item) => item.groupId === existing.id);
    return { store, groupId: existing.id, activityId: activity?.id, added: false };
  }
  const users = { ...store.users };
  const names = ['阿哲','小羽','小安','小明','阿彥','小琪','小杰','小珊','阿宇','小庭','小米','阿豪','小雯','小瑜','小方','小林'];
  const createdAt = now();
  const memberIds = [actorId, ...names.map((nickname) => {
    const id = makeId();
    users[id] = { id, nickname, accountName: nickname, isGuest: true, isDemo: true, createdAt };
    return id;
  })];
  const groupId = makeId();
  const activityId = makeId();
  const common = splitEqual(5406, memberIds);
  const privateAllocations = { [memberIds[4]]: 1000 };
  const liquorAllocations = splitEqual(594, [memberIds[5], memberIds[6]]);
  const allocations = Object.fromEntries(memberIds.map((uid) => [uid,
    common[uid] + (privateAllocations[uid] || 0) + (liquorAllocations[uid] || 0),
  ]));
  const expense = {
    id: makeId(), activityId, title: '好市多・17 人採買', amount: 7000,
    expenseType: 'shopping', shoppingMode: 'quick',
    paidBy: memberIds[0],
    payments: [
      { uid: memberIds[0], amount: 4000 },
      { uid: memberIds[1], amount: 2000 },
      { uid: memberIds[2], amount: 1000 },
    ],
    change: null, participantIds: [...memberIds],
    splitMode: 'shopping', customAmounts: {}, ratios: {},
    commonParticipants: [...memberIds], allocations,
    lines: [
      { title: '小明的私人商品', amount: 1000, participantIds: [memberIds[4]], splitMode: 'equal', allocations: privateAllocations },
      { title: '檸檬酒（2 人）', amount: 594, participantIds: [memberIds[5], memberIds[6]], splitMode: 'equal', allocations: liquorAllocations },
      { title: '共同採買（剩餘）', amount: 5406, participantIds: [...memberIds], splitMode: 'equal', allocations: common, isAutoRemainder: true },
    ],
    createdBy: actorId, createdAt, updatedAt: createdAt, revision: 1, history: [],
  };
  const nicknames = Object.fromEntries(memberIds.map((id) => [id, users[id].nickname]));
  const group = {
    id: groupId, name: '好市多 17 人示範', ownerUid: actorId, deputyUids: [memberIds[1], memberIds[2]], memberIds, nicknames,
    demoType: 'costco17', editPolicy: EDIT_POLICY.OWNER_ONLY, allowMemberInvites: false,
    policyHistory: [], archived: false, createdAt, lastUsedAt: createdAt,
  };
  const activity = {
    id: activityId, groupId, title: '好市多購物單', participantIds: memberIds,
    status: 'active', createdAt, auditHistory: [], memberReviewIds: [],
  };
  return { store: {
    ...store, users, groups: [...store.groups, group],
    activities: [...store.activities, activity], expenses: [...store.expenses, expense],
  }, groupId, activityId, added: true };
}
