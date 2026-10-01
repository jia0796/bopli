import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Info, Plus, Trash2 } from 'lucide-react';
import { calculateAllocation, formatMoney, splitEqualRotating } from '../lib/money.js';

const SPLIT_MODES = [
  { id: 'equal', label: '平均' },
  { id: 'custom', label: '自訂金額' },
  { id: 'ratio', label: '依比例' },
];

const ENTRY_TEMPLATE = { title:'', amount:'', participants:[], splitMode:'equal', custom:{}, ratios:{}, manualCustomIds:[], useQuantity:false, quantity:'', unitPrice:'', quantityByUid:{}, shareKind:'multi' };
const toInt = (value) => /^\d+$/.test(String(value).trim()) ? Number(value) : NaN;
const unique = (array) => [...new Set(array)];
const makePayment = (actorId, defaultAmount='') => ({ uid:actorId, amount:defaultAmount });

function emptyEntry(activity, title='') {
  return { ...ENTRY_TEMPLATE, participants:[...activity.participantIds], ratios:Object.fromEntries(activity.participantIds.map((id)=>[id,'1'])), title };
}
function normalizeEntry(entry, activity) {
  return {
    ...ENTRY_TEMPLATE,
    ...entry,
    participants:Array.isArray(entry.participants)?entry.participants:Array.isArray(entry.participantIds)?entry.participantIds:[...activity.participantIds],
    custom:entry.custom || {}, ratios:entry.ratios || Object.fromEntries(activity.participantIds.map((id)=>[id,'1'])),
    manualCustomIds:entry.manualCustomIds || [],
  };
}
function computeEntryAllocations(entry, remainderOffset=0) {
  const amount=toInt(entry.amount);
  if (entry.splitMode==='equal') return splitEqualRotating(amount, entry.participants, remainderOffset);
  if (entry.splitMode==='quantity') {
    const totalQty=toInt(entry.quantity); const unitPrice=toInt(entry.unitPrice);
    if(!Number.isSafeInteger(totalQty)||totalQty<=0||!Number.isSafeInteger(unitPrice)||unitPrice<0) throw new Error('請先完成數量與單價。');
    const allocations={}; let allocatedQty=0;
    for(const id of entry.participants){const q=toInt(entry.quantityByUid?.[id]||0)||0; allocations[id]=q*unitPrice; allocatedQty+=q;}
    if(allocatedQty!==totalQty) throw new Error(`購買數量還差 ${Math.abs(totalQty-allocatedQty)} 件${allocatedQty>totalQty?'（已超出）':''}。`);
    if(Object.values(allocations).reduce((a,b)=>a+b,0)!==amount) throw new Error('數量分攤與商品總額不一致。');
    return allocations;
  }
  const customAmounts=Object.fromEntries(entry.participants.map((id)=>[id,entry.custom?.[id]===''?NaN:Number(entry.custom?.[id] ?? '')]));
  return calculateAllocation({ amount, participantIds:entry.participants, splitMode:entry.splitMode, customAmounts, ratios:entry.ratios || {} });
}
function mergeAllocations(lines, allParticipants) {
  const merged=Object.fromEntries(allParticipants.map((id)=>[id,0]));
  for (const line of lines) for (const [id,amount] of Object.entries(line.allocations)) merged[id]=(merged[id]||0)+amount;
  return merged;
}
function sumPayments(payments) { return payments.reduce((sum,item)=>sum+(toInt(item.amount||0)||0),0); }

function ParticipantsPicker({ ids, users, selected, onChange }) {
  return <div className="participant-picker-block">
    <div className="picker-actions"><button type="button" onClick={()=>onChange([...ids])}>全選</button><button type="button" onClick={()=>onChange([])}>清除選取</button></div>
    <div className="chip-list">{ids.map((id)=>{ const checked=selected.includes(id); return <button key={id} type="button" className={`member-chip ${checked?'selected':''}`} aria-pressed={checked} onClick={()=>onChange(checked?selected.filter((x)=>x!==id):unique([...selected,id]))}><span className="chip-avatar">{users[id]?.nickname?.slice(0,1)}</span>{users[id]?.nickname}{checked&&<Check size={13}/>}</button>; })}</div>
  </div>;
}

function AllocationEditor({ entry, users, allIds, onChange, remainderOffset=0 }) {
  const amount=toInt(entry.amount);
  const manualIds=entry.manualCustomIds || [];
  const customSum=entry.participants.reduce((sum,id)=>sum+(toInt(entry.custom?.[id]||0)||0),0);
  const diff=Number.isSafeInteger(amount)?amount-customSum:0;

  function changeMode(mode) {
    if (mode==='custom' && entry.splitMode!=='custom' && Number.isSafeInteger(amount) && amount>0 && entry.participants.length) {
      try {
        const allocations=splitEqualRotating(amount,entry.participants,remainderOffset);
        onChange({...entry,splitMode:mode,custom:Object.fromEntries(Object.entries(allocations).map(([uid,value])=>[uid,String(value)])),manualCustomIds:[]});
        return;
      } catch { /* incomplete amount */ }
    }
    onChange({...entry,splitMode:mode});
  }

  function redistributeUntouched() {
    if (!Number.isSafeInteger(amount) || !entry.participants.length) return;
    const untouched=entry.participants.filter((id)=>!manualIds.includes(id));
    if (!untouched.length) return;
    const lockedTotal=entry.participants.filter((id)=>manualIds.includes(id)).reduce((sum,id)=>sum+(toInt(entry.custom?.[id]||0)||0),0);
    const remaining=amount-lockedTotal;
    if (remaining<0) return;
    const allocation=remaining===0?Object.fromEntries(untouched.map((id)=>[id,0])):splitEqualRotating(remaining,untouched,remainderOffset);
    onChange({...entry,custom:{...entry.custom,...Object.fromEntries(Object.entries(allocation).map(([id,value])=>[id,String(value)]))}});
  }

  const modes=entry.useQuantity?[...SPLIT_MODES,{id:'quantity',label:'依購買數量'}]:SPLIT_MODES;
  return <div className="split-editor-page-body">
    <div className="field"><span>一起分帳的人</span><div className="selected-count-line"><strong>已選 {entry.participants.length} 人</strong><small>全選會包含目前活動所有參與者</small></div><ParticipantsPicker ids={allIds} users={users} selected={entry.participants} onChange={(participants)=>onChange({...entry,participants})}/></div>
    <div className="field"><span>怎麼分</span><div className="segmented" role="group">{modes.map((mode)=><button key={mode.id} type="button" className={entry.splitMode===mode.id?'active':''} onClick={()=>changeMode(mode.id)}>{mode.label}</button>)}</div></div>
    {entry.splitMode==='custom'&&<div className="allocation-fields">
      <div className="custom-diff-row"><span>{diff===0?'已分配完成':diff>0?`還有 ${formatMoney(diff)} 未分配`:`超出 ${formatMoney(Math.abs(diff))}`}</span><button type="button" disabled={!entry.participants.some((id)=>!manualIds.includes(id)) || diff<0} onClick={redistributeUntouched}>平均分配給未修改成員</button></div>
      {entry.participants.map((id)=><label className="allocation-row" key={id}><span>{users[id]?.nickname}{manualIds.includes(id)&&<small className="manual-badge">已修改</small>}</span><div className="allocation-input"><small>NT$</small><input inputMode="numeric" value={entry.custom?.[id] ?? ''} onChange={(e)=>onChange({...entry,custom:{...entry.custom,[id]:e.target.value},manualCustomIds:unique([...manualIds,id])})}/></div></label>)}
    </div>}
    {entry.splitMode==='quantity'&&<div className="allocation-fields"><div className="custom-diff-row"><span>共 {entry.quantity || 0} 件</span><span>每人空白視為 0</span></div>{entry.participants.map((id)=><label className="allocation-row" key={id}><span>{users[id]?.nickname}</span><div className="allocation-input"><input inputMode="numeric" placeholder="0" value={entry.quantityByUid?.[id] ?? ''} onChange={(e)=>onChange({...entry,quantityByUid:{...(entry.quantityByUid||{}),[id]:e.target.value}})}/><small>件</small></div></label>)}</div>}
    {entry.splitMode==='ratio'&&<div className="allocation-fields">{entry.participants.map((id)=><label className="allocation-row" key={id}><span>{users[id]?.nickname}</span><div className="allocation-input"><input inputMode="decimal" value={entry.ratios?.[id] ?? '1'} onChange={(e)=>onChange({...entry,ratios:{...entry.ratios,[id]:e.target.value}})}/></div></label>)}</div>}
  </div>;
}

function QuantityAmountFields({ entry, onChange }) {
  function toggle(){
    if(entry.useQuantity){onChange({...entry,useQuantity:false});return;}
    const current=toInt(entry.amount);
    onChange({...entry,useQuantity:true,quantity:entry.quantity||'1',unitPrice:entry.unitPrice||(Number.isSafeInteger(current)&&current>0?String(current):'')});
  }
  function updateQty(patch){
    const next={...entry,...patch,useQuantity:true}; const q=toInt(next.quantity); const p=toInt(next.unitPrice);
    if(Number.isSafeInteger(q)&&q>0&&Number.isSafeInteger(p)&&p>=0) next.amount=String(q*p);
    onChange(next);
  }
  return <><label className="field"><span>商品總額</span><div className="money-field compact"><span>NT$</span><input inputMode="numeric" value={entry.amount} readOnly={entry.useQuantity} onChange={(e)=>onChange({...entry,amount:e.target.value})}/></div></label><button type="button" className="text-action-button" onClick={toggle}>{entry.useQuantity?'收合數量 × 單價':'＋ 數量 × 單價'}</button>{entry.useQuantity&&<div className="quantity-grid"><label className="field"><span>數量</span><input inputMode="numeric" value={entry.quantity} onChange={(e)=>updateQty({quantity:e.target.value})}/></label><label className="field"><span>單價</span><div className="money-field compact"><span>NT$</span><input inputMode="numeric" value={entry.unitPrice} onChange={(e)=>updateQty({unitPrice:e.target.value})}/></div></label></div>}</>;
}

export default function ExpenseForm({ activity, users, actorId, expense, draft=null, remainderOffset=0, onClose, onSave, onDraft }) {
  const participantUsers=useMemo(()=>Object.fromEntries(activity.participantIds.map((id)=>[id,users[id]])),[activity.participantIds,users]);
  const seed=expense || draft?.snapshot || null;
  const draftKey=React.useRef(draft?.id || globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [expenseType,setExpenseType]=useState(seed?.expenseType || 'simple');
  const [title,setTitle]=useState(seed?.title || '');
  const [payments,setPayments]=useState(()=>seed?.payments?.length?seed.payments.map((item)=>({uid:item.uid,amount:String(item.amount)})):[makePayment(seed?.paidBy || actorId, seed?.amount?String(seed.amount):'')]);
  const [showChange,setShowChange]=useState(Boolean(seed?.showChange || seed?.change?.amount));
  const [changeAmount,setChangeAmount]=useState(seed?.changeAmount!=null?String(seed.changeAmount):seed?.change?.amount?String(seed.change.amount):'');
  const [changeReceiverUid,setChangeReceiverUid]=useState(seed?.changeReceiverUid || seed?.change?.receiverUid || payments[0]?.uid || actorId);
  const grossPaid=sumPayments(payments); const changeNumber=showChange?(toInt(changeAmount)||0):0; const amountNumber=Math.max(0,grossPaid-changeNumber); const amount=String(amountNumber||'');

  const [simpleEntry,setSimpleEntry]=useState(()=>seed?.simpleEntry?normalizeEntry(seed.simpleEntry,activity):normalizeEntry({...emptyEntry(activity),amount:seed?String(seed.amount||''):'',participants:seed?.participantIds||[...activity.participantIds],splitMode:seed?.splitMode||'equal',custom:Object.fromEntries(activity.participantIds.map((id)=>[id,seed?.customAmounts?.[id]??''])),ratios:Object.fromEntries(activity.participantIds.map((id)=>[id,seed?.ratios?.[id]??'1']))},activity));
  const [shoppingMode,setShoppingMode]=useState(seed?.shoppingMode || 'quick');
  const [commonParticipants,setCommonParticipants]=useState(seed?.commonParticipants || [...activity.participantIds]);
  const [specialEntries,setSpecialEntries]=useState(()=>seed?.specialEntries?seed.specialEntries.map((e)=>normalizeEntry(e,activity)):seed?.expenseType==='shopping'&&seed?.shoppingMode==='quick'&&seed?.lines?.length?seed.lines.filter((line)=>!line.isAutoRemainder).map((line)=>normalizeEntry({...line,amount:String(line.amount),participants:[...(line.participantIds||[])],custom:Object.fromEntries(Object.entries(line.allocations||{}).map(([id,value])=>[id,String(value)]))},activity)):[emptyEntry(activity)]);
  const [fullEntries,setFullEntries]=useState(()=>seed?.fullEntries?seed.fullEntries.map((e)=>normalizeEntry(e,activity)):seed?.expenseType==='shopping'&&seed?.shoppingMode==='full'&&seed?.lines?.length?seed.lines.map((line)=>normalizeEntry({...line,amount:String(line.amount),participants:[...(line.participantIds||[])],custom:Object.fromEntries(Object.entries(line.allocations||{}).map(([id,value])=>[id,String(value)]))},activity)):[emptyEntry(activity)]);
  const [splitTarget,setSplitTarget]=useState(seed?.splitTarget || null);
  const [error,setError]=useState('');

  // Keep the simple split amount synchronized with the auto-calculated payment total until the user switches to shopping mode.
  React.useEffect(()=>{ if (expenseType==='simple') setSimpleEntry((prev)=>({...prev,amount})); },[amount,expenseType]);

  const preview=useMemo(()=>{
    try {
      if (!title.trim() || !Number.isSafeInteger(amountNumber) || amountNumber<=0) return {allocations:null,lines:[],hint:''};
      if (expenseType==='simple') {
        const entry={...simpleEntry,amount}; const allocations=computeEntryAllocations(entry,remainderOffset);
        return {allocations,lines:[{title:title.trim(),amount:amountNumber,participantIds:[...entry.participants],splitMode:entry.splitMode,allocations}],hint:''};
      }
      if (shoppingMode==='quick') {
        const lines=[]; let specialTotal=0;
        specialEntries.filter((e)=>e.title.trim()||e.amount).forEach((entry,index)=>{ const itemAmount=toInt(entry.amount); if(!Number.isSafeInteger(itemAmount)||itemAmount<=0) throw new Error(`特殊商品 ${index+1} 金額不完整。`); const allocations=computeEntryAllocations(entry,remainderOffset+index); lines.push({title:entry.title.trim()||`特殊商品 ${index+1}`,amount:itemAmount,participantIds:[...entry.participants],splitMode:entry.splitMode,allocations}); specialTotal+=itemAmount; });
        const remainder=amountNumber-specialTotal; if(remainder<0) throw new Error(`特殊商品超出總額 ${formatMoney(Math.abs(remainder))}。`); if(remainder>0){ if(!commonParticipants.length) throw new Error('剩餘共同採買至少要選一位成員。'); const allocations=splitEqualRotating(remainder,commonParticipants,remainderOffset+specialEntries.length); lines.push({title:'共同採買（剩餘）',amount:remainder,participantIds:[...commonParticipants],splitMode:'equal',allocations,isAutoRemainder:true}); }
        return {allocations:mergeAllocations(lines,activity.participantIds),lines,hint:`剩餘共同採買 ${formatMoney(Math.max(0,remainder))}`};
      }
      const lines=fullEntries.map((entry,index)=>{ const itemAmount=toInt(entry.amount); if(!entry.title.trim()||!Number.isSafeInteger(itemAmount)||itemAmount<=0) throw new Error(`品項 ${index+1} 尚未完成。`); const allocations=computeEntryAllocations(entry,remainderOffset+index); return {title:entry.title.trim(),amount:itemAmount,participantIds:[...entry.participants],splitMode:entry.splitMode,allocations}; });
      const total=lines.reduce((s,l)=>s+l.amount,0); if(total!==amountNumber) throw new Error(`商品還${total<amountNumber?'差':'超出'} ${formatMoney(Math.abs(amountNumber-total))}。`);
      return {allocations:mergeAllocations(lines,activity.participantIds),lines,hint:'完整品項模式'};
    } catch(err){ return {allocations:null,lines:[],hint:err.message,error:err.message}; }
  },[title,amountNumber,amount,expenseType,simpleEntry,shoppingMode,specialEntries,commonParticipants,fullEntries,activity.participantIds,remainderOffset]);

  React.useEffect(()=>{
    if(expense || !onDraft) return undefined;
    const hasContent=Boolean(title.trim()) || payments.some((p)=>String(p.amount||'').trim()) || specialEntries.some((e)=>e.title.trim()||e.amount) || fullEntries.some((e)=>e.title.trim()||e.amount);
    if(!hasContent) return undefined;
    const timer=setTimeout(()=>{
      const snapshot={expenseType,title,payments,showChange,changeAmount,changeReceiverUid,simpleEntry,shoppingMode,commonParticipants,specialEntries,fullEntries,splitTarget,amount:amountNumber,status:preview.allocations?'付款與分攤已完成':preview.error||'分攤尚未確認'};
      onDraft(snapshot,draftKey.current);
    },450);
    return()=>clearTimeout(timer);
  },[expense,onDraft,title,payments,showChange,changeAmount,changeReceiverUid,simpleEntry,shoppingMode,commonParticipants,specialEntries,fullEntries,splitTarget,amountNumber,preview.allocations,preview.error,expenseType]);

  function updatePayment(index,patch){ setPayments((prev)=>prev.map((item,i)=>i===index?{...item,...patch}:item)); }
  function getSplitTarget(){ if(!splitTarget)return null; if(splitTarget.kind==='simple')return simpleEntry; if(splitTarget.kind==='special')return specialEntries[splitTarget.index]; return fullEntries[splitTarget.index]; }
  function setSplitEntry(next){ if(splitTarget.kind==='simple')setSimpleEntry(next); else if(splitTarget.kind==='special')setSpecialEntries((prev)=>prev.map((item,i)=>i===splitTarget.index?next:item)); else setFullEntries((prev)=>prev.map((item,i)=>i===splitTarget.index?next:item)); }
  function splitSummary(entry){ return `${entry.participants.length} 人${entry.splitMode==='equal'?'平均分攤':entry.splitMode==='custom'?'自訂金額':entry.splitMode==='quantity'?'依購買數量':'依比例'}`; }

  function submit(event){
    event.preventDefault();
    if(!title.trim()) return setError('請輸入支出名稱或購物單名稱。');
    if(!Number.isSafeInteger(amountNumber)||amountNumber<=0) return setError('請先輸入付款金額；總額會由付款扣除找零自動計算。');
    if(payments.some((item)=>!item.uid || !Number.isSafeInteger(toInt(item.amount)) || toInt(item.amount)<=0)) return setError('請確認每位付款人的金額。');
    if(showChange && (!Number.isSafeInteger(toInt(changeAmount)) || toInt(changeAmount)<0)) return setError('請確認找零金額。');
    if(!preview.allocations) return setError(preview.error || '請完成分攤設定。');
    const payload={title:title.trim(),amount:amountNumber,expenseType,paidBy:payments[0].uid,payments:payments.map((p)=>({uid:p.uid,amount:toInt(p.amount)})),change:showChange&&changeNumber>0?{amount:changeNumber,receiverUid:changeReceiverUid}:null,participantIds:activity.participantIds.filter((id)=>preview.allocations[id]>0),splitMode:expenseType==='simple'?simpleEntry.splitMode:'shopping',customAmounts:expenseType==='simple'&&simpleEntry.splitMode==='custom'?Object.fromEntries(simpleEntry.participants.map((id)=>[id,Number(simpleEntry.custom?.[id]||0)])):{},ratios:expenseType==='simple'&&simpleEntry.splitMode==='ratio'?Object.fromEntries(simpleEntry.participants.map((id)=>[id,simpleEntry.ratios?.[id]||'1'])):{},allocations:preview.allocations,shoppingMode:expenseType==='shopping'?shoppingMode:null,commonParticipants:expenseType==='shopping'?[...commonParticipants]:null,lines:preview.lines};
    onSave(payload,draftKey.current);
  }

  function toEditableEntry(line){ return normalizeEntry({...line,amount:String(line.amount),participants:[...(line.participantIds||[])],custom:Object.fromEntries(Object.entries(line.allocations||{}).map(([id,value])=>[id,String(value)]))},activity); }
  function switchShoppingMode(nextMode){ if(nextMode===shoppingMode)return; const targetLooksEmpty=nextMode==='full'?fullEntries.length===1&&!fullEntries[0].title&&!fullEntries[0].amount:specialEntries.length===1&&!specialEntries[0].title&&!specialEntries[0].amount; if(targetLooksEmpty&&preview.allocations&&preview.lines.length){ if(nextMode==='full')setFullEntries(preview.lines.map(toEditableEntry)); else { const remainder=preview.lines.find((line)=>line.isAutoRemainder); setSpecialEntries(preview.lines.filter((line)=>!line.isAutoRemainder).map(toEditableEntry)); if(remainder)setCommonParticipants([...(remainder.participantIds||[])]); } } setError(''); setShoppingMode(nextMode); }

  const targetEntry=getSplitTarget();
  if(splitTarget&&targetEntry) return <div className="modal-overlay"><section className="modal modal-form split-settings-modal"><div className="modal-top"><button className="icon-button" type="button" onClick={()=>setSplitTarget(null)}><ArrowLeft size={21}/></button><h2>誰一起分？</h2><span className="modal-top-spacer"/></div><AllocationEditor entry={targetEntry} users={participantUsers} allIds={activity.participantIds} onChange={setSplitEntry} remainderOffset={remainderOffset}/><button className="primary-button full" type="button" disabled={targetEntry.participants.length===0 || (targetEntry.splitMode==='custom'&&targetEntry.participants.reduce((s,id)=>s+(toInt(targetEntry.custom?.[id]||0)||0),0)!==toInt(targetEntry.amount))} onClick={()=>setSplitTarget(null)}>完成</button></section></div>;

  const itemTotal=preview.lines.reduce((s,l)=>s+(l.amount||0),0);
  return <div className="modal-overlay" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal modal-form" role="dialog" aria-modal="true" aria-label={expense?'編輯支出':'新增支出'}>
    <div className="modal-top"><button className="icon-button" type="button" aria-label="返回" onClick={onClose}><ArrowLeft size={21}/></button><h2>{expense?'編輯支出':'新增支出'}</h2><span className="modal-top-spacer"/></div>
    <form onSubmit={submit} className="form-stack">
      <label className="field"><span>{expenseType==='shopping'?'購物單名稱':'支出名稱'}</span><input value={title} maxLength={40} onChange={(e)=>setTitle(e.target.value)} placeholder={expenseType==='shopping'?'例如：好市多、全聯':'例如：晚餐、停車費'} autoFocus/></label>

      <div className="card-section-title">誰付的？</div>
      <div className="subcard-stack simple-payment-block">
        <div className="payment-row"><select value={payments[0]?.uid||actorId} onChange={(e)=>updatePayment(0,{uid:e.target.value})}>{activity.participantIds.map((id)=><option key={id} value={id}>{users[id]?.nickname}</option>)}</select><div className="money-field compact"><span>NT$</span><input inputMode="numeric" value={payments[0]?.amount||''} placeholder="0" onChange={(e)=>updatePayment(0,{amount:e.target.value})}/></div></div>
        <div className="auto-total-box"><span>這筆支出</span><strong>{formatMoney(amountNumber)}</strong>{showChange&&changeNumber>0&&<small>已扣除找零 {formatMoney(changeNumber)}</small>}</div>
      </div>

      {expenseType==='simple'&&<button type="button" className="split-summary-card" onClick={()=>setSplitTarget({kind:'simple'})}><span><small>一起分</small><strong>{splitSummary(simpleEntry)}</strong></span><span>調整 <ChevronRight size={17}/></span></button>}

      <details className="disclosure expense-more-options" defaultOpen={expenseType==='shopping'||payments.length>1||showChange}>
        <summary>更多記帳方式</summary>
        <div className="advanced-expense-options">
          <div className="field"><span>記帳類型</span><div className="segmented"><button type="button" className={expenseType==='simple'?'active':''} onClick={()=>setExpenseType('simple')}>一般支出</button><button type="button" className={expenseType==='shopping'?'active':''} onClick={()=>setExpenseType('shopping')}>購物單分帳</button></div></div>
          {payments.slice(1).map((item,offset)=>{const index=offset+1;return <div className="payment-row" key={index}><select value={item.uid} onChange={(e)=>updatePayment(index,{uid:e.target.value})}>{activity.participantIds.map((id)=><option key={id} value={id}>{users[id]?.nickname}</option>)}</select><div className="money-field compact"><span>NT$</span><input inputMode="numeric" value={item.amount} placeholder="0" onChange={(e)=>updatePayment(index,{amount:e.target.value})}/></div><button type="button" className="icon-button subtle-button" aria-label="刪除付款人" onClick={()=>setPayments((prev)=>prev.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>})}
          <button type="button" className="outline-button full" onClick={()=>setPayments((prev)=>[...prev,makePayment(activity.participantIds[0])])}><Plus size={16}/>多人付款</button>
          {!showChange?<button type="button" className="text-action-button" onClick={()=>setShowChange(true)}>＋ 有找零</button>:<div className="payment-row payment-change-row"><div className="money-field compact"><span>找零</span><input inputMode="numeric" value={changeAmount} onChange={(e)=>setChangeAmount(e.target.value)} placeholder="0"/></div><select value={changeReceiverUid} onChange={(e)=>setChangeReceiverUid(e.target.value)}>{activity.participantIds.map((id)=><option key={id} value={id}>{users[id]?.nickname} 收到</option>)}</select></div>}
        </div>
      </details>

      {expenseType==='shopping'&&<div className="sub-form-box"><div className="field"><span>購物單模式</span><div className="segmented"><button type="button" className={shoppingMode==='quick'?'active':''} onClick={()=>switchShoppingMode('quick')}>快速分攤</button><button type="button" className={shoppingMode==='full'?'active':''} onClick={()=>switchShoppingMode('full')}>完整品項</button></div></div>
        {shoppingMode==='quick'?<><div className="field"><span>共同採買成員</span><div className="selected-count-line"><strong>已選 {commonParticipants.length} 人</strong><small>剩餘金額自動平均</small></div><ParticipantsPicker ids={activity.participantIds} users={users} selected={commonParticipants} onChange={setCommonParticipants}/></div>{specialEntries.map((entry,index)=><div className="shopping-entry" key={index}><div className="entry-head"><strong>特殊商品 {index+1}</strong>{specialEntries.length>1&&<button type="button" className="text-button danger-text" onClick={()=>setSpecialEntries((prev)=>prev.filter((_,i)=>i!==index))}>移除</button>}</div><label className="field"><span>商品名稱</span><input value={entry.title} onChange={(e)=>setSpecialEntries((prev)=>prev.map((item,i)=>i===index?{...item,title:e.target.value}:item))} placeholder="例如：私人商品、檸檬酒"/></label><QuantityAmountFields entry={entry} onChange={(next)=>setSpecialEntries((prev)=>prev.map((item,i)=>i===index?next:item))}/><div className="field"><span>商品類型</span><div className="segmented"><button type="button" className={entry.shareKind==='private'?'active':''} onClick={()=>setSpecialEntries((prev)=>prev.map((item,i)=>i===index?{...item,shareKind:'private',participants:[item.participants?.[0]||activity.participantIds[0]],splitMode:'equal'}:item))}>私人商品</button><button type="button" className={entry.shareKind!=='private'?'active':''} onClick={()=>setSpecialEntries((prev)=>prev.map((item,i)=>i===index?{...item,shareKind:'multi'}:item))}>多人分攤</button></div></div>{entry.shareKind==='private'?<label className="field"><span>由誰負擔</span><select value={entry.participants?.[0]||activity.participantIds[0]} onChange={(e)=>setSpecialEntries((prev)=>prev.map((item,i)=>i===index?{...item,participants:[e.target.value],splitMode:'equal'}:item))}>{activity.participantIds.map((id)=><option key={id} value={id}>{users[id]?.nickname}</option>)}</select></label>:<button type="button" className="split-summary-card compact-split" onClick={()=>setSplitTarget({kind:'special',index})}><span><small>分攤</small><strong>{splitSummary(entry)}</strong></span><span>變更 <ChevronRight size={16}/></span></button>}</div>)}<button type="button" className="outline-button full" onClick={()=>setSpecialEntries((prev)=>[...prev,emptyEntry(activity)])}><Plus size={16}/>新增特殊商品</button></>:<>{fullEntries.map((entry,index)=><div className="shopping-entry" key={index}><div className="entry-head"><strong>品項 {index+1}</strong>{fullEntries.length>1&&<button type="button" className="text-button danger-text" onClick={()=>setFullEntries((prev)=>prev.filter((_,i)=>i!==index))}>移除</button>}</div><label className="field"><span>商品名稱</span><input value={entry.title} onChange={(e)=>setFullEntries((prev)=>prev.map((item,i)=>i===index?{...item,title:e.target.value}:item))}/></label><QuantityAmountFields entry={entry} onChange={(next)=>setFullEntries((prev)=>prev.map((item,i)=>i===index?next:item))}/><button type="button" className="split-summary-card compact-split" onClick={()=>setSplitTarget({kind:'full',index})}><span><small>分攤</small><strong>{splitSummary(entry)}</strong></span><span>變更 <ChevronRight size={16}/></span></button></div>)}<button type="button" className="outline-button full" onClick={()=>setFullEntries((prev)=>[...prev,emptyEntry(activity)])}><Plus size={16}/>新增品項</button></>}
      </div>}

      <div className="reconcile-compact"><div className="reconcile-line ok"><Check size={15}/><span>付款／找零</span><strong>{formatMoney(amountNumber)}</strong></div>{expenseType==='shopping'&&<div className={`reconcile-line ${preview.error?'warn':'ok'}`}>{preview.error?<Info size={15}/>:<Check size={15}/>}<span>商品金額</span><strong>{preview.error?preview.error:formatMoney(itemTotal)}</strong></div>}<div className={`reconcile-line ${preview.allocations?'ok':'warn'}`}>{preview.allocations?<Check size={15}/>:<Info size={15}/>}<span>分攤</span><strong>{preview.allocations?'完成':'尚未完成'}</strong></div></div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="primary-button full" type="submit" disabled={!preview.allocations}>{expense?'儲存修改':'儲存支出'}</button>
      {!expense&&<p className="autosave-note">輸入內容會保留為草稿；草稿不計入活動總額或結算。</p>}
    </form>
  </section></div>;
}
