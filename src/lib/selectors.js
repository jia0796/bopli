export function indexBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function buildStoreIndexes(data) {
  const activitiesByGroupId = indexBy(data.activities || [], (a) => a.groupId);
  const expensesByActivityId = indexBy(data.expenses || [], (e) => e.activityId);
  const settlementsByActivityId = indexBy(data.settlements || [], (s) => s.activityId);
  const groupById = new Map((data.groups || []).map((g) => [g.id, g]));
  const activityById = new Map((data.activities || []).map((a) => [a.id, a]));
  return { activitiesByGroupId, expensesByActivityId, settlementsByActivityId, groupById, activityById };
}

export const itemsFor = (map, key) => map.get(key) || [];
