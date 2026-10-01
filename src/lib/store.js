import { splitEqual } from './money.js';
import { EDIT_POLICY } from './domain.js';

import { STORE_SCHEMA_VERSION } from '../version.js';

export const STORAGE_KEY = 'bopli-test-2.4-v1';
export const LEGACY_STORAGE_KEYS = ['bopli-test-2.3-v1', 'bopli-test-2.2-v1', 'bopli-2.1.1-v1', 'bopli-2.1-v1'];
export const RESET_MARKER_KEY = 'bopli-test-2.4-reset-once-20261001';
export const now = () => new Date().toISOString();
export const makeId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function freshStore() {
  return {
    version: STORE_SCHEMA_VERSION,
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

function isUsableStore(item) {
  return Boolean(item?.users && Array.isArray(item.groups) && Array.isArray(item.activities) &&
    Array.isArray(item.expenses) && Array.isArray(item.settlements));
}

export function migrateStore(item) {
  if (!isUsableStore(item)) return null;
  if (Number.isInteger(item.version) && item.version > STORE_SCHEMA_VERSION) return item;
  return {
    ...freshStore(),
    ...item,
    version: STORE_SCHEMA_VERSION,
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

function readStoreKey(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return migrateStore(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadStore() {
  // User-requested one-time reset for bopli_test.2.4. The marker prevents
  // refreshes from wiping newly created 2.4 data again.
  const resetDone = localStorage.getItem(RESET_MARKER_KEY) === '1';
  if (!resetDone) {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      try { localStorage.removeItem(key); } catch { /* best effort */ }
    }
    try { localStorage.setItem(RESET_MARKER_KEY, '1'); } catch { /* persistence layer reports future writes */ }
    return freshStore();
  }

  const current = readStoreKey(STORAGE_KEY);
  if (current) return current;
  return freshStore();
}

export function saveStore(data) {
  if (Number.isInteger(data?.version) && data.version > STORE_SCHEMA_VERSION) {
    throw new Error(`資料版本 ${data.version} 比目前支援的 ${STORE_SCHEMA_VERSION} 更新，已停止覆寫以保護資料。`);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
    const message = quota
      ? '本機儲存空間已滿，本次變更尚未安全寫入。'
      : '本機資料儲存失敗，本次變更可能尚未安全寫入。';
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.code = quota ? 'STORAGE_QUOTA_EXCEEDED' : 'STORAGE_WRITE_FAILED';
    throw wrapped;
  }
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
