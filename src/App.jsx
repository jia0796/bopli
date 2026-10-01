import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, ArrowRight, ArrowUp, Bell, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleAlert, Copy, Crown, History, Info, Link2, LockKeyhole, LogOut, MoreHorizontal,
  Pencil, Plus, ReceiptText, Search, Settings2, ShieldCheck, Shuffle, Sparkles, UserRound,
  UserRoundPlus, UsersRound, Wallet, X,
} from 'lucide-react';
import { BrandLockup } from './components/Brand.jsx';
import { ExpenseSummary, ExpenseDetail } from './components/ExpenseViews.jsx';
import MemberLedger, { BalanceBars } from './components/MemberLedger.jsx';
import ExpenseForm from './components/ExpenseForm.jsx';
import { ConfirmModal, EmptyState, PersonAvatar } from './components/AppPrimitives.jsx';
import {
  ActivityMembers, ActivitySettings, ArchivedGroups, GroupMembers, GroupScreen, GroupSettings,
  MemberDetail, NotificationScreen, ProfileScreen,
} from './components/SecondaryScreens.jsx';
import { APP_LABEL } from './version.js';
import { activityFinance } from './lib/activityFinance.js';
import { appendCostcoDemo } from './lib/demo.js';
import { buildSettlementPlan, calculateBalances, formatMoney, splitEqualRotating, suggestTransfers } from './lib/money.js';
import {
  canEditExpense, canManageActivity, canManageFinalRounding, changeGroupPolicy, EDIT_POLICY,
  isDeputy, isOwner, setDeputy, updateExpenseWithHistory,
} from './lib/domain.js';
import { applyRoundingToBalances, buildRoundingModel } from './lib/rounding.js';
import { createGuestStore, freshStore, loadStore, makeId, now, STORAGE_KEY } from './lib/store.js';
import { useStorePersistence } from './lib/useStorePersistence.js';
import { useModalViewport } from './lib/useModalViewport.js';
import { buildStoreIndexes, itemsFor } from './lib/selectors.js';
import { activityDeletionStatus, deleteActivityCascade, deleteGroupCascade, groupDeletionStatus } from './lib/lifecycle.js';

const formattedTime = (date) => date ? new Date(date).toLocaleString('zh-TW', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const initials = (name) => (name || '?').slice(0, 1);
const sameMembers = (a=[],b=[]) => a.length===b.length && a.every((id)=>b.includes(id));
const shuffle = (items) => [...items].map((value)=>({value,key:Math.random()})).sort((a,b)=>a.key-b.key).map((x)=>x.value);
const transferRouteKey = (fromUid,toUid) => `${fromUid}→${toUid}`;
function mergeSettlementTransfers(transfers=[]) {
  const routes=new Map();
  for(const transfer of transfers){
    const key=transferRouteKey(transfer.fromUid,transfer.toUid);
    const row=routes.get(key)||{fromUid:transfer.fromUid,toUid:transfer.toUid,amount:0,manualParts:[]};
    row.amount+=transfer.amount;
    if(transfer.source==='manual'&&transfer.manualId)row.manualParts.push({id:transfer.manualId,amount:transfer.amount});
    routes.set(key,row);
  }
  return [...routes.values()];
}

function CreateGroupModal({ accountName, onClose, onSubmit }) {
  const [name,setName]=useState('');
  const [nickname,setNickname]=useState(accountName || '');
  const [error,setError]=useState('');
  const nickRef=useRef(null);
  function submit(e){e.preventDefault();const result=onSubmit(name.trim(),nickname.trim());if(result)setError(result);}
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal"><div className="modal-top"><h2>建立群組</h2><button className="icon-button" onClick={onClose}><X size={20}/></button></div><form className="form-stack" onSubmit={submit}><label className="field"><span>群組名稱</span><input autoFocus value={name} onChange={(e)=>setName(e.target.value)} placeholder="例如：週末好友"/></label><label className="field"><span>你在這個群組的暱稱</span><input ref={nickRef} value={nickname} onFocus={(e)=>e.currentTarget.select()} onChange={(e)=>setNickname(e.target.value)} placeholder="朋友看到的名字"/></label><p className="muted small">預設帶入帳號名稱；直接輸入即可覆蓋，不會公開你的帳號名稱。</p>{error&&<p className="form-error">{error}</p>}<button className="primary-button full" type="submit">建立群組</button></form></section></div>;
}

function NameModal({ title, label, placeholder='', initial='', selectAll=false, onClose, onSubmit, buttonText='確定' }) {
  const [value,setValue]=useState(initial);
  const [error,setError]=useState('');
  function submit(e){e.preventDefault();if(!value.trim())return setError('請輸入內容。');const result=onSubmit(value.trim());if(result)setError(result);}
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal"><div className="modal-top"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={20}/></button></div><form className="form-stack" onSubmit={submit}><label className="field"><span>{label}</span><input autoFocus value={value} onFocus={(e)=>selectAll&&e.currentTarget.select()} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder}/></label>{error&&<p className="form-error">{error}</p>}<button className="primary-button full" type="submit">{buttonText}</button></form></section></div>;
}

function TestMembersModal({ group, nameFor, onClose, onSubmit }) {
  const [value,setValue]=useState('');
  const [error,setError]=useState('');
  const names=value.split(/\n|,/).map((name)=>name.trim()).filter(Boolean);
  function submit(e){e.preventDefault();if(!names.length)return setError('請至少輸入一位成員暱稱。');const result=onSubmit(names);if(result)setError(result);}
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal"><div className="modal-top"><h2>新增測試成員</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div><form className="form-stack" onSubmit={submit}><label className="field"><span>成員暱稱</span><textarea autoFocus rows="5" value={value} onChange={(e)=>{setValue(e.target.value);setError('');}} placeholder={'例如：\n小安\n阿哲\n小羽'}/></label><p className="muted small">測試版可直接建立本機假成員。每行一位，也可用逗號分隔；加入群組後，再到活動成員決定是否加入既有活動。</p>{names.length>0&&<p className="field-hint"><UsersRound size={15}/>準備新增 {names.length} 位成員到「{group.name}」。</p>}{error&&<p className="form-error">{error}</p>}<button className="primary-button full" type="submit"><UserRoundPlus size={17}/>新增 {names.length||''} 位測試成員</button></form></section></div>;
}

function InviteSheet({ group, activity, canInvite, onClose, onCopy, onAddTest }) {
  const [joinActivity,setJoinActivity]=useState(Boolean(activity));
  const link=`https://bopli.local/invite/${group.id}`;
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal invite-sheet"><div className="modal-top"><h2>邀請朋友</h2><button className="icon-button" onClick={onClose}><X size={20}/></button></div>{!canInvite?<p className="field-hint"><LockKeyhole size={15}/>目前只有群主可邀請新成員。</p>:<><p className="muted small">朋友會先加入「{group.name}」群組，並自行設定群組暱稱。</p>{activity&&<label className="invite-activity-toggle"><input type="checkbox" checked={joinActivity} onChange={(e)=>setJoinActivity(e.target.checked)}/><span>同時加入「{activity.title}」活動</span></label>}<button className="primary-button full" type="button" onClick={()=>onCopy(link,joinActivity)}><Copy size={17}/>複製邀請連結</button><button className="outline-button full" type="button" onClick={()=>onCopy(link,joinActivity)}>分享邀請</button><button className="outline-button full test-member-shortcut" type="button" onClick={onAddTest}><UserRoundPlus size={16}/>測試版直接新增成員</button><p className="muted tiny-note">邀請連結需 Firebase／後端；目前測試可直接建立本機成員。</p></>}</section></div>;
}

function BatchAddMembersModal({ memberIds, nameFor, hasExpenses, hasRepayments, onClose, onSubmit }) {
  const [decisions,setDecisions]=useState(()=>Object.fromEntries(memberIds.map((id)=>[id,false])));
  const recalcCount=Object.values(decisions).filter(Boolean).length;
  const setAll=(value)=>setDecisions(Object.fromEntries(memberIds.map((id)=>[id,value&&!hasRepayments])));
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal batch-member-modal"><div className="modal-top"><h2>批次加入 {memberIds.length} 位成員</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div>{!hasExpenses?<p className="muted small">目前沒有既有支出；加入後會直接成為活動成員。</p>:<><p className="muted small">可以逐人決定是否套用到加入前的「全活動共同平均」支出。</p><div className="picker-actions"><button type="button" disabled={hasRepayments} onClick={()=>setAll(true)}>全部套用既有共同支出</button><button type="button" onClick={()=>setAll(false)}>全部維持原狀</button></div>{hasRepayments&&<p className="field-hint"><LockKeyhole size={15}/>活動已有還款紀錄，目前只能維持既有支出原狀。</p>}<div className="batch-member-list">{memberIds.map((uid)=><div className="batch-member-row" key={uid}><span><PersonAvatar name={nameFor(uid)} small/><strong>{nameFor(uid)}</strong></span><div className="segmented mini"><button type="button" className={!decisions[uid]?'active':''} onClick={()=>setDecisions((prev)=>({...prev,[uid]:false}))}>維持原狀</button><button type="button" disabled={hasRepayments} className={decisions[uid]?'active':''} onClick={()=>setDecisions((prev)=>({...prev,[uid]:true}))}>套用舊支出</button></div></div>)}</div><p className="muted tiny-note">{recalcCount} 人會套用至可安全重算的既有共同支出；其餘成員會保留「重新檢查」提醒。</p></>}<button className="primary-button full" type="button" onClick={()=>onSubmit(decisions)}>確認加入</button></section></div>;
}

function PaymentModal({ transfer, users, nameFor, onClose, onSubmit }) {
  const [amount,setAmount]=useState(String(transfer.amount));
  const [method,setMethod]=useState('transfer');
  const [other,setOther]=useState('');
  const [noteOpen,setNoteOpen]=useState(false);
  const [note,setNote]=useState('');
  const [dateOpen,setDateOpen]=useState(false);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [error,setError]=useState('');
  function submit(e){e.preventDefault();const n=Number(amount);if(!/^\d+$/.test(amount)||n<1||n>transfer.amount)return setError(`請輸入 1～${transfer.amount} 元。`);if(method==='other'&&!other.trim())return setError('請填寫其他付款方式。');onSubmit(n,method,{other:other.trim(),note:note.trim(),date:dateOpen?date:null});}
  return <div className="modal-overlay"><section className="modal small-modal payment-modal"><div className="modal-top"><h2>記錄付款</h2><button className="icon-button" onClick={onClose}><X size={20}/></button></div><div className="payment-route"><PersonAvatar name={nameFor(transfer.fromUid)} small/><ArrowRight size={18}/><PersonAvatar name={nameFor(transfer.toUid)} small/></div><p className="center-note">{nameFor(transfer.fromUid)} → {nameFor(transfer.toUid)}</p><form className="form-stack" onSubmit={submit}><label className="field"><span>付款金額</span><div className="money-field"><span>NT$</span><input value={amount} inputMode="numeric" onChange={(e)=>setAmount(e.target.value)}/></div></label><div className="field"><span>付款方式</span><div className="payment-method-grid">{[['transfer','銀行轉帳'],['cash','現金'],['mobile','行動支付'],['other','其他']].map(([id,label])=><button type="button" key={id} className={method===id?'selected':''} onClick={()=>setMethod(id)}>{label}</button>)}</div></div>{method==='other'&&<label className="field"><span>其他方式</span><input value={other} onChange={(e)=>setOther(e.target.value)} placeholder="例如：代墊抵扣"/></label>}<button type="button" className="text-action-button" onClick={()=>setDateOpen((v)=>!v)}>修改日期</button>{dateOpen&&<label className="field"><span>付款日期</span><input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></label>}<button type="button" className="text-action-button" onClick={()=>setNoteOpen((v)=>!v)}>＋ 新增備註</button>{noteOpen&&<label className="field"><span>備註</span><input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="選填"/></label>}{error&&<p className="form-error">{error}</p>}<button className="primary-button full" type="submit">記錄付款</button></form></section></div>;
}

function IssueModal({ settlement, nameFor, onClose, onSubmit }) {
  const [reason,setReason]=useState('amount'); const [note,setNote]=useState('');
  return <div className="modal-overlay"><section className="modal small-modal"><div className="modal-top"><h2>金額有問題</h2><button className="icon-button" onClick={onClose}><X size={20}/></button></div><p className="muted small">{nameFor(settlement.fromUid)} 記錄付款 {formatMoney(settlement.amount)}。收款人不能直接修改對方記錄的金額。</p><div className="issue-options">{[['amount','金額不符'],['missing','尚未收到'],['other','其他']].map(([id,label])=><button key={id} type="button" className={reason===id?'selected':''} onClick={()=>setReason(id)}>{label}</button>)}</div><label className="field"><span>補充說明（選填）</span><input value={note} onChange={(e)=>setNote(e.target.value)}/></label><button className="primary-button full" type="button" onClick={()=>onSubmit(reason,note)}>送出問題</button></section></div>;
}

function TestIdentityModal({ users, groups, actorId, primaryUserId, testIdentityIds, onClose, onSwitch, onAddIdentity, onRemoveIdentity }) {
  const rows=testIdentityIds.map((id)=>users[id]).filter(Boolean);
  const candidates=Object.values(users).filter((user)=>user.id!==primaryUserId&&!testIdentityIds.includes(user.id))
    .sort((a,b)=>(a.nickname||'').localeCompare(b.nickname||'','zh-TW'));
  const [adding,setAdding]=useState(false);
  const roleFor=(uid)=>{
    if(groups.some((g)=>g.ownerUid===uid))return'群主';
    if(groups.some((g)=>(g.deputyUids||[]).includes(uid)))return'副群主';
    if(groups.some((g)=>g.memberIds.includes(uid)))return'一般成員';
    return'已退出／歷史成員';
  };
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal test-identity-modal"><div className="modal-top"><h2>切換測試身分</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div><p className="muted small">測試身分清單不會自動加入任何成員；必須由你手動加入後才可切換。</p>
    {rows.length===0&&!adding?<div className="empty-state compact-empty"><UserRound size={23}/><h3>尚未建立測試身分</h3><p>先手動加入要模擬的成員。</p><button className="outline-button" type="button" onClick={()=>setAdding(true)}><Plus size={16}/>新增測試身分</button></div>:<>
      {rows.length>0&&<div className="test-identity-list">{rows.map((user)=><div className={`test-identity-row-wrap ${user.id===actorId?'selected':''}`} key={user.id}><button type="button" className="test-identity-row" onClick={()=>onSwitch(user.id)}><PersonAvatar name={user.nickname||user.accountName} small/><span><strong>{user.nickname||user.accountName}</strong><small>{roleFor(user.id)}</small></span>{user.id===actorId&&<Check size={16}/>}</button><button type="button" className="test-identity-remove" aria-label={`移除 ${user.nickname||user.accountName} 測試身分`} onClick={()=>onRemoveIdentity(user.id)}><X size={15}/></button></div>)}</div>}
      {!adding&&<button className="outline-button full" type="button" onClick={()=>setAdding(true)}><Plus size={16}/>新增測試身分</button>}
    </>}
    {adding&&<div className="test-identity-picker"><div className="section-heading in-card"><div><h3>選擇要加入的成員</h3><p>只會加入可切換清單，不會改變群組角色。</p></div></div>{candidates.length===0?<p className="muted small">目前沒有其他成員可加入。請先在群組中新增測試成員。</p>:candidates.map((user)=><button type="button" key={user.id} className="test-identity-candidate" onClick={()=>{onAddIdentity(user.id);setAdding(false);}}><PersonAvatar name={user.nickname||user.accountName} small/><span><strong>{user.nickname||user.accountName}</strong><small>{roleFor(user.id)}</small></span><Plus size={16}/></button>)}<button className="text-action-button" type="button" onClick={()=>setAdding(false)}>取消</button></div>}
    {actorId!==primaryUserId&&<button className="outline-button full identity-default-button" type="button" onClick={()=>onSwitch(primaryUserId)}>回到預設身分</button>}
  </section></div>;
}

function AddActivityMemberModal({ targetUid, nameFor, currentCount, hasRepayments, onClose, onConfirm }) {
  const [mode,setMode]=useState('future');
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal"><div className="modal-top"><h2>將 {nameFor(targetUid)} 加入活動</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div>
    <p className="muted small">選擇要從什麼時候開始一起分帳。</p>
    <div className="simple-choice-list">
      <button type="button" className={mode==='future'?'selected':''} onClick={()=>setMode('future')}><span className="radio-dot"/><span><strong>從現在開始</strong><small>不改動之前的支出。適合中途加入。</small></span></button>
      <button type="button" disabled={hasRepayments} className={mode==='past'?'selected':''} onClick={()=>setMode('past')}><span className="radio-dot"/><span><strong>也加入之前的共同支出</strong><small>{hasRepayments?'活動已有還款，不能重新計算過去支出。':`可安全重算的共同平均支出會改成 ${currentCount+1} 人分攤。`}</small></span></button>
    </div>
    <button className="primary-button full" type="button" onClick={()=>onConfirm(mode==='past')}>確認加入</button>
  </section></div>;
}

function RemoveActivityMemberModal({ activity, expenses, targetUid, nameFor, hasRepayments, onClose, onConfirm }) {
  const related=expenses.filter((expense)=>(expense.allocations?.[targetUid]||0)>0);
  const [mode,setMode]=useState('future');
  const [selected,setSelected]=useState([]);
  const toggle=(id)=>setSelected((prev)=>prev.includes(id)?prev.filter((x)=>x!==id):[...prev,id]);
  const choosePast=()=>{if(hasRepayments)return;setMode('past');setSelected(related.map((e)=>e.id));};
  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal remove-activity-modal"><div className="modal-top"><h2>將 {nameFor(targetUid)} 移出活動</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div>
    <p className="muted small">先選擇這次移出要影響哪些帳目。</p>
    <div className="simple-choice-list">
      <button type="button" className={mode==='future'?'selected':''} onClick={()=>{setMode('future');setSelected([]);}}><span className="radio-dot"/><span><strong>只影響之後的支出</strong><small>之前的分攤全部保留。建議大多數中途離開情況使用。</small></span></button>
      <button type="button" disabled={hasRepayments} className={mode==='past'?'selected':''} onClick={choosePast}><span className="radio-dot"/><span><strong>連過去的支出一起調整</strong><small>{hasRepayments?'活動已有還款，不能改動過去分攤。':'下一步選擇哪些舊支出不再由此人分攤。'}</small></span></button>
    </div>
    {mode==='past'&&<><div className="picker-actions"><button type="button" onClick={()=>setSelected(related.map((e)=>e.id))}>全選</button><button type="button" onClick={()=>setSelected([])}>清除選取</button></div><div className="remove-expense-list">{related.length===0?<p className="muted small">這位成員目前沒有既有分攤。</p>:related.map((expense)=><label className="remove-expense-row" key={expense.id}><input type="checkbox" checked={selected.includes(expense.id)} onChange={()=>toggle(expense.id)}/><span><strong>{expense.title}</strong><small>{selected.includes(expense.id)?'移除此人的舊分攤':'保留原本分攤'}</small></span><strong>{formatMoney(expense.allocations?.[targetUid]||0)}</strong></label>)}</div></>}
    <p className="muted tiny-note">過去的付款、墊付與還款紀錄不會被刪除。</p>
    <button className="primary-button full" type="button" onClick={()=>onConfirm(mode==='past'?selected:[])}>確認移出活動</button>
  </section></div>;
}

function redistributeRemovedShare(allocations={}, targetUid, fallbackIds=[]) {
  const original={...allocations};
  const removed=original[targetUid]||0;
  delete original[targetUid];
  if(removed<=0)return original;
  let recipients=Object.keys(original).filter((id)=>(original[id]||0)>0);
  if(!recipients.length)recipients=fallbackIds.filter((id)=>id!==targetUid);
  if(!recipients.length)return original;
  const weights=recipients.map((id)=>Math.max(0,original[id]||0));
  const weightSum=weights.reduce((a,b)=>a+b,0);
  const extras=Object.fromEntries(recipients.map((id)=>[id,0]));
  if(weightSum>0){
    const ranked=recipients.map((id,i)=>{
      const exact=removed*weights[i]/weightSum;
      const base=Math.floor(exact);
      extras[id]=base;
      return{id,remainder:exact-base,index:i};
    }).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
    let left=removed-Object.values(extras).reduce((a,b)=>a+b,0);
    for(let i=0;i<left;i+=1)extras[ranked[i%ranked.length].id]+=1;
  }else{
    const base=Math.floor(removed/recipients.length), rem=removed%recipients.length;
    recipients.forEach((id,i)=>{extras[id]=base+(i<rem?1:0);});
  }
  recipients.forEach((id)=>{original[id]=(original[id]||0)+extras[id];});
  return original;
}

function recalcExpenseRemovingMember(expense,targetUid,fallbackIds=[],actorUid=null) {
  const next={...expense};
  if(expense.lines?.length){
    next.lines=expense.lines.map((line)=>{
      if((line.allocations?.[targetUid]||0)<=0)return line;
      const lineRecipients=(line.participantIds||[]).filter((id)=>id!==targetUid);
      const allocations=redistributeRemovedShare(line.allocations,targetUid,lineRecipients.length?lineRecipients:fallbackIds);
      return {...line,allocations,participantIds:Object.keys(allocations).filter((id)=>(allocations[id]||0)>0)};
    });
    const allocations={};
    for(const line of next.lines)for(const [id,n] of Object.entries(line.allocations||{}))allocations[id]=(allocations[id]||0)+n;
    next.allocations=allocations;
    next.participantIds=Object.keys(allocations).filter((id)=>allocations[id]>0);
  }else{
    const expenseRecipients=(expense.participantIds||[]).filter((id)=>id!==targetUid);
    next.allocations=redistributeRemovedShare(expense.allocations,targetUid,expenseRecipients.length?expenseRecipients:fallbackIds);
    next.participantIds=Object.keys(next.allocations).filter((id)=>next.allocations[id]>0);
    if(expense.splitMode==='custom')next.customAmounts={...next.allocations};
    if(expense.splitMode==='ratio')next.ratios=Object.fromEntries(Object.entries(expense.ratios||{}).filter(([id])=>id!==targetUid));
  }
  next.updatedAt=now();
  next.revision=(expense.revision||1)+1;
  next.history=[...(expense.history||[]),{id:makeId(),type:'memberShareRemoved',at:now(),by:actorUid,targetUid,beforeShare:expense.allocations?.[targetUid]||0,afterShare:0}];
  return next;
}

function SwipeExpenseRow({ expense, canDelete, onOpen, onDelete, userName, actorId }) {
  const [revealed,setRevealed]=useState(false);
  const startX=useRef(0);
  function down(e){startX.current=e.clientX;}
  function up(e){const dx=e.clientX-startX.current;if(canDelete&&dx>45)setRevealed(true);else if(dx<-35)setRevealed(false);}
  return <div className={`swipe-expense-row ${revealed?'revealed':''}`}><button className="swipe-expense-delete" type="button" disabled={!canDelete} onClick={()=>onDelete(expense)}>刪除</button><div className="swipe-expense-content" onPointerDown={down} onPointerUp={up}><ExpenseSummary expense={expense} userName={userName} actorId={actorId} onClick={()=>revealed?setRevealed(false):onOpen(expense.id)}/></div></div>;
}

function SuccessFlash({ text }) {
  return <div className="success-flash"><div><CheckCircle2 size={34}/><strong>{text}</strong></div></div>;
}

function RoundingPanel({ activity, group, actorId, expenses, baseBalances, nameFor, onUpdateActivity }) {
  const model=useMemo(()=>buildRoundingModel(activity.participantIds,expenses),[activity.participantIds,expenses]);
  const config=activity.roundingConfig || {mode:'current',receiverMode:'random',randomTailUids:[],receiverOrder:[]};
  const canManage=canManageFinalRounding(group,actorId);
  const locked=Boolean(activity.roundingLockedAt);
  const result=useMemo(()=>applyRoundingToBalances(baseBalances,model,config),[baseBalances,model,config]);
  const candidateSet=new Set(model.candidates);
  const affected=activity.participantIds.filter((id)=>(baseBalances[id]||0)!==(result.balances[id]||0));
  const creditorsBefore=activity.participantIds.filter((id)=>(baseBalances[id]||0)>0);

  function update(patch){ if(!canManage||locked)return; onUpdateActivity({...activity,roundingConfig:{...config,...patch},roundingUpdatedBy:actorId}); }
  function mode(next){
    if(next==='random') update({mode:next,randomTailUids:shuffle(model.candidates).slice(0,model.requiredTailUnits)});
    else if(next==='roundUp') update({mode:next,receiverMode:'random',receiverOrder:shuffle(creditorsBefore)});
    else update({mode:next});
  }
  function toggleTail(id){ const current=config.tailUids||[]; const next=current.includes(id)?current.filter((x)=>x!==id):[...current,id]; if(next.length<=model.requiredTailUnits)update({tailUids:next}); }
  function toggleReceiver(id){ const current=config.receiverUids||[]; const next=current.includes(id)?current.filter((x)=>x!==id):[...current,id]; update({receiverUids:next,receiverOrder:shuffle(next)}); }

  return <section className="content-card rounding-panel"><div className="section-heading in-card"><div><h2>最終尾差處理</h2><p>只有群主與副群主可以決定；一般成員可查看結果。</p></div>{locked&&<span className="status-tag confirmed">已鎖定</span>}</div>
    <div className="rounding-mode-list">
      {[['current','維持目前精準結果','沿用每筆平均分攤時輪流分配的 NT$1。'],['assigned','指定必要尾差承擔者',`活動統整後需 ${model.requiredTailUnits} 個 NT$1 尾差。`],['random','隨機決定必要尾差','系統隨機選出需要多付 NT$1 的成員。'],['roundUp','全員向上補齊','有小數尾差的人全部向上補齊，多出金額分給仍需收錢的人。']].map(([id,label,desc])=><button type="button" key={id} className={`rounding-mode ${config.mode===id?'selected':''}`} disabled={!canManage||locked} onClick={()=>mode(id)}><span className="radio-dot"/><span><strong>{label}</strong><small>{desc}</small></span></button>)}
    </div>

    {config.mode==='assigned'&&<div className="rounding-config-box"><div className="selected-count-line"><strong>已選 {(config.tailUids||[]).length} / {model.requiredTailUnits} 人</strong><small>只有活動統整後仍有小數尾差的成員會出現</small></div><div className="chip-list">{model.candidates.map((id)=><button type="button" key={id} className={`member-chip ${(config.tailUids||[]).includes(id)?'selected':''}`} disabled={!canManage||locked} onClick={()=>toggleTail(id)}>{nameFor(id)} {(config.tailUids||[]).includes(id)&&<Check size={13}/>}</button>)}</div></div>}

    {config.mode==='random'&&<div className="rounding-config-box"><div className="result-row"><span>目前隨機結果</span><strong>{(config.randomTailUids||[]).map(nameFor).join('、') || '尚未產生'}</strong></div>{canManage&&!locked&&<button className="outline-button full" type="button" onClick={()=>update({randomTailUids:shuffle(model.candidates).slice(0,model.requiredTailUnits)})}><Shuffle size={16}/>重新隨機</button>}</div>}

    {config.mode==='roundUp'&&<div className="rounding-config-box"><div className="rounding-extra"><span>全員向上補齊後多出</span><strong>{formatMoney(result.extraPool)}</strong></div><div className="field"><span>多出金額分配</span><div className="segmented"><button type="button" disabled={!canManage||locked} className={(config.receiverMode||'random')==='random'?'active':''} onClick={()=>update({receiverMode:'random',receiverOrder:shuffle(creditorsBefore)})}>系統隨機平均</button><button type="button" disabled={!canManage||locked} className={config.receiverMode==='selected'?'active':''} onClick={()=>update({receiverMode:'selected',receiverUids:[]})}>指定接收人</button></div></div>{config.receiverMode==='selected'&&<div className="chip-list">{creditorsBefore.map((id)=><button type="button" key={id} className={`member-chip ${(config.receiverUids||[]).includes(id)?'selected':''}`} disabled={!canManage||locked} onClick={()=>toggleReceiver(id)}>{nameFor(id)} {(config.receiverUids||[]).includes(id)&&<Check size={13}/>}</button>)}</div>}{(config.receiverMode||'random')==='random'&&canManage&&!locked&&<button className="outline-button full" type="button" onClick={()=>update({receiverOrder:shuffle(creditorsBefore)})}><Shuffle size={16}/>重新隨機分配</button>}
      {result.extraPool>0&&<div className="pool-preview">{Object.entries(result.poolAllocations||{}).filter(([,n])=>n>0).map(([id,n])=><div key={id}><span>{nameFor(id)}</span><strong>+{formatMoney(n)}</strong></div>)}</div>}
    </div>}

    {affected.length>0&&<div className="rounding-preview"><h3>尾差前 → 尾差後</h3>{affected.map((id)=>{const before=baseBalances[id]||0;const after=result.balances[id]||0;const status=(v)=>v>0?`應收 ${formatMoney(v)}`:v<0?`應付 ${formatMoney(Math.abs(v))}`:'已結清';return <div className="result-row" key={id}><span>{nameFor(id)}</span><strong>{status(before)} → {status(after)}</strong></div>;})}</div>}
    {!canManage&&<p className="field-hint"><LockKeyhole size={15}/>此設定只有群主與副群主可以修改。</p>}
    {canManage&&!locked&&<button className="primary-button full" type="button" disabled={config.mode==='assigned'&&(config.tailUids||[]).length!==model.requiredTailUnits || config.mode==='roundUp'&&config.receiverMode==='selected'&&!(config.receiverUids||[]).length} onClick={()=>onUpdateActivity({...activity,roundingConfig:config,roundingLockedAt:now(),roundingConfirmedBy:actorId,auditHistory:[...(activity.auditHistory||[]),{id:makeId(),type:'roundingLocked',by:actorId,at:now(),message:`確認最終尾差方案：${config.mode==='roundUp'?'全員向上補齊':config.mode==='assigned'?'指定尾差承擔者':config.mode==='random'?'隨機尾差承擔者':'維持精準結果'}。`,notifyUids:activity.participantIds.filter((id)=>id!==actorId)}]})}><LockKeyhole size={16}/>確認結算方案</button>}
    {(activity.roundingUpdatedBy||activity.roundingConfirmedBy)&&<p className="muted small">{locked?'由':'目前由'} {nameFor(activity.roundingConfirmedBy||activity.roundingUpdatedBy)} {locked?'確認並鎖定':'設定'}。</p>}
    {locked&&<p className="muted small">結算方案已確認。為避免有人看過金額後方案又改變，尾差設定已鎖定。</p>}
  </section>;
}

function SettlementPlanModal({ balances, currentRows, nameFor, onClose, onSave }) {
  const debtors=Object.entries(balances||{}).filter(([,n])=>n<0).map(([id,n])=>({id,amount:-n}));
  const creditors=Object.entries(balances||{}).filter(([,n])=>n>0).map(([id,n])=>({id,amount:n}));
  const initialRows=useMemo(()=>buildSettlementPlan(balances,currentRows||[],{clamp:true}).manualTransfers.map((row)=>({
    id:row.manualId,fromUid:row.fromUid,toUid:row.toUid,amount:String(row.amount),
  })),[]);
  const [rows,setRows]=useState(initialRows);
  const [localError,setLocalError]=useState('');

  const parsed=rows.map((row)=>({...row,amount:Number(row.amount)}));
  const validation=useMemo(()=>{
    if(rows.some((row)=>!row.fromUid||!row.toUid||!/^\d+$/.test(String(row.amount))||Number(row.amount)<=0)){
      return {error:rows.length?'請填完整的付款人、收款人與金額。':'',plan:null};
    }
    try{return{error:'',plan:buildSettlementPlan(balances,parsed)};}catch(error){return{error:error.message,plan:null};}
  },[balances,rows]);

  const oldPlan=useMemo(()=>buildSettlementPlan(balances,currentRows||[],{clamp:true}),[balances,currentRows]);
  const changes=useMemo(()=>{
    if(!validation.plan)return[];
    const summarize=(transfers)=>{
      const map=new Map();
      for(const transfer of transfers){
        const key=transferRouteKey(transfer.fromUid,transfer.toUid);
        map.set(key,(map.get(key)||0)+transfer.amount);
      }
      return map;
    };
    const before=summarize(oldPlan.transfers),after=summarize(validation.plan.transfers);
    const keys=new Set([...before.keys(),...after.keys()]);
    return [...keys].map((key)=>{
      const [fromUid,toUid]=key.split('→');
      return{key,fromUid,toUid,before:before.get(key)||0,after:after.get(key)||0};
    }).filter((row)=>row.before!==row.after);
  },[oldPlan,validation.plan]);

  const totalDebt=debtors.reduce((sum,row)=>sum+row.amount,0);
  const manuallyAssigned=parsed.reduce((sum,row)=>sum+(Number.isSafeInteger(row.amount)&&row.amount>0?row.amount:0),0);
  const unassigned=Math.max(0,totalDebt-manuallyAssigned);
  const usedPairs=new Set(rows.map((row)=>transferRouteKey(row.fromUid,row.toUid)));
  const addRow=()=>{
    for(const debtor of debtors)for(const creditor of creditors){
      const key=transferRouteKey(debtor.id,creditor.id);
      if(!usedPairs.has(key)){
        setRows((prev)=>[...prev,{id:makeId(),fromUid:debtor.id,toUid:creditor.id,amount:''}]);
        setLocalError('');
        return;
      }
    }
    setLocalError('目前沒有其他可新增的付款路線。');
  };
  const patch=(id,patch)=>{setRows((prev)=>prev.map((row)=>row.id===id?{...row,...patch}:row));setLocalError('');};

  return <div className="modal-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal settlement-plan-modal">
    <div className="modal-top"><h2>調整建議分帳</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div>
    <p className="muted small">你可以先指定部分「誰付給誰、多少」，其餘金額由系統自動完成。只能由目前應付的人直接付給目前應收的人。</p>
    {rows.length===0?<div className="settlement-plan-empty"><strong>目前全部自動分配</strong><small>新增指定後，系統只處理剩餘金額。</small></div>:<div className="settlement-manual-list">{rows.map((row)=><div className="settlement-manual-row" key={row.id}>
      <span className="manual-route-badge">手動設定</span>
      <label className="field"><span>付款人</span><select value={row.fromUid} onChange={(e)=>patch(row.id,{fromUid:e.target.value})}>{debtors.map((item)=><option key={item.id} value={item.id}>{nameFor(item.id)} · 應付 {formatMoney(item.amount)}</option>)}</select></label>
      <label className="field"><span>收款人</span><select value={row.toUid} onChange={(e)=>patch(row.id,{toUid:e.target.value})}>{creditors.map((item)=><option key={item.id} value={item.id}>{nameFor(item.id)} · 應收 {formatMoney(item.amount)}</option>)}</select></label>
      <label className="field"><span>指定金額</span><div className="money-field compact"><span>NT$</span><input inputMode="numeric" value={row.amount} onChange={(e)=>patch(row.id,{amount:e.target.value.replace(/\D/g,'')})}/></div></label>
      <button className="text-action-button danger-text" type="button" onClick={()=>setRows((prev)=>prev.filter((item)=>item.id!==row.id))}>移除此指定</button>
    </div>)}</div>}
    <button className="outline-button full" type="button" onClick={addRow}><Plus size={16}/>指定一筆</button>
    {rows.length>0&&<button className="text-action-button settlement-auto-reset" type="button" onClick={()=>{setRows([]);setLocalError('');}}>改回全部自動分配</button>}
    <div className="settlement-plan-summary"><span>手動指定</span><strong>{formatMoney(manuallyAssigned)}</strong><span>交給系統分配</span><strong>{formatMoney(unassigned)}</strong></div>
    {(localError||validation.error)&&<p className="form-error">{localError||validation.error}</p>}
    {validation.plan&&<div className="settlement-plan-changes"><h3>這次會變動</h3>{changes.length===0?<p className="muted small">付款路線與金額沒有改變；只會保留你指定的部分。</p>:changes.map((row)=><div className="result-row" key={row.key}><span>{nameFor(row.fromUid)} → {nameFor(row.toUid)}</span><strong>{row.before?formatMoney(row.before):'新增'} → {row.after?formatMoney(row.after):'移除'}</strong></div>)}</div>}
    <button className="primary-button full" type="button" disabled={!validation.plan} onClick={()=>onSave(parsed.map((row)=>({...row,amount:Number(row.amount)})))}>套用並自動分配剩餘</button>
  </section></div>;
}

export default function App() {
  const [data,setData]=useState(loadStore);
  const [screen,setScreen]=useState('home');
  const [groupId,setGroupId]=useState(null);
  const [activityId,setActivityId]=useState(null);
  const [tab,setTab]=useState('expenses');
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState('');
  const [guestName,setGuestName]=useState('');
  const [showAllGroups,setShowAllGroups]=useState(false);
  const [showAllActions,setShowAllActions]=useState(false);
  const [expenseFilter,setExpenseFilter]=useState('all');
  const [successFlash,setSuccessFlash]=useState('');
  const [navigationOrigin,setNavigationOrigin]=useState(null);
  const [storageError,setStorageError]=useState('');
  const tabScrollPositions=useRef({expenses:0,ledger:0,settlements:0});

  useStorePersistence(data,{delay:300,onError:setStorageError});
  useModalViewport();
  useEffect(()=>{ tabScrollPositions.current={expenses:0,ledger:0,settlements:0};window.scrollTo({top:0,behavior:'instant'}); },[screen,groupId,activityId]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const sync=()=>{
      const root=document.documentElement;
      root.style.setProperty('--visual-viewport-height',`${viewport?.height||window.innerHeight}px`);
      root.style.setProperty('--visual-viewport-offset',`${viewport?.offsetTop||0}px`);
    };
    sync();
    viewport?.addEventListener('resize',sync);
    viewport?.addEventListener('scroll',sync);
    window.addEventListener('resize',sync);
    return()=>{viewport?.removeEventListener('resize',sync);viewport?.removeEventListener('scroll',sync);window.removeEventListener('resize',sync);};
  },[]);
  useEffect(()=>{ if(!toast)return;const t=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(t); },[toast]);
  useEffect(()=>{ if(!successFlash)return;const t=setTimeout(()=>setSuccessFlash(''),1500);return()=>clearTimeout(t); },[successFlash]);

  const actorId=data.currentUserId;
  const primaryUserId=data.account?.primaryUserId || actorId;
  const actor=data.users[actorId];
  const indexes=useMemo(()=>buildStoreIndexes(data),[data.groups,data.activities,data.expenses,data.settlements]);
  const group=indexes.groupById.get(groupId);
  const candidateActivity=indexes.activityById.get(activityId);
  const activity=candidateActivity?.groupId===groupId?candidateActivity:null;
  const activityExpenses=itemsFor(indexes.expensesByActivityId,activityId);
  const activitySettlements=itemsFor(indexes.settlementsByActivityId,activityId);
  const groupActivities=itemsFor(indexes.activitiesByGroupId,groupId).filter((a)=>a.status!=='archived' && (group?.memberIds.includes(actorId) || a.participantIds.includes(actorId) || itemsFor(indexes.expensesByActivityId,a.id).some((e)=>(e.allocations?.[actorId]||0)>0||(e.payments||[{uid:e.paidBy,amount:e.amount}]).some((p)=>p.uid===actorId)||e.change?.receiverUid===actorId) || itemsFor(indexes.settlementsByActivityId,a.id).some((x)=>x.fromUid===actorId||x.toUid===actorId)));

  function accountName(){ return actor?.accountName || actor?.nickname || ''; }
  function nameFor(uid,g=group){ return g?.nicknames?.[uid] || data.users[uid]?.nickname || '未知成員'; }
  function notify(text){setToast(text);}
  function updateGroup(next){setData((prev)=>({...prev,groups:prev.groups.map((g)=>g.id===next.id?next:g)}));}
  function updateActivity(next){if(!canManageActivity(group,actorId))return;setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.id===next.id?next:a)}));}
  function goHome(){setScreen('home');setGroupId(null);setActivityId(null);setModal(null);}
  function goGroup(id){setGroupId(id);setActivityId(null);setScreen('group');setModal(null);setData((prev)=>({...prev,groups:prev.groups.map((g)=>g.id===id?{...g,lastUsedAt:now()}:g)}));}
  function goActivity(id,gid=groupId,initialTab='expenses'){setNavigationOrigin(null);setGroupId(gid);setActivityId(id);setTab(initialTab);setScreen('activity');setModal(null);}
  function switchActivityTab(nextTab){
    if(nextTab===tab){
      tabScrollPositions.current[nextTab]=0;
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    tabScrollPositions.current[tab]=window.scrollY;
    const target=tabScrollPositions.current[nextTab]||0;
    setTab(nextTab);
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:target,behavior:'instant'})));
  }

  function financesFor(a) {
    if(!a)return {balances:{},suggested:[],projected:{},error:''};
    const expenses=itemsFor(indexes.expensesByActivityId,a.id);
    const settlements=itemsFor(indexes.settlementsByActivityId,a.id);
    try{return activityFinance(a,expenses,settlements);}catch(err){return{balances:{},suggested:[],projected:{},transfers:[],projectedBalances:{},status:'unsettled',error:err.message};}
  }
  const finances=useMemo(()=>financesFor(activity),[activity,indexes]);
  const roundingModel=useMemo(()=>activity?buildRoundingModel(activity.participantIds,activityExpenses):null,[activity,activityExpenses]);
  const finalFinance=finances;
  const ledgerParticipantIds=useMemo(()=>{
    if(!activity)return[];
    const current=[...activity.participantIds];
    const balances=finances.balances||{};
    const pendingUids=new Set(activitySettlements.filter((x)=>x.status==='pending'||x.status==='disputed').flatMap((x)=>[x.fromUid,x.toUid]));
    const historical=Object.keys(balances).filter((id)=>!current.includes(id)&&((balances[id]||0)!==0||pendingUids.has(id)));
    return [...current,...historical];
  },[activity,finances.balances,activitySettlements]);

  const homeActions=useMemo(()=>{
    if(!actorId)return[];
    const rows=[];
    for(const a of data.activities){if(a.status==='archived')continue;const g=indexes.groupById.get(a.groupId);if(!g||g.archived)continue;const f=financesFor(a);if(!a.participantIds.includes(actorId)&&!(actorId in (f.balances||{})))continue;const activitySettlementRows=itemsFor(indexes.settlementsByActivityId,a.id);const pending=activitySettlementRows.filter((s)=>s.status==='pending'&&s.toUid===actorId);const disputed=activitySettlementRows.filter((s)=>s.status==='disputed'&&s.fromUid===actorId);const bal=f.projected[actorId]||0;let priority=99;let label='';let amount=0;if(pending.length){priority=0;label='待我確認';amount=pending.reduce((s,x)=>s+x.amount,0);}else if(disputed.length){priority=0;label='還款需要處理';amount=disputed.reduce((s,x)=>s+x.amount,0);}else if(bal<0){priority=1;label='我要付';amount=Math.abs(bal);}else if(bal>0){priority=2;label='我要收';amount=bal;}if(priority<99)rows.push({activity:a,group:g,priority,label,amount});}
    return rows.sort((a,b)=>a.priority-b.priority || new Date(b.activity.createdAt)-new Date(a.activity.createdAt));
  },[data,actorId]);

  const sortedGroups=useMemo(()=>{
    const visible=data.groups.filter((g)=>{
      if(g.archived)return false;
      if(g.memberIds.includes(actorId))return true;
      return itemsFor(indexes.activitiesByGroupId,g.id).some((a)=>{
        const balance=financesFor(a).balances?.[actorId]||0;
        const pending=itemsFor(indexes.settlementsByActivityId,a.id).some((x)=>['pending','disputed'].includes(x.status)&&(x.fromUid===actorId||x.toUid===actorId));
        return balance!==0||pending;
      });
    });
    return visible.sort((a,b)=>{
      const actionA=homeActions.some((x)=>x.group.id===a.id)?0:1;
      const actionB=homeActions.some((x)=>x.group.id===b.id)?0:1;
      return actionA-actionB || new Date(b.lastUsedAt||b.createdAt)-new Date(a.lastUsedAt||a.createdAt);
    });
  },[data,homeActions,actorId]);

  const notificationItems=useMemo(()=>{
    const items=[];
    for(const s of data.settlements){const a=indexes.activityById.get(s.activityId);const g=indexes.groupById.get(a?.groupId);if(!a||!g)continue;if(s.status==='pending'&&s.toUid===actorId)items.push({key:`settle-${s.id}`,at:s.createdAt,title:`${nameFor(s.fromUid,g)} 已記錄還款 ${formatMoney(s.amount)}`,detail:'等待你確認是否收到款項',actionable:true,type:'payment',activityId:a.id,groupId:g.id,target:'settlement'});if(s.status==='disputed'&&s.fromUid===actorId)items.push({key:`dispute-${s.id}`,at:s.updatedAt||s.createdAt,title:'你的還款被回報有問題',detail:`${formatMoney(s.amount)} 需要重新確認`,actionable:true,type:'alert',activityId:a.id,groupId:g.id,target:'settlement'});}
    for(const a of data.activities){const g=indexes.groupById.get(a.groupId);if(!g)continue;for(const ev of a.auditHistory||[]){if(ev.notifyUids?.includes(actorId))items.push({key:`audit-${a.id}-${ev.id}`,at:ev.at,title:`${a.title} 已更新`,detail:ev.message,actionable:false,type:'change',activityId:a.id,groupId:g.id,target:'activityAudit'});}}
    return items.filter((x)=>Date.now()-new Date(x.at).getTime()<=90*86400000 || x.actionable).sort((a,b)=>new Date(b.at)-new Date(a.at));
  },[data,actorId]);
  const actionableCount=notificationItems.filter((n)=>n.actionable).length;
  const readKeys=data.account?.readNotificationKeys || [];

  function markNotificationRead(key){setData((prev)=>({...prev,account:{...prev.account,readNotificationKeys:[...new Set([...(prev.account.readNotificationKeys||[]),key])]}}));}
  function openNotifications(){setScreen('notifications');}

  if(!actor) return <div className="app-shell onboarding-shell"><div className="onboarding-content"><BrandLockup/><h1>開始使用 Bopli</h1><p className="muted">先設定帳號名稱。加入不同群組時，可以另外設定朋友看到的群組暱稱。</p><form className="onboarding-form" onSubmit={(e)=>{e.preventDefault();if(!guestName.trim())return;const next=createGuestStore(guestName);next.account.backupPromptSeen=true;setData(next);setModal({kind:'backupPrompt'});}}><label className="field"><span>帳號名稱</span><input autoFocus value={guestName} onChange={(e)=>setGuestName(e.target.value)} placeholder="例如：Cayden"/></label><button className="primary-button full" type="submit" disabled={!guestName.trim()}>開始使用</button><button className="text-action-button recover-link" type="button" onClick={()=>setModal({kind:'restoreGoogle'})}>已經使用過 Bopli？使用 Google 找回帳號</button></form><p className="prototype-note">{APP_LABEL} 是本機互動測試版；正式 Google 登入與跨裝置同步需接上 Firebase。</p></div>{modal?.kind==='restoreGoogle'&&<ConfirmModal title="使用 Google 找回帳號" confirmText="了解" cancelText="返回" onClose={()=>setModal(null)} onConfirm={()=>setModal(null)}><p>{APP_LABEL} 已保留這個入口與流程位置，但目前沒有連接 Google Authentication。正式版會用已連結的 Google 帳號找回原本資料。</p></ConfirmModal>}</div>;

  function createGroup(name,nickname){if(!name||!nickname)return'請完成群組名稱與群組暱稱。';const id=makeId();const g={id,name,ownerUid:actorId,deputyUids:[],memberIds:[actorId],nicknames:{[actorId]:nickname},editPolicy:EDIT_POLICY.OWNER_ONLY,allowMemberInvites:false,policyHistory:[],archived:false,createdAt:now(),lastUsedAt:now()};setData((prev)=>({...prev,groups:[...prev.groups,g]}));setModal(null);goGroup(id);return'';}
  function createActivity(name){if(!name)return'請輸入活動名稱。';const a={id:makeId(),groupId,title:name,participantIds:[...group.memberIds],status:'active',createdAt:now(),auditHistory:[],memberReviewIds:[]};setData((prev)=>({...prev,activities:[...prev.activities,a]}));setModal(null);goActivity(a.id);return'';}
  function addTestMembers(names){
    if(!group)return'找不到群組。';
    if(!canInvite)return'目前沒有新增群組成員的權限。';
    const cleaned=names.map((name)=>name.trim()).filter(Boolean);
    if(cleaned.length>50)return'一次最多新增 50 位測試成員。';
    const lowered=cleaned.map((name)=>name.toLocaleLowerCase('zh-TW'));
    if(new Set(lowered).size!==lowered.length)return'輸入的暱稱有重複，請調整後再新增。';
    const existing=new Set(group.memberIds.map((id)=>nameFor(id,group).toLocaleLowerCase('zh-TW')));
    const conflict=cleaned.find((name)=>existing.has(name.toLocaleLowerCase('zh-TW')));
    if(conflict)return`「${conflict}」已經是這個群組的成員暱稱。`;
    const created=cleaned.map((name)=>({id:makeId(),name}));
    setData((prev)=>{
      const users={...prev.users};
      for(const item of created)users[item.id]={id:item.id,nickname:item.name,accountName:item.name,isGuest:true,isTest:true,createdAt:now()};
      return {...prev,users,groups:prev.groups.map((g)=>g.id===group.id?{...g,memberIds:[...g.memberIds,...created.map((item)=>item.id)],nicknames:{...(g.nicknames||{}),...Object.fromEntries(created.map((item)=>[item.id,item.name]))},policyHistory:[...(g.policyHistory||[]),{id:makeId(),type:'testMembersAdded',by:actorId,at:now(),targetUids:created.map((item)=>item.id)}]}:g)};
    });
    setModal(null);
    notify(`已新增 ${created.length} 位測試成員；現有活動不會自動加入。`);
    return'';
  }
  function addTestIdentity(uid){
    if(uid===primaryUserId)return;
    setData((prev)=>({...prev,account:{...prev.account,testIdentityIds:[...new Set([...(prev.account?.testIdentityIds||[]),uid])]}}));
    notify(`已加入測試身分：${data.users[uid]?.nickname||'成員'}`);
  }
  function removeTestIdentity(uid){
    setData((prev)=>({...prev,currentUserId:prev.currentUserId===uid?(prev.account?.primaryUserId||prev.currentUserId):prev.currentUserId,account:{...prev.account,testIdentityIds:(prev.account?.testIdentityIds||[]).filter((id)=>id!==uid)}}));
    notify('已從可切換測試身分清單移除。');
  }
  function loadCostcoDemo(){const result=appendCostcoDemo(data,actorId);setData(result.store);goActivity(result.activityId,result.groupId);notify(result.added?'已載入 17 人好市多示範。':'已開啟示範。');}

  function toggleInvites(){if(!isOwner(group,actorId))return;updateGroup({...group,allowMemberInvites:!group.allowMemberInvites,policyHistory:[...(group.policyHistory||[]),{id:makeId(),type:'invitePolicy',by:actorId,at:now(),enabled:!group.allowMemberInvites}]});}
  function toggleEditPolicy(){if(!isOwner(group,actorId))return;try{updateGroup(changeGroupPolicy(group,group.editPolicy===EDIT_POLICY.ALL?EDIT_POLICY.OWNER_ONLY:EDIT_POLICY.ALL,actorId,now()));}catch(e){notify(e.message);}}

  function saveExpense(fields,existingExpense,draftId){
    if(existingExpense){if(!canEditExpense(group,existingExpense,actorId,data.settlements))return notify('這筆支出目前不能修改。');setData((prev)=>({...prev,expenses:prev.expenses.map((item)=>item.id===existingExpense.id?updateExpenseWithHistory(item,fields,actorId,now(),makeId()):item)}));notify('修改已儲存，歷史紀錄已保留。');}
    else {const item={id:makeId(),activityId,createdBy:actorId,createdAt:now(),updatedAt:now(),revision:1,history:[],...fields};setData((prev)=>({...prev,expenses:[...prev.expenses,item],drafts:prev.drafts.filter((d)=>d.id!==draftId)}));notify('已新增支出。');}
    setModal(null);
  }
  function saveDraft(snapshot,draftId){if(!snapshot?.title&&!snapshot?.amount)return;const id=draftId||makeId();setData((prev)=>{const item={id,activityId,title:snapshot.title||'未命名草稿',amount:snapshot.amount||0,status:snapshot.status||'尚未完成分攤',updatedAt:now(),snapshot};const exists=prev.drafts.some((d)=>d.id===id);return{...prev,drafts:exists?prev.drafts.map((d)=>d.id===id?item:d):[item,...prev.drafts]};});}

  function requestDeleteExpense(expense){
    if(!canEditExpense(group,expense,actorId,data.settlements))return notify('這筆支出目前不能刪除。');
    setModal({kind:'confirmDeleteExpense',expenseId:expense.id});
  }
  function confirmDeleteExpense(expenseId){
    const expense=data.expenses.find((e)=>e.id===expenseId);
    if(!expense||!canEditExpense(group,expense,actorId,data.settlements)){setModal(null);return notify('這筆支出目前不能刪除。');}
    setData((prev)=>({...prev,
      expenses:prev.expenses.filter((e)=>e.id!==expenseId),
      activities:prev.activities.map((a)=>a.id===expense.activityId?{...a,auditHistory:[...(a.auditHistory||[]),{id:makeId(),type:'expenseDeleted',by:actorId,at:now(),message:`刪除支出「${expense.title}」 ${formatMoney(expense.amount)}。`,notifyUids:a.participantIds.filter((id)=>id!==actorId)}]}:a)
    }));
    setModal(null);notify('支出已刪除，活動修改紀錄已保留。');
  }

  function requestDeleteActivity(){
    const status=activityDeletionStatus(group,activity,data,actorId);
    if(!status.allowed)return notify(status.reason);
    setModal({kind:'confirmDeleteActivity',activityId:activity.id,counts:status.counts});
  }
  function confirmDeleteActivity(targetId){
    const target=data.activities.find((a)=>a.id===targetId);
    const parent=data.groups.find((g)=>g.id===target?.groupId);
    const status=activityDeletionStatus(parent,target,data,actorId);
    if(!status.allowed){setModal(null);return notify(status.reason);}
    const parentId=target.groupId;
    setData((prev)=>deleteActivityCascade(prev,targetId));
    setModal(null);setActivityId(null);setGroupId(parentId);setScreen('group');setTab('expenses');
    notify('活動已永久刪除。');
  }
  function requestDeleteGroup(targetGroup=group){
    const status=groupDeletionStatus(targetGroup,data,actorId);
    if(!status.allowed)return notify(status.reason);
    setGroupId(targetGroup.id);
    setModal({kind:'confirmDeleteGroup',groupId:targetGroup.id,counts:status.counts});
  }
  function confirmDeleteGroup(targetId){
    const target=data.groups.find((g)=>g.id===targetId);
    const status=groupDeletionStatus(target,data,actorId);
    if(!status.allowed){setModal(null);return notify(status.reason);}
    setData((prev)=>deleteGroupCascade(prev,targetId));
    setModal(null);setGroupId(null);setActivityId(null);setScreen('home');setTab('expenses');
    notify('群組已永久刪除。');
  }

  function requestPayment(transfer,amount,method,meta){
    const current=mergeSettlementTransfers(finalFinance.transfers).find((t)=>t.fromUid===actorId&&t.toUid===transfer.toUid);
    if(transfer.fromUid!==actorId||!current||!Number.isSafeInteger(amount)||amount<=0||amount>current.amount)return notify('付款金額超過目前可支付金額，請重新檢查。');
    transfer=current;
    let left=amount;
    const manualConsumption=[];
    for(const part of transfer.manualParts||[]){
      if(left<=0)break;
      const used=Math.min(left,part.amount);
      if(used>0){manualConsumption.push({id:part.id,amount:used});left-=used;}
    }
    setData((prev)=>{
      const activities=manualConsumption.length?prev.activities.map((a)=>{
        if(a.id!==activityId)return a;
        const consumed=Object.fromEntries(manualConsumption.map((item)=>[item.id,item.amount]));
        return {...a,settlementManualTransfers:(a.settlementManualTransfers||[]).map((row)=>({...row,amount:Math.max(0,row.amount-(consumed[row.id]||0))})).filter((row)=>row.amount>0)};
      }):prev.activities;
      return {...prev,activities,settlements:[...prev.settlements,{id:makeId(),activityId,fromUid:actorId,toUid:transfer.toUid,amount,method,methodOther:meta.other,note:meta.note,paidDate:meta.date,status:'pending',createdBy:actorId,createdAt:now(),manualPlanConsumption:manualConsumption,events:[{type:'pending',by:actorId,at:now()}]}]};
    });
    setModal(null);notify(`已記錄付款，等待${nameFor(transfer.toUid)}確認。`);
  }
  function confirmPayment(s){if(s.toUid!==actorId||s.status!=='pending')return;setData((prev)=>({...prev,settlements:prev.settlements.map((x)=>x.id===s.id?{...x,status:'confirmed',confirmedAt:now(),events:[...x.events,{type:'confirmed',by:actorId,at:now()}]}:x)}));notify('已確認收到款項。');}
  function disputePayment(s,reason,note){
    if(s.toUid!==actorId||s.status!=='pending')return;
    setData((prev)=>({...prev,settlements:prev.settlements.map((x)=>x.id===s.id&&x.status==='pending'?{...x,status:'disputed',updatedAt:now(),issue:{reason,note},events:[...(x.events||[]),{type:'disputed',by:actorId,at:now(),reason,note}]}:x)}));
    setModal(null);notify('已回報問題，等待付款人處理。');
  }
  function resubmitPayment(s){
    if(s.fromUid!==actorId||s.status!=='disputed')return;
    setData((prev)=>({...prev,settlements:prev.settlements.map((x)=>x.id===s.id&&x.status==='disputed'?{...x,status:'pending',updatedAt:now(),events:[...(x.events||[]),{type:'resubmitted',by:actorId,at:now()}]}:x)}));
    notify('已重新送出，等待收款人確認。');
  }

  function changeMyNickname(next){if(!group)return'找不到群組。';if(group.memberIds.some((id)=>id!==actorId&&nameFor(id,group).toLocaleLowerCase('zh-TW')===next.toLocaleLowerCase('zh-TW')))return'這個群組已有人使用相同暱稱。';const old=nameFor(actorId,group);updateGroup({...group,nicknames:{...(group.nicknames||{}),[actorId]:next},policyHistory:[...(group.policyHistory||[]),{id:makeId(),type:'nickname',by:actorId,at:now(),from:old,to:next}]});notify('群組暱稱已更新，所有活動同步顯示。');setModal(null);return'';}

  function promoteDeputy(targetUid,enabled){try{updateGroup(setDeputy(group,targetUid,enabled,actorId,now()));notify(enabled?'已設為副群主。':'已取消副群主。');}catch(e){notify(e.message);}}
  function removeGroupMember(targetUid){if(!isOwner(group,actorId))return;setModal({kind:'confirmRemoveGroupMember',targetUid});}
  function confirmRemoveGroupMember(targetUid){
    setData((prev)=>({...prev,
      groups:prev.groups.map((g)=>g.id===group.id?{...g,memberIds:g.memberIds.filter((id)=>id!==targetUid),deputyUids:(g.deputyUids||[]).filter((id)=>id!==targetUid),policyHistory:[...(g.policyHistory||[]),{id:makeId(),type:'memberRemoved',targetUid,by:actorId,at:now()}]}:g),
      activities:prev.activities.map((a)=>a.groupId===group.id?{...a,participantIds:a.participantIds.filter((id)=>id!==targetUid),memberReviewIds:(a.memberReviewIds||[]).filter((id)=>id!==targetUid),auditHistory:[...(a.auditHistory||[]),...(a.participantIds.includes(targetUid)?[{id:makeId(),type:'memberExitedGroup',by:actorId,at:now(),message:`${nameFor(targetUid)} 已離開群組；既有帳務與付款紀錄保留。`,notifyUids:a.participantIds.filter((id)=>id!==targetUid)}]:[])]}:a)
    }));
    setModal(null);notify('成員已移出群組；既有分攤、付款與還款紀錄完整保留。');
  }

  function groupHasOutstanding(uid){return data.activities.filter((a)=>a.groupId===group.id).some((a)=>{const f=financesFor(a);return (f.balances[uid]||0)!==0 || data.settlements.some((x)=>x.activityId===a.id&&['pending','disputed'].includes(x.status)&&(x.fromUid===uid||x.toUid===uid));});}
  function exitGroup(){if(isOwner(group,actorId))return notify('群主需先轉讓群主後才能退出。');setModal({kind:'confirmExitGroup'});}
  function confirmExit(){
    setData((prev)=>({...prev,
      groups:prev.groups.map((g)=>g.id===group.id?{...g,memberIds:g.memberIds.filter((id)=>id!==actorId),deputyUids:(g.deputyUids||[]).filter((id)=>id!==actorId)}:g),
      activities:prev.activities.map((a)=>a.groupId===group.id?{...a,participantIds:a.participantIds.filter((id)=>id!==actorId),memberReviewIds:(a.memberReviewIds||[]).filter((id)=>id!==actorId)}:a)
    }));
    setModal(null);goHome();notify(groupHasOutstanding(actorId)?'已退出群組；仍可處理離開前尚未結清的帳目。':'已退出群組。');
  }

  function recalcExpenseForActivity(expense,oldIds,newIds,index){
    const next={...expense,participantIds:[...expense.participantIds],allocations:{...expense.allocations}};
    if(expense.lines?.length){let changed=false;const lines=expense.lines.map((line,lineIndex)=>{if(line.splitMode==='equal'&&sameMembers(line.participantIds,oldIds)){changed=true;return{...line,participantIds:[...newIds],allocations:splitEqualRotating(line.amount,newIds,index+lineIndex)}}return line;});if(changed){next.lines=lines;next.allocations=Object.fromEntries(newIds.map((id)=>[id,0]));for(const line of lines)for(const [id,n] of Object.entries(line.allocations||{}))next.allocations[id]=(next.allocations[id]||0)+n;next.participantIds=Object.keys(next.allocations).filter((id)=>next.allocations[id]>0);}}
    else if(expense.splitMode==='equal'&&sameMembers(expense.participantIds,oldIds)){next.participantIds=[...newIds];next.allocations=splitEqualRotating(expense.amount,newIds,index);}
    return next;
  }

  function addActivityMember(uid,recalculate){
    if(!canManageActivity(group,actorId))return;const oldIds=[...activity.participantIds];const newIds=[...oldIds,uid];const hasExpenses=activityExpenses.length>0;const hasRepayments=activitySettlements.length>0;
    if(recalculate&&hasRepayments)return notify('活動已開始結算，請先處理既有還款後再重新計算。');
    let nextActivity={...activity,participantIds:newIds,auditHistory:[...(activity.auditHistory||[]),{id:makeId(),type:'memberAdded',by:actorId,at:now(),message:`${nameFor(uid)} 加入活動，${oldIds.length} → ${newIds.length} 人。`,notifyUids:oldIds}]};
    if(hasExpenses&&!recalculate)nextActivity={...nextActivity,memberReviewIds:[...(nextActivity.memberReviewIds||[]),uid]};
    setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.id===activity.id?nextActivity:a),expenses:recalculate?prev.expenses.map((e,i)=>e.activityId===activity.id?recalcExpenseForActivity(e,oldIds,newIds,i):e):prev.expenses}));
    setModal(null);notify(recalculate?'已加入成員並重新計算可安全調整的共同支出。':'已加入活動，既有支出維持原狀。');
  }

  function addActivityMembersBatch(memberIds,decisions){
    if(!canManageActivity(group,actorId)||!memberIds?.length)return;
    const oldIds=[...activity.participantIds];
    const allNew=memberIds.filter((id)=>!oldIds.includes(id));
    if(!allNew.length){setModal(null);return;}
    const hasExpenses=activityExpenses.length>0;
    const hasRepayments=activitySettlements.length>0;
    const recalcUids=hasExpenses&&!hasRepayments?allNew.filter((id)=>Boolean(decisions?.[id])):[];
    const keepUids=hasExpenses?allNew.filter((id)=>!recalcUids.includes(id)):[];
    const expenseIds=[...oldIds,...recalcUids];
    const participantIds=[...oldIds,...allNew];
    const messages=allNew.map((uid)=>`${nameFor(uid)} 加入活動${recalcUids.includes(uid)?'並套用既有共同支出':'，既有支出維持原狀'}。`);
    const nextActivity={...activity,participantIds,memberReviewIds:[...new Set([...(activity.memberReviewIds||[]),...keepUids])],auditHistory:[...(activity.auditHistory||[]),{id:makeId(),type:'membersAdded',by:actorId,at:now(),message:`批次加入 ${allNew.length} 位成員；${recalcUids.length} 位套用既有共同支出。`,notifyUids:oldIds}]};
    setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.id===activity.id?nextActivity:a),expenses:recalcUids.length?prev.expenses.map((e,i)=>e.activityId===activity.id?recalcExpenseForActivity(e,oldIds,expenseIds,i):e):prev.expenses}));
    setModal(null);
    notify(hasRepayments?'已加入成員；因已有還款紀錄，既有支出維持原狀。':`已加入 ${allNew.length} 位成員。`);
  }

  function resolveMemberReview(uid,recalculate){if(recalculate&&activitySettlements.length)return notify('已有還款紀錄，暫時不能重新計算。');const unresolved=activity.memberReviewIds||[];const oldForExpenses=activity.participantIds.filter((id)=>!unresolved.includes(id));setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.id===activity.id?{...a,memberReviewIds:(a.memberReviewIds||[]).filter((id)=>id!==uid),auditHistory:[...(a.auditHistory||[]),{id:makeId(),type:'reviewResolved',by:actorId,at:now(),message:recalculate?`${nameFor(uid)} 已套用至既有共同支出。`:`${nameFor(uid)} 不參與加入前的既有共同支出。`,notifyUids:a.participantIds}]}:a),expenses:recalculate?prev.expenses.map((e,i)=>e.activityId===activity.id?recalcExpenseForActivity(e,oldForExpenses,activity.participantIds,i):e):prev.expenses}));notify(recalculate?'既有共同支出已重新檢查。':'已維持原狀，不再提醒。');}

  function removeActivityMember(uid){if(!canManageActivity(group,actorId))return;setModal({kind:'removeActivityMember',targetUid:uid});}
  function confirmRemoveActivityMember(uid,selectedExpenseIds=[]){
    const oldIds=[...activity.participantIds];
    const newIds=oldIds.filter((id)=>id!==uid);
    const selected=new Set(activitySettlements.length?[]:selectedExpenseIds);
    setData((prev)=>({...prev,
      activities:prev.activities.map((a)=>a.id===activity.id?{...a,participantIds:newIds,memberReviewIds:(a.memberReviewIds||[]).filter((id)=>id!==uid),auditHistory:[...(a.auditHistory||[]),{id:makeId(),type:'memberRemoved',by:actorId,at:now(),message:`${nameFor(uid)} 已移出活動；${selected.size} 筆舊支出不再計其分攤。`,notifyUids:newIds}]}:a),
      expenses:prev.expenses.map((e)=>e.activityId===activity.id&&selected.has(e.id)?recalcExpenseRemovingMember(e,uid,newIds,actorId):e)
    }));
    setModal(null);
    notify(selected.size?'已移出活動；勾選的舊分攤已移除並重新分配。':'已移出活動；所有既有分攤維持原狀。');
  }

  const editingExpense=modal?.kind==='expense'&&modal.expenseId?data.expenses.find((e)=>e.id===modal.expenseId):null;
  const detailExpense=modal?.kind==='expenseDetail'?data.expenses.find((e)=>e.id===modal.expenseId):null;
  const draftExpense=modal?.kind==='expense'&&modal.draftId?data.drafts.find((d)=>d.id===modal.draftId):null;
  const lockedActivity=activitySettlements.some((s)=>['pending','confirmed','disputed'].includes(s.status));
  const canInvite=Boolean(group&&(isOwner(group,actorId)||group.allowMemberInvites));
  const canManage=Boolean(group&&canManageActivity(group,actorId));

  const pageHeader = (showBrand=true) => <header className="app-header">{showBrand?<button className="brand-button" type="button" onClick={goHome}><BrandLockup compact/></button>:<span/>}<div className="header-actions"><button className="header-icon" type="button" aria-label="通知" onClick={openNotifications}><Bell size={20}/>{actionableCount>0&&<span className="notification-badge">{actionableCount>9?'9+':actionableCount}</span>}</button><button className="avatar-button" type="button" aria-label="我的" onClick={()=>setScreen('profile')}>{initials(accountName())}</button></div></header>;

  return <div className={`app-shell ${screen==='activity'?'has-activity-nav':''}`}><div className="test-version-strip"><span>{APP_LABEL} · 測試身分：<strong>{accountName()}</strong></span><button type="button" onClick={()=>setModal({kind:'switchIdentity'})}>切換</button></div>
    {storageError&&<div className="info-card storage-error-banner" role="alert"><CircleAlert size={18}/><p><strong>資料尚未安全儲存</strong><br/>{storageError}<br/>請先不要重新整理或關閉此頁。</p></div>}
    {screen==='home'&&pageHeader(true)}
    {(screen==='notifications'||screen==='profile')&&pageHeader(true)}

    <main className="page-content">
      {screen==='home'&&<>
        <div className="welcome"><h1>嗨，{accountName()}</h1><p>{homeActions.length?'你有帳目需要處理。':'目前沒有需要處理的帳目。'}</p></div>
        {homeActions.length>0&&<section className="home-action-section"><div className="section-heading"><div><h2>需要你處理</h2><p>先完成最重要的付款與確認。</p></div></div><div className="card-list">{homeActions.slice(0,showAllActions?homeActions.length:3).map((item)=><button key={item.activity.id} type="button" className="action-card click-card" onClick={()=>goActivity(item.activity.id,item.group.id,'settlements')}><span className={`action-dot p${item.priority}`}/><span className="card-main"><strong>{item.activity.title}</strong><small>{item.group.name} · {item.label}</small></span><span className="action-amount">{formatMoney(item.amount)}</span><span className="action-go">處理</span></button>)}</div>{homeActions.length>3&&<button className="text-action-button home-more" type="button" onClick={()=>setShowAllActions((v)=>!v)}>{showAllActions?'收合':`查看另外 ${homeActions.length-3} 項待處理`}</button>}</section>}
        <section><div className="section-heading"><div><h2>我的群組</h2><p>點進群組查看活動。</p></div></div>{sortedGroups.length===0?<EmptyState icon={UsersRound} title="還沒有群組" detail="建立固定朋友群組，再為每次聚餐或旅行建立活動。" action="建立群組" onAction={()=>setModal({kind:'createGroup'})}/>:<div className="card-list">{sortedGroups.slice(0,showAllGroups?sortedGroups.length:5).map((g)=>{const actionCount=homeActions.filter((x)=>x.group.id===g.id).length;return <button key={g.id} className="group-card click-card" type="button" onClick={()=>goGroup(g.id)}><span className="group-icon"><UsersRound size={22}/></span><span className="card-main"><strong>{g.name}</strong><small>{g.memberIds.length} 人 · {actionCount?`${actionCount} 件待處理`:'沒有待處理'}</small></span><ChevronRight size={18}/></button>;})}</div>}{sortedGroups.length>5&&<button className="text-action-button home-more" type="button" onClick={()=>setShowAllGroups((v)=>!v)}>{showAllGroups?'收合':`查看其他 ${sortedGroups.length-5} 個群組`}</button>}<button className="outline-button full create-bottom" type="button" onClick={()=>setModal({kind:'createGroup'})}><Plus size={17}/>建立群組</button></section>
        <button className="demo-link" type="button" onClick={loadCostcoDemo}>載入 17 人好市多示範帳本</button>
      </>}

      {screen==='notifications'&&<NotificationScreen items={notificationItems} readKeys={readKeys} onRead={markNotificationRead} onBack={goHome} onOpen={(item)=>{setNavigationOrigin('notifications');setGroupId(item.groupId);setActivityId(item.activityId);if(item.target==='activityAudit'){setScreen('activitySettings');}else{setTab(item.target==='settlement'?'settlements':'expenses');setScreen('activity');}}}/>}

      {screen==='profile'&&<ProfileScreen actor={actor} account={data.account} groups={data.groups.filter((g)=>g.memberIds.includes(actorId)&&!g.archived)} nameFor={(id,g)=>nameFor(id,g)} actorId={actorId} primaryUserId={primaryUserId} onBack={goHome} onEditAccountName={()=>setModal({kind:'accountName'})} onArchived={()=>setScreen('archivedGroups')} onConnectGoogle={()=>{setData((prev)=>({...prev,account:{...prev.account,googleLinked:true}}));setSuccessFlash('Google 帳號已連結');}} onOpenGroupNickname={(gid)=>{setGroupId(gid);setScreen('memberDetail');setModal({kind:'memberDetailTarget',targetUid:actorId});}} onSwitchIdentity={()=>setModal({kind:'switchIdentity'})}/>} 

      {screen==='archivedGroups'&&<ArchivedGroups groups={data.groups.filter((g)=>g.memberIds.includes(actorId)&&g.archived)} actorId={actorId} onBack={()=>setScreen('profile')} onRestore={(gid)=>{setData((prev)=>({...prev,groups:prev.groups.map((g)=>g.id===gid?{...g,archived:false,lastUsedAt:now()}:g)}));notify('群組已恢復。');}} onDelete={(gid)=>{const target=data.groups.find((g)=>g.id===gid);if(target)requestDeleteGroup(target);}}/>}

      {screen==='group'&&group&&<GroupScreen group={group} activities={groupActivities} data={data} actorId={actorId} nameFor={nameFor} financesFor={financesFor} canInvite={canInvite} historicalOnly={!group.memberIds.includes(actorId)} onBack={goHome} onInvite={()=>setModal({kind:'invite'})} onSettings={()=>setScreen('groupSettings')} onOpenActivity={(id)=>goActivity(id)} onCreateActivity={()=>setModal({kind:'createActivity'})}/>} 

      {screen==='groupSettings'&&group&&<GroupSettings group={group} actorId={actorId} nameFor={nameFor} onBack={()=>setScreen('group')} onToggleInvites={toggleInvites} onToggleEdit={toggleEditPolicy} onMembers={()=>setScreen('groupMembers')} onArchive={()=>setModal({kind:'confirmArchive'})} onDelete={()=>requestDeleteGroup(group)}/>} 

      {screen==='groupMembers'&&group&&<GroupMembers group={group} actorId={actorId} nameFor={nameFor} canAddTest={canInvite} onBack={()=>setScreen('groupSettings')} onOpen={(uid)=>{setModal({kind:'memberDetailTarget',targetUid:uid});setScreen('memberDetail');}} onRemove={removeGroupMember} onAddTest={()=>setModal({kind:'testMembers'})} onExit={exitGroup}/>} 

      {screen==='memberDetail'&&group&&<MemberDetail group={group} targetUid={modal?.targetUid||modal?.kind==='memberDetailTarget'&&modal.targetUid||actorId} actorId={actorId} nameFor={nameFor} activities={data.activities.filter((a)=>a.groupId===group.id)} isDeputy={(uid)=>isDeputy(group,uid)} onBack={()=>setScreen('groupMembers')} onEditNickname={()=>setModal({kind:'nickname'})} onDeputy={promoteDeputy}/>} 

      {screen==='activitySettings'&&activity&&group&&<ActivitySettings activity={activity} group={group} canManage={canManage} canDelete={isOwner(group,actorId)} nameFor={nameFor} onBack={()=>setScreen('activity')} onMembers={()=>setScreen('activityMembers')} onDelete={requestDeleteActivity}/>} 

      {screen==='activityMembers'&&activity&&group&&<ActivityMembers activity={activity} group={group} nameFor={nameFor} canManage={canManage} onBack={()=>setScreen('activity')} onAdd={(uid)=>{if(activityExpenses.length)setModal({kind:'addActivityMemberChoice',targetUid:uid});else addActivityMember(uid,false);}} onAddMany={(uids)=>setModal({kind:'batchAddActivityMembers',memberIds:uids})} onRemove={removeActivityMember} onReview={(uid)=>setModal({kind:'reviewMember',targetUid:uid})}/>} 

      {screen==='allSettlements'&&activity&&group&&<AllSettlements activity={activity} users={data.users} nameFor={nameFor} balances={finalFinance.balances} transfers={finalFinance.transfers} onBack={()=>setScreen('activity')}/>} 

      {screen==='activity'&&activity&&group&&<>
        <div className="activity-topbar"><button className="icon-button" type="button" aria-label={navigationOrigin==='notifications'?'返回通知中心':'返回群組'} onClick={()=>{if(navigationOrigin==='notifications'){setNavigationOrigin(null);setScreen('notifications');}else goGroup(group.id);}}><ArrowLeft size={21}/></button><div className="activity-title"><small>{group.name}</small><strong>{activity.title}</strong></div><div className="activity-top-actions">{canManage&&<button className="icon-button" type="button" aria-label="活動成員" onClick={()=>setScreen('activityMembers')}><UsersRound size={20}/></button>}{activity.participantIds.includes(actorId)&&canInvite&&<button className="icon-button" type="button" aria-label="邀請朋友" onClick={()=>setModal({kind:'invite'})}><UserRoundPlus size={20}/></button>}{group.memberIds.includes(actorId)&&<button className="icon-button" type="button" aria-label="活動設定" onClick={()=>setScreen('activitySettings')}><Settings2 size={20}/></button>}</div></div>
        {!activity.participantIds.includes(actorId)&&<div className="info-card historical-ledger-notice"><Info size={17}/><p>你已退出這個活動；目前只顯示與你有關的既有帳目與結算。</p></div>}
        {tab==='expenses'&&<ExpensesTab activity={activity} expenses={activity.participantIds.includes(actorId)?activityExpenses:activityExpenses.filter((e)=>(e.allocations?.[actorId]||0)>0||(e.payments||[{uid:e.paidBy,amount:e.amount}]).some((p)=>p.uid===actorId)||e.change?.receiverUid===actorId)} drafts={activity.participantIds.includes(actorId)?data.drafts.filter((d)=>d.activityId===activity.id):[]} actorId={actorId} nameFor={nameFor} canAddExpense={activity.participantIds.includes(actorId)} canDeleteExpense={(e)=>canEditExpense(group,e,actorId,data.settlements)} finances={finalFinance} activityStatus={finances.status} filter={expenseFilter} setFilter={setExpenseFilter} locked={lockedActivity} onExpense={(id)=>setModal({kind:'expenseDetail',expenseId:id})} onDeleteExpense={requestDeleteExpense} onAdd={()=>setModal({kind:'expense'})} onSettlement={()=>switchActivityTab('settlements')} onDraft={(id)=>setModal({kind:'expense',draftId:id})} onDiscardDraft={(id)=>setData((prev)=>({...prev,drafts:prev.drafts.filter((d)=>d.id!==id)}))} onReview={()=>setScreen('activityMembers')}/>} 
        {tab==='ledger'&&<MemberLedger finances={finalFinance} participantIds={activity.participantIds.includes(actorId)?ledgerParticipantIds:[actorId]} users={Object.fromEntries(ledgerParticipantIds.map((id)=>[id,{...data.users[id],nickname:nameFor(id)}]))} actorId={actorId} expenses={activity.participantIds.includes(actorId)?activityExpenses:activityExpenses.filter((e)=>(e.allocations?.[actorId]||0)>0||(e.payments||[{uid:e.paidBy,amount:e.amount}]).some((p)=>p.uid===actorId)||e.change?.receiverUid===actorId)} settlements={activity.participantIds.includes(actorId)?activitySettlements:activitySettlements.filter((x)=>x.fromUid===actorId||x.toUid===actorId)} onOpenExpense={(id)=>setModal({kind:'expenseDetail',expenseId:id})}/>} 
        {tab==='settlements'&&<SettlementTab activity={activity} group={group} actorId={actorId} nameFor={nameFor} expenses={activityExpenses} settlements={activitySettlements} baseBalances={finances.balances} baseProjected={finances.projected} finalFinance={finalFinance} onUpdateActivity={updateActivity} onPay={(transfer)=>setModal({kind:'payment',transfer})} onConfirm={confirmPayment} onIssue={(settlement)=>setModal({kind:'issue',settlement})} onResubmit={resubmitPayment} onAll={()=>setScreen('allSettlements')}/>} 
      </>}
    </main>

    {screen==='activity'&&activity&&<nav className="activity-bottom-nav" aria-label="活動導覽">{[['expenses',ReceiptText,'支出'],['ledger',History,'帳目'],['settlements',Wallet,'結算']].map(([id,Icon,label])=><button key={id} type="button" className={tab===id?'selected':''} onClick={()=>switchActivityTab(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>}

    {toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    {successFlash&&<SuccessFlash text={successFlash}/>} 

    {modal?.kind==='backupPrompt'&&<ConfirmModal title="建議連結 Google 帳號" confirmText="前往「我的」" cancelText="稍後再說" onClose={()=>setModal(null)} onConfirm={()=>{setModal(null);setScreen('profile');}}><p>連結 Google 後，日後更換裝置或重新登入時，可以更容易找回你的 Bopli 帳號與資料。</p><p className="muted small">也可以之後到「我的 → 帳號」完成連結；這個提示只主動出現一次。</p></ConfirmModal>}
    {modal?.kind==='createGroup'&&<CreateGroupModal accountName={accountName()} onClose={()=>setModal(null)} onSubmit={createGroup}/>} 
    {modal?.kind==='createActivity'&&<NameModal title="建立活動" label="活動名稱" placeholder="例如：好市多採買" onClose={()=>setModal(null)} onSubmit={createActivity} buttonText="建立活動"/>}
    {modal?.kind==='invite'&&group&&<InviteSheet group={group} activity={activity} canInvite={canInvite} onClose={()=>setModal(null)} onAddTest={()=>setModal({kind:'testMembers'})} onCopy={async(link,joinActivity)=>{try{await navigator.clipboard?.writeText(link);notify(`邀請連結已複製${joinActivity?'，加入者將同時加入目前活動':''}。`);}catch{notify('已準備邀請連結。');}setModal(null);}}/>}
    {modal?.kind==='testMembers'&&group&&<TestMembersModal group={group} nameFor={nameFor} onClose={()=>setModal(null)} onSubmit={addTestMembers}/>} 
    {modal?.kind==='accountName'&&<NameModal title="修改帳號名稱" label="帳號名稱" initial={accountName()} selectAll onClose={()=>setModal(null)} onSubmit={(next)=>{setData((prev)=>({...prev,users:{...prev.users,[actorId]:{...prev.users[actorId],accountName:next,nickname:next}}}));setModal(null);notify('帳號名稱已更新；既有群組暱稱不受影響。');return'';}} buttonText="儲存"/>}
    {modal?.kind==='nickname'&&group&&<NameModal title="修改群組暱稱" label="你在這個群組的暱稱" initial={nameFor(actorId)} selectAll onClose={()=>setModal(null)} onSubmit={changeMyNickname} buttonText="儲存暱稱"/>}
    {modal?.kind==='confirmRemoveGroupMember'&&<ConfirmModal danger title={`移除 ${nameFor(modal.targetUid)}？`} confirmText="確認移除" onClose={()=>setModal(null)} onConfirm={()=>confirmRemoveGroupMember(modal.targetUid)}><p>移除後，對方不再參與新的群組內容與共同支出；既有分攤、墊付、付款與還款紀錄仍完整保留。</p>{groupHasOutstanding(modal.targetUid)&&<p className="field-hint"><CircleAlert size={15}/>此成員仍有待結算帳目。移除後仍可從歷史帳務完成結算。</p>}</ConfirmModal>}
    {modal?.kind==='confirmExitGroup'&&<ConfirmModal danger title={`確定要退出「${group?.name}」嗎？`} confirmText="確定退出" onClose={()=>setModal(null)} onConfirm={confirmExit}><p>退出後，你不再參與新的群組內容與共同支出；過去與你有關的帳目與還款權限仍保留到完成結算。</p></ConfirmModal>}
    {modal?.kind==='confirmArchive'&&<ConfirmModal title={`封存「${group?.name}」？`} confirmText="封存群組" onClose={()=>setModal(null)} onConfirm={()=>{updateGroup({...group,archived:true});setModal(null);goHome();notify('群組已封存，可於日後版本恢復。');}}><p>封存後不會出現在首頁，歷史帳目仍完整保留。</p></ConfirmModal>}
    {modal?.kind==='confirmDeleteActivity'&&(()=>{const target=data.activities.find((a)=>a.id===modal.activityId);return target?<ConfirmModal danger title={`永久刪除「${target.title}」？`} confirmText="永久刪除活動" cancelText="取消" onClose={()=>setModal(null)} onConfirm={()=>confirmDeleteActivity(target.id)}><p>這個動作無法復原，會永久刪除此活動及其支出、還款與草稿資料。</p><p className="muted small">目前包含 {modal.counts?.expenses||0} 筆支出、{modal.counts?.settlements||0} 筆還款紀錄、{modal.counts?.drafts||0} 份草稿。</p></ConfirmModal>:null;})()}
    {modal?.kind==='confirmDeleteGroup'&&(()=>{const target=data.groups.find((g)=>g.id===modal.groupId);const activityCount=data.activities.filter((a)=>a.groupId===modal.groupId).length;return target?<ConfirmModal danger title={`永久刪除「${target.name}」？`} confirmText="永久刪除群組" cancelText="取消" onClose={()=>setModal(null)} onConfirm={()=>confirmDeleteGroup(target.id)}><p>這個動作無法復原，會永久刪除群組內所有活動、支出、還款與草稿資料。</p><p className="muted small">目前群組共有 {activityCount} 個活動。成員帳號本身不會被刪除。</p></ConfirmModal>:null;})()}
    {modal?.kind==='batchAddActivityMembers'&&activity&&<BatchAddMembersModal memberIds={modal.memberIds||[]} nameFor={nameFor} hasExpenses={activityExpenses.length>0} hasRepayments={activitySettlements.length>0} onClose={()=>setModal(null)} onSubmit={(decisions)=>addActivityMembersBatch(modal.memberIds||[],decisions)}/>} 
    {modal?.kind==='addActivityMemberChoice'&&activity&&<AddActivityMemberModal targetUid={modal.targetUid} nameFor={nameFor} currentCount={activity.participantIds.length} hasRepayments={activitySettlements.length>0} onClose={()=>setModal(null)} onConfirm={(recalculate)=>addActivityMember(modal.targetUid,recalculate)}/>} 
    {modal?.kind==='reviewMember'&&<ConfirmModal title={`重新檢查 ${nameFor(modal.targetUid)}`} confirmText="套用至既有共同支出" cancelText="維持原狀，不再提醒" onClose={()=>{resolveMemberReview(modal.targetUid,false);setModal(null);}} onConfirm={()=>{resolveMemberReview(modal.targetUid,true);setModal(null);}}><p>如果這位成員原本就應該參與前面的共同支出，可以重新計算；如果是中途加入，維持原狀即可。</p></ConfirmModal>}
    {modal?.kind==='removeActivityMember'&&activity&&<RemoveActivityMemberModal activity={activity} expenses={activityExpenses} targetUid={modal.targetUid} nameFor={nameFor} hasRepayments={activitySettlements.length>0} onClose={()=>setModal(null)} onConfirm={(selected)=>confirmRemoveActivityMember(modal.targetUid,selected)}/>}
    {modal?.kind==='switchIdentity'&&<TestIdentityModal users={data.users} groups={data.groups} actorId={actorId} primaryUserId={primaryUserId} testIdentityIds={data.account?.testIdentityIds||[]} onClose={()=>setModal(null)} onAddIdentity={addTestIdentity} onRemoveIdentity={removeTestIdentity} onSwitch={(uid)=>{if(uid!==primaryUserId&&!(data.account?.testIdentityIds||[]).includes(uid))return;setData((prev)=>({...prev,currentUserId:uid}));setModal(null);setGroupId(null);setActivityId(null);setScreen('home');setTab('expenses');notify(`已切換測試身分：${data.users[uid]?.nickname||'成員'}`);}}/>}
    {modal?.kind==='confirmDeleteExpense'&&(()=>{const target=data.expenses.find((e)=>e.id===modal.expenseId);return target?<ConfirmModal danger title={`刪除「${target.title}」？`} confirmText="確認刪除" cancelText="取消" onClose={()=>setModal(null)} onConfirm={()=>confirmDeleteExpense(target.id)}><p>{formatMoney(target.amount)}</p><p>刪除後，這筆支出將不再計入活動總額、成員帳目與結算；刪除動作會保留在活動修改紀錄。</p></ConfirmModal>:null;})()}
    {modal?.kind==='payment'&&<PaymentModal transfer={modal.transfer} users={data.users} nameFor={nameFor} onClose={()=>setModal(null)} onSubmit={(amount,method,meta)=>requestPayment(modal.transfer,amount,method,meta)}/>} 
    {modal?.kind==='issue'&&<IssueModal settlement={modal.settlement} nameFor={nameFor} onClose={()=>setModal(null)} onSubmit={(reason,note)=>disputePayment(modal.settlement,reason,note)}/>} 
    {modal?.kind==='expense'&&activity&&<ExpenseForm key={editingExpense?.id||draftExpense?.id||'new'} activity={activity} users={Object.fromEntries(activity.participantIds.map((id)=>[id,{...data.users[id],nickname:nameFor(id)}]))} actorId={actorId} expense={editingExpense} draft={draftExpense} remainderOffset={activityExpenses.length} onClose={()=>setModal(null)} onDraft={(snapshot,id)=>saveDraft(snapshot,id)} onSave={(fields,id)=>saveExpense(fields,editingExpense,id)}/>} 
    {detailExpense&&<ExpenseDetail expense={detailExpense} actorId={actorId} userName={nameFor} editable={canEditExpense(group,detailExpense,actorId,data.settlements)} deletable={canEditExpense(group,detailExpense,actorId,data.settlements)} locked={lockedActivity} onClose={()=>setModal(null)} onEdit={()=>setModal({kind:'expense',expenseId:detailExpense.id})} onDelete={()=>requestDeleteExpense(detailExpense)}/>} 
  </div>;
}

function ExpensesTab({ activity, expenses, drafts, actorId, nameFor, finances, activityStatus, filter, setFilter, locked, canAddExpense=true, canDeleteExpense, onExpense, onDeleteExpense, onAdd, onSettlement, onDraft, onDiscardDraft, onReview }) {
  const [query,setQuery]=useState('');
  const myBalance=finances.balances?.[actorId]||0;
  const normalized=query.trim().toLocaleLowerCase('zh-TW');
  const matchesSearch=(e)=>{
    if(!normalized)return true;
    const payerNames=(e.payments||[{uid:e.paidBy,amount:e.amount}]).map((p)=>nameFor(p.uid)).join(' ');
    const lineNames=(e.lines||[]).map((line)=>line.title||'').join(' ');
    const note=[e.note,e.memo,e.description].filter(Boolean).join(' ');
    return [e.title,lineNames,payerNames,note].join(' ').toLocaleLowerCase('zh-TW').includes(normalized);
  };
  const visible=expenses.filter((e)=>{
    const mine=(e.allocations?.[actorId]||0)>0||(e.payments||[{uid:e.paidBy,amount:e.amount}]).some((p)=>p.uid===actorId)||e.change?.receiverUid===actorId;
    return (filter==='all'||mine)&&matchesSearch(e);
  });
  const activityTotal=expenses.reduce((sum,e)=>sum+(e.amount||0),0);
  const statusTitle=activityStatus==='notStarted'?'尚未開始記帳':myBalance>0?`你要收 ${formatMoney(myBalance)}`:myBalance<0?`你要付 ${formatMoney(Math.abs(myBalance))}`:activityStatus==='settled'?'目前已結清':'目前沒有我的應收應付';
  const statusHint=expenses.length===0?'記下第一筆，Bopli 會自動算每個人的分攤。':myBalance===0?'目前沒有需要處理的款項。':'可以先記帳，最後再到結算一次處理。';
  return <><section className="activity-glance-card" id="expense-page-top"><div><small>你的狀態</small><strong>{statusTitle}</strong><span>{statusHint}</span></div><div className="activity-primary-actions">{canAddExpense&&<button className="primary-button" type="button" onClick={onAdd}><Plus size={16}/>記一筆</button>}{expenses.length>0&&<button className="outline-button" type="button" onClick={onSettlement}>去結算</button>}</div><small className="activity-total-note">活動總支出 {formatMoney(activityTotal)}</small></section>
    {activity.memberReviewIds?.length>0&&<button className="member-review-banner" type="button" onClick={onReview}><Info size={16}/><span>有 {activity.memberReviewIds.length} 位成員尚未套用至既有共同支出</span><ChevronRight size={16}/></button>}
    {drafts.length>0&&<section><div className="section-heading"><div><h2>草稿</h2><p>草稿不計入活動總額與結算。</p></div></div><div className="draft-list">{drafts.slice(0,3).map((d)=><article className="draft-card" key={d.id}><button type="button" className="draft-main" onClick={()=>onDraft(d.id)}><strong>{d.title}</strong><small>{d.status||'尚未完成'}</small><span>繼續編輯 <ChevronRight size={15}/></span></button><button className="icon-button" type="button" onClick={()=>onDiscardDraft(d.id)}><MoreHorizontal size={18}/></button></article>)}</div></section>}
    <div className="section-heading"><div><h2>最近帳目</h2><p>{expenses.length?'需要時可搜尋或篩選。':'新增第一筆支出開始分帳。'}</p></div><span className="count-pill">{expenses.length} 筆</span></div>
    {expenses.length>0&&<><label className="ledger-search expense-search"><Search size={17}/><input type="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="搜尋支出紀錄"/></label><div className="ledger-filters expense-filters"><button type="button" className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>全部</button><button type="button" className={filter==='mine'?'active':''} onClick={()=>setFilter('mine')}>與我有關</button></div></>}
    {expenses.length===0?<EmptyState icon={ReceiptText} title="還沒有任何支出" detail={canAddExpense?"新增第一筆支出，Bopli 會自動計算每個人的分攤。":"目前沒有與你有關的歷史支出。"} action={canAddExpense?"新增第一筆支出":null} onAction={canAddExpense?onAdd:null}/>:visible.length===0?<EmptyState icon={Search} title="找不到符合的支出" detail="請調整搜尋關鍵字或篩選條件。"/>:<div className="card-list expense-swipe-list">{[...visible].reverse().map((e)=><SwipeExpenseRow key={e.id} expense={e} userName={nameFor} actorId={actorId} canDelete={Boolean(canDeleteExpense?.(e))} onOpen={onExpense} onDelete={onDeleteExpense}/>)}</div>}

    {locked&&<div className="info-card"><LockKeyhole size={17}/><p>活動已有待確認／已確認／有爭議的還款紀錄，支出修改與刪除受到保護。</p></div>}
  </>;
}

function SettlementTab({ activity, group, actorId, nameFor, expenses, settlements, baseBalances, baseProjected, finalFinance, onUpdateActivity, onPay, onConfirm, onIssue, onResubmit, onAll }) {
  const [showPlanEditor,setShowPlanEditor]=useState(false);
  const [whyTransfer,setWhyTransfer]=useState(null);
  const disputedMine=settlements.filter((s)=>s.status==='disputed'&&(s.fromUid===actorId||s.toUid===actorId));
  const pendingIncoming=settlements.filter((s)=>s.status==='pending'&&s.toUid===actorId);
  const pendingOutgoing=settlements.filter((s)=>s.status==='pending'&&s.fromUid===actorId);
  const completedMine=settlements.filter((s)=>s.status==='confirmed'&&(s.fromUid===actorId||s.toUid===actorId));
  const transfers=mergeSettlementTransfers(finalFinance.transfers||[]);
  const pay=transfers.filter((t)=>t.fromUid===actorId);
  const receive=transfers.filter((t)=>t.toUid===actorId);
  const canManage=canManageActivity(group,actorId);
  const myProjected=finalFinance.projectedBalances?.[actorId]||0;
  const incomingPendingTotal=pendingIncoming.reduce((sum,row)=>sum+row.amount,0);
  const outgoingPendingTotal=pendingOutgoing.reduce((sum,row)=>sum+row.amount,0);
  const allClear=finalFinance.status==='settled';

  const payRows=useMemo(()=>{
    const map=new Map();
    for(const transfer of pay)map.set(transfer.toUid,{toUid:transfer.toUid,remaining:transfer.amount,transfer,pending:0});
    for(const settlement of pendingOutgoing){
      const row=map.get(settlement.toUid)||{toUid:settlement.toUid,remaining:0,transfer:null,pending:0};
      row.pending+=settlement.amount;map.set(settlement.toUid,row);
    }
    return [...map.values()];
  },[pay,pendingOutgoing]);

  const share=expenses.reduce((sum,expense)=>sum+(expense.allocations?.[actorId]||0),0);
  const advanced=expenses.reduce((sum,expense)=>{
    const paid=(expense.payments||[{uid:expense.paidBy,amount:expense.amount}]).filter((item)=>item.uid===actorId).reduce((s,item)=>s+item.amount,0);
    const returned=expense.change?.receiverUid===actorId?(expense.change?.amount||0):0;
    return sum+paid-returned;
  },0);
  const confirmedPaid=settlements.filter((s)=>s.status==='confirmed'&&s.fromUid===actorId).reduce((sum,s)=>sum+s.amount,0);
  const confirmedReceived=settlements.filter((s)=>s.status==='confirmed'&&s.toUid===actorId).reduce((sum,s)=>sum+s.amount,0);

  function savePlan(rows){
    if(!canManage)return;
    try{buildSettlementPlan(finalFinance.projectedBalances,rows);}catch(error){return;}
    onUpdateActivity({...activity,settlementManualTransfers:rows,settlementPlanUpdatedBy:actorId,settlementPlanUpdatedAt:now(),auditHistory:[...(activity.auditHistory||[]),{id:makeId(),type:'settlementPlanChanged',by:actorId,at:now(),message:'調整建議分帳；未指定的剩餘金額由系統自動分配。',notifyUids:activity.participantIds.filter((id)=>id!==actorId)}]});
    setShowPlanEditor(false);
  }

  if(expenses.length===0)return <EmptyState icon={ReceiptText} title="尚未開始記帳" detail="新增第一筆支出後，這裡才會顯示結算狀態。"/>;

  const summaryTitle=incomingPendingTotal>0?`有 ${formatMoney(incomingPendingTotal)} 等你確認`:myProjected<0?`還要付 ${formatMoney(Math.abs(myProjected))}`:myProjected>0?`還要收 ${formatMoney(myProjected)}`:outgoingPendingTotal>0?'付款等待對方確認':'目前沒有未安排款項';
  const summaryHint=[outgoingPendingTotal>0?`待對方確認 ${formatMoney(outgoingPendingTotal)}`:'',incomingPendingTotal>0?`待我確認 ${formatMoney(incomingPendingTotal)}`:''].filter(Boolean).join(' · ');

  return <>{allClear?<div className="settled-hero"><CheckCircle2 size={31}/><h2>目前已結清</h2><p>這個活動沒有待處理的款項。</p></div>:<>
    <section className="settlement-me-card"><small>我的結算</small><strong>{summaryTitle}</strong>{summaryHint&&<span>{summaryHint}</span>}</section>

    {pendingIncoming.length>0&&<section><div className="section-heading"><div><h2>待我確認</h2><p>收到錢後再確認，待確認不等於已結清。</p></div></div><div className="card-list">{pendingIncoming.map((s)=><div className="repayment-card priority-card" key={s.id}><div className="repayment-top"><strong>{nameFor(s.fromUid)} → 我</strong><span className="status-tag">待確認</span></div><strong className="repayment-amount">{formatMoney(s.amount)}</strong><div className="repayment-actions"><button className="primary-button" type="button" onClick={()=>onConfirm(s)}><Check size={15}/>確認已收到</button><button className="outline-button" type="button" onClick={()=>onIssue(s)}>金額有問題</button></div></div>)}</div></section>}

    {disputedMine.length>0&&<section><div className="section-heading"><h2>還款需要處理</h2></div>{disputedMine.map((s)=><div className="repayment-card" key={s.id}><strong>{nameFor(s.fromUid)} → {nameFor(s.toUid)} · {formatMoney(s.amount)}</strong><p>這筆付款有問題，金額保留中，不會再次安排付款。</p>{s.issue?.note&&<p>{s.issue.note}</p>}{s.fromUid===actorId?<button className="outline-button" type="button" onClick={()=>onResubmit(s)}>已處理，重新送出確認</button>:<p className="muted small">等待付款人處理後重新送出。</p>}</div>)}</section>}

    {payRows.length>0&&<section><div className="section-heading"><div><h2>我要付</h2><p>直接看要付給誰、待確認多少、還剩多少。</p></div></div><div className="card-list">{payRows.map((row)=><div className="transfer-card settlement-route-card" key={row.toUid}><div className="transfer-line"><PersonAvatar name={nameFor(row.toUid)} small/><div className="transfer-description"><strong>付給 {nameFor(row.toUid)}</strong>{row.pending>0&&<small>待對方確認 {formatMoney(row.pending)}</small>}{row.remaining>0&&<small>尚需支付 {formatMoney(row.remaining)}</small>}</div><strong>{formatMoney(row.remaining+row.pending)}</strong></div>{row.remaining>0&&<div className="settlement-route-actions"><button className="text-action-button" type="button" onClick={()=>setWhyTransfer(row.transfer)}>為什麼我要付他？</button><button className="outline-button" type="button" onClick={()=>onPay(row.transfer)}>記錄付款</button></div>}</div>)}</div></section>}

    {receive.length>0&&<section><div className="section-heading"><div><h2>我要收</h2><p>清楚查看還有哪些人尚未付款。</p></div></div><div className="card-list">{receive.map((t)=><div className="transfer-card" key={`${t.fromUid}-${t.toUid}`}><div className="transfer-line"><PersonAvatar name={nameFor(t.fromUid)} small/><div className="transfer-description"><strong>{nameFor(t.fromUid)} → 我</strong><small>尚待付款</small></div><strong>{formatMoney(t.amount)}</strong></div></div>)}</div></section>}
  </>}

    {canManage&&!allClear&&<button className="outline-button full settlement-adjust-button" type="button" onClick={()=>setShowPlanEditor(true)}>調整分帳</button>}

    {completedMine.length>0&&<details className="disclosure settlement-completed"><summary>查看已完成還款 {completedMine.length} 筆</summary>{[...completedMine].reverse().map((s)=><div className="history-line" key={s.id}>{nameFor(s.fromUid)} → {nameFor(s.toUid)} <strong>{formatMoney(s.amount)}</strong></div>)}</details>}

    <details className="disclosure settlement-advanced"><summary>進階結算設定</summary><RoundingPanel activity={activity} group={group} actorId={actorId} expenses={expenses} baseBalances={baseBalances} nameFor={nameFor} onUpdateActivity={onUpdateActivity}/></details>
    <button className="outline-button full" type="button" onClick={onAll}>查看所有人的結算</button>

    {showPlanEditor&&<SettlementPlanModal balances={finalFinance.projectedBalances} currentRows={activity.settlementManualTransfers||[]} nameFor={nameFor} onClose={()=>setShowPlanEditor(false)} onSave={savePlan}/>}
    {whyTransfer&&<ConfirmModal title="為什麼我要付他？" confirmText="知道了" hideCancel onClose={()=>setWhyTransfer(null)} onConfirm={()=>setWhyTransfer(null)}><div className="why-transfer-copy"><h3>為什麼我要付錢？</h3><div className="detail-row"><span>我的總分攤</span><strong>{formatMoney(share)}</strong></div><div className="detail-row"><span>我的實際墊付</span><strong>{formatMoney(advanced)}</strong></div>{confirmedPaid>0&&<div className="detail-row"><span>已確認付給別人</span><strong>{formatMoney(confirmedPaid)}</strong></div>}{confirmedReceived>0&&<div className="detail-row"><span>已確認收到還款</span><strong>{formatMoney(confirmedReceived)}</strong></div>}<div className="detail-row detail-row-total"><span>目前淨應付</span><strong>{formatMoney(Math.max(0,-(baseBalances[actorId]||0)))}</strong></div><h3>為什麼是付給 {nameFor(whyTransfer.toUid)}？</h3><p>{nameFor(whyTransfer.toUid)} 目前是活動中的淨應收成員，這筆 {formatMoney(whyTransfer.amount)} 由目前結算方案安排給他。</p></div></ConfirmModal>}
  </>;
}

function AllSettlements({ activity, users, nameFor, balances, transfers, onBack }) {
  const displayUsers=Object.fromEntries(activity.participantIds.map((id)=>[id,{...users[id],nickname:nameFor(id)}]));
  const routes=mergeSettlementTransfers(transfers);
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>結算</button><div className="page-title-row"><div><h1>全部結算</h1><p>查看所有成員的應收應付與轉帳建議。</p></div></div><BalanceBars participantIds={activity.participantIds} balances={balances} users={displayUsers}/><section className="content-card"><h2 className="card-section-title">所有建議轉帳</h2>{routes.map((t)=><div className="settings-simple-row" key={`${t.fromUid}-${t.toUid}`}><span>{nameFor(t.fromUid)} → {nameFor(t.toUid)}</span><strong>{formatMoney(t.amount)}</strong></div>)}</section></>;
}
