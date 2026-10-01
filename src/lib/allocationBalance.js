/** Reconcile integer expense rows with cumulative exact equal shares.
 * Every row keeps its total and each allocation stays floor/ceil of its original
 * fraction. Fixed splits and any row involving exited members are untouched.
 */
export function balanceActivityAllocations(participantIds, expenses) {
  const members=new Set(participantIds);
  const rows=[];
  const fractions=Object.fromEntries(participantIds.map(id=>[id,0]));
  const lineLists=expenses.map(expense=>expense.lines?.length?expense.lines:[expense]);
  lineLists.forEach((lines,expenseIndex)=>lines.forEach((line,lineIndex)=>{
    const ids=line.participantIds||[];
    if(line.splitMode!=='equal'||!ids.length||ids.some(id=>!members.has(id)))return;
    const floor=Math.floor(line.amount/ids.length);
    const remainder=line.amount%ids.length;
    if(!remainder)return;
    ids.forEach(id=>{fractions[id]+=remainder/ids.length;});
    rows.push({expenseIndex,lineIndex,ids,floor,remainder});
  }));
  if(!rows.length)return expenses;

  // Min-cost flow: fill each person's cumulative floor quota first, then choose
  // feasible +1 quotas by largest fraction. Row edges enforce per-expense totals.
  const source=0, memberStart=1+rows.length, sink=memberStart+participantIds.length;
  const graph=Array.from({length:sink+1},()=>[]);
  function edge(from,to,capacity,cost) {
    const forward={to,capacity,cost,reverse:graph[to].length};
    const backward={to:from,capacity:0,cost:-cost,reverse:graph[from].length};
    graph[from].push(forward);graph[to].push(backward);return forward;
  }
  const nodes=Object.fromEntries(participantIds.map((id,i)=>[id,memberStart+i]));
  const quotas=[];
  let remaining=0;
  rows.forEach((row,i)=>{
    edge(source,i+1,row.remainder,0);remaining+=row.remainder;
    row.edges=Object.fromEntries(row.ids.map(id=>[id,edge(i+1,nodes[id],1,0)]));
  });
  participantIds.forEach((id,i)=>{
    const lower=Math.floor(fractions[id]+1e-7);
    const fraction=fractions[id]-lower;
    quotas.push(edge(nodes[id],sink,lower,-1e6));
    if(fraction>1e-7)edge(nodes[id],sink,1,1-fraction+i*1e-9);
  });
  while(remaining>0) {
    const distance=Array(graph.length).fill(Infinity), previous=Array(graph.length);
    const queued=Array(graph.length).fill(false), queue=[source];distance[source]=0;queued[source]=true;
    for(let head=0;head<queue.length;head++) {
      const from=queue[head];queued[from]=false;
      graph[from].forEach((e,index)=>{
        if(e.capacity>0&&distance[e.to]>distance[from]+e.cost+1e-10) {
          distance[e.to]=distance[from]+e.cost;previous[e.to]=[from,index];
          if(!queued[e.to]){queue.push(e.to);queued[e.to]=true;}
        }
      });
    }
    if(!previous[sink])throw new Error('無法平衡活動分攤尾差。');
    for(let to=sink;to!==source;) {
      const [from,index]=previous[to], e=graph[from][index];
      e.capacity--;graph[to][e.reverse].capacity++;to=from;
    }
    remaining--;
  }
  if(quotas.some(e=>e.capacity))throw new Error('活動累計分攤未達到整數下限。');
  const replacements=new Map();
  for(const row of rows) {
    const line=lineLists[row.expenseIndex][row.lineIndex];
    const allocations={...line.allocations};
    row.ids.forEach(id=>{allocations[id]=row.floor+(1-row.edges[id].capacity);});
    if(row.ids.some(id=>allocations[id]!==line.allocations?.[id]))replacements.set(`${row.expenseIndex}:${row.lineIndex}`,{...line,allocations});
  }
  return expenses.map((expense,i)=>{
    const lines=lineLists[i].map((line,j)=>replacements.get(`${i}:${j}`)||line);
    if(lines.every((line,j)=>line===lineLists[i][j]))return expense;
    if(!expense.lines?.length)return lines[0];
    const allocations=Object.fromEntries(Object.keys(expense.allocations||{}).map(id=>[id,0]));
    for(const line of lines)for(const [id,amount] of Object.entries(line.allocations||{}))allocations[id]=(allocations[id]||0)+amount;
    return {...expense,lines,allocations};
  });
}

/** Repayments and locked plans freeze historical allocation snapshots. */
export function balanceStoreAllocations(store) {
  if(store.version>24)return store;
  let expenses=store.expenses;
  for(const activity of store.activities) {
    if(activity.roundingLockedAt||(store.settlements||[]).some(s=>s.activityId===activity.id&&['pending','confirmed','disputed'].includes(s.status)))continue;
    const originals=expenses.filter(e=>e.activityId===activity.id);
    const balanced=balanceActivityAllocations(activity.participantIds||[],originals);
    const replacements=new Map(balanced.filter((e,i)=>e!==originals[i]).map(e=>[e.id,e]));
    if(replacements.size)expenses=expenses.map(e=>replacements.get(e.id)||e);
  }
  return expenses===store.expenses?store:{...store,expenses};
}
