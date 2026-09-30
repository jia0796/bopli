import { splitEqual } from './money.js';
import { EDIT_POLICY } from './domain.js';

export const STORAGE_KEY = 'bopli-test-2.2-v1';
const ONE_TIME_RESET_KEY = 'bopli-test-2.2-reset-once-20260930';
export const now = () => new Date().toISOString();
export const makeId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function freshStore() {
  return {
    version: 22,
    currentUserId: null,
    account: { googleLinked: false, googleEmail: '', backupPromptSeen: false, primaryUserId: '', testIdentityIds: [] },
    users: {},
    groups: [],
    activities: [],
    expenses: [],
    settlements: [],
    drafts: [],
    notifications: [],
  };
}

function normalizeGroup(group) {
  return {
    deputyUids: [],
    nicknames: {},
    allowMemberInvites: false,
    editPolicy: EDIT_POLICY.OWNER_ONLY,
    policyHistory: [],
    archived: false,
    lastUsedAt: group.createdAt || now(),
    ...group,
  };
}

function normalizeActivity(activity) {
  return {
    status: 'active',
    auditHistory: [],
    memberReviewIds: [],
    ...activity,
  };
}

export function loadStore() {
  try {
    // One-time reset requested specifically for bopli_test.2.2.
    // The marker prevents refreshes and later updates from repeatedly deleting data.
    if (localStorage.getItem(ONE_TIME_RESET_KEY) !== 'done') {
      ['bopli-2.1-v1', 'bopli-2.1.1-v1', 'bopli-test-2.2-v1'].forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(ONE_TIME_RESET_KEY, 'done');
    }
    const item = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (item?.version === 22 && item.users && Array.isArray(item.groups) &&
      Array.isArray(item.activities) && Array.isArray(item.expenses) && Array.isArray(item.settlements)) {
      return {
        ...freshStore(),
        ...item,
        account: {
          ...freshStore().account,
          ...(item.account || {}),
          testIdentityIds: Array.isArray(item.account?.testIdentityIds) ? item.account.testIdentityIds : [],
        },
        groups: item.groups.map(normalizeGroup),
        activities: item.activities.map(normalizeActivity),
        drafts: Array.isArray(item.drafts) ? item.drafts : [],
        notifications: Array.isArray(item.notifications) ? item.notifications : [],
      };
    }
  } catch { /* Corrupted local prototype data should not crash the UI. */ }
  return freshStore();
}

export function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createGuestStore(accountName, withDemo = false) {
  const data = freshStore();
  const me = makeId();
  data.currentUserId = me;
  data.account.primaryUserId = me;
  data.users[me] = { id: me, nickname: accountName.trim(), accountName: accountName.trim(), isGuest: true, createdAt: now() };
  if (!withDemo) return data;

  const pals = ['小安', '阿哲', '小羽'].map((name) => {
    const id = makeId();
    data.users[id] = { id, nickname: name, accountName: name, isGuest: true, createdAt: now(), isDemo: true };
    return id;
  });
  const groupId = makeId();
  const memberIds = [me, ...pals];
  const nicknames = Object.fromEntries(memberIds.map((id) => [id, data.users[id].nickname]));
  data.groups.push(normalizeGroup({
    id: groupId,
    name: '週末好友',
    ownerUid: me,
    deputyUids: [pals[0]],
    memberIds,
    nicknames,
    editPolicy: EDIT_POLICY.OWNER_ONLY,
    allowMemberInvites: false,
    policyHistory: [],
    createdAt: now(),
  }));
  const tripId = makeId();
  const dinnerId = makeId();
  data.activities.push(
    normalizeActivity({ id: tripId, groupId, title: '台南兩日遊', participantIds: memberIds, status: 'active', createdAt: now() }),
    normalizeActivity({ id: dinnerId, groupId, title: '週五聚餐', participantIds: memberIds, status: 'active', createdAt: now() }),
  );
  const demoExpense = (activityId, title, amount, paidBy, participants) => ({
    id: makeId(), activityId, title, amount, paidBy, createdBy: paidBy,
    participantIds: participants, splitMode: 'equal', customAmounts: {}, ratios: {},
    allocations: splitEqual(amount, participants), change: null,
    expenseType: 'simple', createdAt: now(), updatedAt: now(), revision: 1, history: [],
  });
  data.expenses.push(
    demoExpense(tripId, '晚餐', 1800, me, memberIds),
    demoExpense(tripId, '停車費', 240, pals[0], [me, pals[0], pals[1]]),
    demoExpense(dinnerId, '下午茶', 560, pals[1], memberIds),
  );
  return data;
}
