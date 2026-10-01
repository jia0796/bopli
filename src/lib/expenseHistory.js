import { formatMoney } from './money.js';
import { expensePayments } from './ledger.js';

const mode=(m)=>({equal:'平均',custom:'自訂金額',ratio:'比例',quantity:'數量',shopping:'購物單'})[m]||m||'平均';
export function describeExpenseChanges(before = {}, after = {}, nameFor = id => id) {
  const changes=[];
  const amount=(label,a,b)=>{if(a!==b)changes.push(label+'：'+formatMoney(a)+' → '+formatMoney(b));};
  if(before.title!==after.title)changes.push('名稱：'+(before.title||'未命名')+' → '+(after.title||'未命名'));
  amount('支出總額',before.amount,after.amount);
  const paid=snapshot=>expensePayments(snapshot).reduce((map,p)=>({...map,[p.uid]:(map[p.uid]||0)+p.amount}),{});
  const bp=paid(before),ap=paid(after);
  for(const uid of new Set([...Object.keys(bp),...Object.keys(ap)]))amount(nameFor(uid)+' 付款',bp[uid]||0,ap[uid]||0);
  const bc=before.change,ac=after.change;
  if((bc?.amount||0)!==(ac?.amount||0)||bc?.receiverUid!==ac?.receiverUid)changes.push('找零：'+(bc?.amount?nameFor(bc.receiverUid)+' '+formatMoney(bc.amount):'無')+' → '+(ac?.amount?nameFor(ac.receiverUid)+' '+formatMoney(ac.amount):'無'));
  for(const uid of new Set([...Object.keys(before.allocations||{}),...Object.keys(after.allocations||{})]))amount(nameFor(uid)+' 分攤',before.allocations?.[uid]||0,after.allocations?.[uid]||0);
  if(before.splitMode!==after.splitMode)changes.push('分攤方式：'+mode(before.splitMode)+' → '+mode(after.splitMode));
  const summarize=line=>line?(line.title||line.name||'未命名商品')+' '+formatMoney(line.amount)+' · '+mode(line.splitMode)+' · '+(line.participantIds||[]).map(nameFor).join('、'):'無';
  const bl=before.lines||[],al=after.lines||[];
  for(let i=0;i<Math.max(bl.length,al.length);i++){
    if(JSON.stringify(bl[i])!==JSON.stringify(al[i]))changes.push('商品 '+(i+1)+'：'+summarize(bl[i])+' → '+summarize(al[i]));
  }
  for(const [key,label] of [['ratios','比例'],['customAmounts','自訂金額']]){
    const b=before[key]||{},a=after[key]||{};
    for(const uid of new Set([...Object.keys(b),...Object.keys(a)])){
      if(b[uid]!==a[uid])changes.push(nameFor(uid)+' '+label+'：'+(b[uid]??'未設定')+' → '+(a[uid]??'未設定'));
    }
  }
  return changes.length?changes:['更新分攤設定，總額保持不變。'];
}
