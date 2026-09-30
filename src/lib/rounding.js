import { suggestTransfers } from './money.js';

const EPS = 1e-9;

export function buildRoundingModel(participantIds, expenses) {
  const currentShare = Object.fromEntries(participantIds.map((id)=>[id,0]));
  const fixedShare = Object.fromEntries(participantIds.map((id)=>[id,0]));
  const exactEqual = Object.fromEntries(participantIds.map((id)=>[id,0]));
  let originalTotal = 0;

  for (const expense of expenses) {
    // Only the shares of current members participate in the final-rounding choice.
    // Historical members keep their already-recorded shares exactly as they were.
    for (const id of participantIds) {
      const current = expense.allocations?.[id] || 0;
      currentShare[id] += current;
      originalTotal += current;
    }
    const lines = expense.lines?.length ? expense.lines : [{
      amount: expense.amount,
      splitMode: expense.splitMode,
      participantIds: expense.participantIds,
      allocations: expense.allocations,
    }];
    for (const line of lines) {
      const originalIds = line.participantIds || [];
      const ids = originalIds.filter((id)=>id in exactEqual);
      if (line.splitMode === 'equal' && ids.length && originalIds.length) {
        const exact = Number(line.amount || 0) / originalIds.length;
        ids.forEach((id)=>{ exactEqual[id] += exact; });
      } else {
        for (const id of participantIds) fixedShare[id] += line.allocations?.[id] || 0;
      }
    }
  }

  const floorShare = {};
  const fractions = {};
  for (const id of participantIds) {
    const floored = Math.floor(exactEqual[id] + EPS);
    floorShare[id] = fixedShare[id] + floored;
    fractions[id] = exactEqual[id] - floored;
  }
  const floorTotal = Object.values(floorShare).reduce((s,n)=>s+n,0);
  const requiredTailUnits = Math.max(0, Math.round(originalTotal - floorTotal));
  const candidates = participantIds.filter((id)=>fractions[id] > EPS);
  return { participantIds, currentShare, fixedShare, exactEqual, floorShare, fractions, requiredTailUnits, candidates, originalTotal };
}

export function chooseBalanced(ids, count, order = ids) {
  const validOrder = order.filter((id)=>ids.includes(id));
  const rest = ids.filter((id)=>!validOrder.includes(id));
  const merged = [...validOrder, ...rest];
  return merged.slice(0, Math.min(count, merged.length));
}

export function sharesForRounding(model, config = {}) {
  const mode = config.mode || 'current';
  if (mode === 'current') return { shares: { ...model.currentShare }, extraPool: 0, tailUids: [] };
  const shares = { ...model.floorShare };
  if (mode === 'roundUp') {
    model.candidates.forEach((id)=>{ shares[id] += 1; });
    return { shares, extraPool: Math.max(0, model.candidates.length - model.requiredTailUnits), tailUids: [...model.candidates] };
  }
  const requested = mode === 'assigned' ? (config.tailUids || []) : (config.randomTailUids || []);
  const tailUids = chooseBalanced(model.candidates, model.requiredTailUnits, requested);
  tailUids.forEach((id)=>{ shares[id] += 1; });
  return { shares, extraPool: 0, tailUids };
}

export function distributePool(pool, recipientIds, order = recipientIds) {
  const allocations = Object.fromEntries(recipientIds.map((id)=>[id,0]));
  if (pool <= 0 || recipientIds.length === 0) return allocations;
  const sequence = [...order.filter((id)=>recipientIds.includes(id)), ...recipientIds.filter((id)=>!order.includes(id))];
  for (let i=0;i<pool;i+=1) allocations[sequence[i % sequence.length]] += 1;
  return allocations;
}

export function applyRoundingToBalances(baseBalances, model, config = {}) {
  const { shares, extraPool, tailUids } = sharesForRounding(model, config);
  const balances = { ...baseBalances };
  for (const id of model.participantIds) balances[id] = (balances[id] || 0) + (model.currentShare[id] || 0) - (shares[id] || 0);

  let poolAllocations = {};
  if (extraPool > 0) {
    const eligible = model.participantIds.filter((id)=>(balances[id] || 0) > 0);
    const requested = config.receiverMode === 'selected' ? (config.receiverUids || []).filter((id)=>eligible.includes(id)) : eligible;
    const recipients = requested.length ? requested : eligible;
    poolAllocations = distributePool(extraPool, recipients, config.receiverOrder || recipients);
    for (const [id, amount] of Object.entries(poolAllocations)) balances[id] = (balances[id] || 0) + amount;
  }
  const sum = Object.values(balances).reduce((s,n)=>s+n,0);
  if (sum !== 0) {
    // A malformed config should never silently generate an unbalanced settlement.
    return { balances: baseBalances, transfers: suggestTransfers(baseBalances), shares: model.currentShare, extraPool: 0, poolAllocations: {}, tailUids: [], error: '尾差設定不完整，已維持原始結算。' };
  }
  return { balances, transfers: suggestTransfers(balances), shares, extraPool, poolAllocations, tailUids, error: '' };
}
