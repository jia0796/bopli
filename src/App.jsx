import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleAlert, Copy, Crown, History, Info, Link2, LockKeyhole, LogOut, MoreHorizontal,
  Pencil, Plus, ReceiptText, Search, Settings2, ShieldCheck, Shuffle, Sparkles, UserRound,
  UserRoundPlus, UsersRound, Wallet, X,
} from 'lucide-react';
import { BrandLockup } from './components/Brand.jsx';
import { ExpenseSummary, ExpenseDetail } from './components/ExpenseViews.jsx';
import MemberLedger, { BalanceBars } from './components/MemberLedger.jsx';
import ExpenseForm from './components/ExpenseForm.jsx';
import { appendCostcoDemo } from './lib/demo.js';
import { calculateBalances, formatMoney, splitEqualRotating, suggestTransfers } from './lib/money.js';
import {
  canEditExpense, canManageActivity, canManageFinalRounding, changeGroupPolicy, EDIT_POLICY,
  isDeputy, isOwner, setDeputy, updateExpenseWithHistory,
} from './lib/domain.js';
import { applyRoundingToBalances, buildRoundingModel } from './lib/rounding.js';
import { createGuestStore, freshStore, loadStore, makeId, now, saveStore, STORAGE_KEY } from './lib/store.js';

const formattedTime = (date) => date ? new Date(date).toLocaleString('zh-TW', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const initials = (name) => (name || '?').slice(0, 1);
const sameMembers = (a=[],b=[]) => a.length===b.length && a.every((id)=>b.includes(id));
const shuffle = (items) => [...items].map((value)=>({value,key:Math.random()})).sort((a,b)=>a.key-b.key).map((x)=>x.value);

function PersonAvatar({ name, small=false }) {
  return <span className={`avatar ${small?'avatar-small':''}`} aria-hidden="true">{initials(name)}</span>;
}

function EmptyState({ icon:Icon, title, detail, action=null, onAction=null }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={27}/></div><h3>{title}</h3><p>{detail}</p>{action&&<button type="button" className="outline-button" onClick={onAction}>{action}<ArrowRight size={16}/></button>}</div>;
}

function ConfirmModal({ title, children, confirmText='確認', cancelText='再想想', danger=false, onConfirm, onClose }) {
  return <div className="modal-overlay" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal confirm-modal" role="dialog" aria-modal="true"><div className="modal-top"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div><div className="confirm-copy">{children}</div><div className="confirm-actions"><button type="button" className="outline-button" onClick={onClose}>{cancelText}</button><button type="button" className={danger?'danger-button':'primary-button'} onClick={onConfirm}>{confirmText}</button></div></section></div>;
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

function SuccessFlash({ text }) {
  return <div className="success-flash"><div><CheckCircle2 size={34}/><strong>{text}</strong></div></div>;
}

function SwipeMemberRow({ memberId, name, role, canRemove, onOpen, onRemove }) {
  const [revealed,setRevealed]=useState(false); const startX=useRef(0);
  function down(e){startX.current=e.clientX;}
  function up(e){const dx=e.clientX-startX.current;if(dx>45)setRevealed(true);else if(dx<-35)setRevealed(false);}
  return <div className={`swipe-member-row ${revealed?'revealed':''}`}><button className="swipe-remove" type="button" disabled={!canRemove} onClick={()=>onRemove(memberId)}>移除</button><button className="swipe-content" type="button" onPointerDown={down} onPointerUp={up} onClick={()=>revealed?setRevealed(false):onOpen(memberId)}><PersonAvatar name={name} small/><span className="member-row-main"><strong>{name}</strong><small>{role}</small></span><ChevronRight size={17}/></button></div>;
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

  useEffect(()=>{ try{saveStore(data);}catch{/* prototype only */} },[data]);
  useEffect(()=>{ window.scrollTo({top:0,behavior:'instant'}); },[screen,groupId,activityId,tab]);
  useEffect(()=>{ if(!toast)return;const t=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(t); },[toast]);
  useEffect(()=>{ if(!successFlash)return;const t=setTimeout(()=>setSuccessFlash(''),1500);return()=>clearTimeout(t); },[successFlash]);

  const actorId=data.currentUserId;
  const actor=data.users[actorId];
  const group=data.groups.find((g)=>g.id===groupId);
  const activity=data.activities.find((a)=>a.id===activityId && a.groupId===groupId);
  const groupActivities=data.activities.filter((a)=>a.groupId===groupId && a.status!=='archived');
  const activityExpenses=data.expenses.filter((e)=>e.activityId===activityId);
  const activitySettlements=data.settlements.filter((s)=>s.activityId===activityId);

  function accountName(){ return actor?.accountName || actor?.nickname || ''; }
  function nameFor(uid,g=group){ return g?.nicknames?.[uid] || data.users[uid]?.nickname || '未知成員'; }
  function notify(text){setToast(text);}
  function updateGroup(next){setData((prev)=>({...prev,groups:prev.groups.map((g)=>g.id===next.id?next:g)}));}
  function updateActivity(next){setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.id===next.id?next:a)}));}
  function goHome(){setScreen('home');setGroupId(null);setActivityId(null);setModal(null);}
  function goGroup(id){setGroupId(id);setActivityId(null);setScreen('group');setModal(null);setData((prev)=>({...prev,groups:prev.groups.map((g)=>g.id===id?{...g,lastUsedAt:now()}:g)}));}
  function goActivity(id,gid=groupId){setNavigationOrigin(null);setGroupId(gid);setActivityId(id);setTab('expenses');setScreen('activity');setModal(null);}

  function financesFor(a) {
    if(!a)return {balances:{},suggested:[],projected:{},error:''};
    const expenses=data.expenses.filter((e)=>e.activityId===a.id);const settlements=data.settlements.filter((s)=>s.activityId===a.id);
    try{const balances=calculateBalances(a.participantIds,expenses,settlements);const projected=calculateBalances(a.participantIds,expenses,settlements,true);return{balances,suggested:suggestTransfers(projected),projected,error:''};}catch(err){return{balances:{},suggested:[],projected:{},error:err.message};}
  }
  const finances=useMemo(()=>financesFor(activity),[activity,data.expenses,data.settlements]);
  const roundingModel=useMemo(()=>activity?buildRoundingModel(activity.participantIds,activityExpenses):null,[activity,activityExpenses]);
  const finalFinance=useMemo(()=>{
    if(!activity||!roundingModel)return{balances:finances.balances,projectedBalances:finances.projected,transfers:finances.suggested,extraPool:0};
    const config=activity.roundingLockedAt?(activity.roundingConfig||{}):{mode:'current'};
    const confirmed=applyRoundingToBalances(finances.balances,roundingModel,config);
    const projected=applyRoundingToBalances(finances.projected,roundingModel,config);
    return {...confirmed,projectedBalances:projected.balances,transfers:projected.transfers};
  },[activity,roundingModel,finances]);

  const homeActions=useMemo(()=>{
    if(!actorId)return[];
    const rows=[];
    for(const a of data.activities){if(!a.participantIds.includes(actorId)||a.status==='archived')continue;const g=data.groups.find((x)=>x.id===a.groupId);if(!g||g.archived)continue;const f=financesFor(a);const pending=data.settlements.filter((s)=>s.activityId===a.id&&s.status==='pending'&&s.toUid===actorId);const disputed=data.settlements.filter((s)=>s.activityId===a.id&&s.status==='disputed'&&s.fromUid===actorId);const bal=f.projected[actorId]||0;let priority=99;let label='';let amount=0;if(pending.length){priority=0;label='待我確認';amount=pending.reduce((s,x)=>s+x.amount,0);}else if(disputed.length){priority=0;label='還款需要處理';amount=disputed.reduce((s,x)=>s+x.amount,0);}else if(bal<0){priority=1;label='我要付';amount=Math.abs(bal);}else if(bal>0){priority=2;label='我要收';amount=bal;}if(priority<99)rows.push({activity:a,group:g,priority,label,amount});}
    return rows.sort((a,b)=>a.priority-b.priority || new Date(b.activity.createdAt)-new Date(a.activity.createdAt));
  },[data,actorId]);

  const sortedGroups=useMemo(()=>data.groups.filter((g)=>g.memberIds.includes(actorId)&&!g.archived).sort((a,b)=>{
    const actionA=homeActions.some((x)=>x.group.id===a.id)?0:1;const actionB=homeActions.some((x)=>x.group.id===b.id)?0:1;return actionA-actionB || new Date(b.lastUsedAt||b.createdAt)-new Date(a.lastUsedAt||a.createdAt);
  }),[data.groups,homeActions,actorId]);

  const notificationItems=useMemo(()=>{
    const items=[];
    for(const s of data.settlements){const a=data.activities.find((x)=>x.id===s.activityId);const g=data.groups.find((x)=>x.id===a?.groupId);if(!a||!g||!g.memberIds.includes(actorId))continue;if(s.status==='pending'&&s.toUid===actorId)items.push({key:`settle-${s.id}`,at:s.createdAt,title:`${nameFor(s.fromUid,g)} 已記錄還款 ${formatMoney(s.amount)}`,detail:'等待你確認是否收到款項',actionable:true,type:'payment',activityId:a.id,groupId:g.id,target:'settlement'});if(s.status==='disputed'&&s.fromUid===actorId)items.push({key:`dispute-${s.id}`,at:s.updatedAt||s.createdAt,title:'你的還款被回報有問題',detail:`${formatMoney(s.amount)} 需要重新確認`,actionable:true,type:'alert',activityId:a.id,groupId:g.id,target:'settlement'});}
    for(const a of data.activities){const g=data.groups.find((x)=>x.id===a.groupId);if(!g||!g.memberIds.includes(actorId))continue;for(const ev of a.auditHistory||[]){if(ev.notifyUids?.includes(actorId))items.push({key:`audit-${a.id}-${ev.id}`,at:ev.at,title:`${a.title} 已更新`,detail:ev.message,actionable:false,type:'change',activityId:a.id,groupId:g.id,target:'activityAudit'});}}
    return items.filter((x)=>Date.now()-new Date(x.at).getTime()<=90*86400000 || x.actionable).sort((a,b)=>new Date(b.at)-new Date(a.at));
  },[data,actorId]);
  const actionableCount=notificationItems.filter((n)=>n.actionable).length;
  const readKeys=data.account?.readNotificationKeys || [];

  function markNotificationRead(key){setData((prev)=>({...prev,account:{...prev.account,readNotificationKeys:[...new Set([...(prev.account.readNotificationKeys||[]),key])]}}));}
  function openNotifications(){setScreen('notifications');}

  if(!actor) return <div className="app-shell onboarding-shell"><div className="onboarding-content"><BrandLockup/><h1>開始使用 Bopli</h1><p className="muted">先設定帳號名稱。加入不同群組時，可以另外設定朋友看到的群組暱稱。</p><form className="onboarding-form" onSubmit={(e)=>{e.preventDefault();if(!guestName.trim())return;const next=createGuestStore(guestName);next.account.backupPromptSeen=true;setData(next);setModal({kind:'backupPrompt'});}}><label className="field"><span>帳號名稱</span><input autoFocus value={guestName} onChange={(e)=>setGuestName(e.target.value)} placeholder="例如：Cayden"/></label><button className="primary-button full" type="submit" disabled={!guestName.trim()}>開始使用</button><button className="text-action-button recover-link" type="button" onClick={()=>setModal({kind:'restoreGoogle'})}>已經使用過 Bopli？使用 Google 找回帳號</button></form><p className="prototype-note">Bopli 2.1.1 是本機互動原型；正式 Google 登入與跨裝置同步需接上 Firebase。</p></div>{modal?.kind==='restoreGoogle'&&<ConfirmModal title="使用 Google 找回帳號" confirmText="了解" cancelText="返回" onClose={()=>setModal(null)} onConfirm={()=>setModal(null)}><p>2.1 原型已保留這個入口與流程位置，但目前沒有連接 Google Authentication。正式版會用已連結的 Google 帳號找回原本資料。</p></ConfirmModal>}</div>;

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
  function loadCostcoDemo(){const result=appendCostcoDemo(data,actorId);setData(result.store);goActivity(result.activityId,result.groupId);notify(result.added?'已載入 17 人好市多示範。':'已開啟示範。');}

  function toggleInvites(){if(!isOwner(group,actorId))return;updateGroup({...group,allowMemberInvites:!group.allowMemberInvites,policyHistory:[...(group.policyHistory||[]),{id:makeId(),type:'invitePolicy',by:actorId,at:now(),enabled:!group.allowMemberInvites}]});}
  function toggleEditPolicy(){if(!isOwner(group,actorId))return;try{updateGroup(changeGroupPolicy(group,group.editPolicy===EDIT_POLICY.ALL?EDIT_POLICY.OWNER_ONLY:EDIT_POLICY.ALL,actorId,now()));}catch(e){notify(e.message);}}

  function saveExpense(fields,existingExpense,draftId){
    if(existingExpense){if(!canEditExpense(group,existingExpense,actorId,data.settlements))return notify('這筆支出目前不能修改。');setData((prev)=>({...prev,expenses:prev.expenses.map((item)=>item.id===existingExpense.id?updateExpenseWithHistory(item,fields,actorId,now(),makeId()):item)}));notify('修改已儲存，歷史紀錄已保留。');}
    else {const item={id:makeId(),activityId,createdBy:actorId,createdAt:now(),updatedAt:now(),revision:1,history:[],...fields};setData((prev)=>({...prev,expenses:[...prev.expenses,item],drafts:prev.drafts.filter((d)=>d.id!==draftId)}));notify('已新增支出。');}
    setModal(null);
  }
  function saveDraft(snapshot,draftId){if(!snapshot?.title&&!snapshot?.amount)return;const id=draftId||makeId();setData((prev)=>{const item={id,activityId,title:snapshot.title||'未命名草稿',amount:snapshot.amount||0,status:snapshot.status||'尚未完成分攤',updatedAt:now(),snapshot};const exists=prev.drafts.some((d)=>d.id===id);return{...prev,drafts:exists?prev.drafts.map((d)=>d.id===id?item:d):[item,...prev.drafts]};});}

  function requestPayment(transfer,amount,method,meta){setData((prev)=>({...prev,settlements:[...prev.settlements,{id:makeId(),activityId,fromUid:actorId,toUid:transfer.toUid,amount,method,methodOther:meta.other,note:meta.note,paidDate:meta.date,status:'pending',createdBy:actorId,createdAt:now(),events:[{type:'pending',by:actorId,at:now()}]}]}));setModal(null);notify(`已記錄付款，等待${nameFor(transfer.toUid)}確認。`);}
  function confirmPayment(s){if(s.toUid!==actorId||s.status!=='pending')return;setData((prev)=>({...prev,settlements:prev.settlements.map((x)=>x.id===s.id?{...x,status:'confirmed',confirmedAt:now(),events:[...x.events,{type:'confirmed',by:actorId,at:now()}]}:x)}));notify('已確認收到款項。');}
  function disputePayment(s,reason,note){setData((prev)=>({...prev,settlements:prev.settlements.map((x)=>x.id===s.id?{...x,status:'disputed',updatedAt:now(),issue:{reason,note},events:[...x.events,{type:'disputed',by:actorId,at:now(),reason,note}]}:x)}));setModal(null);notify('已回報問題，等待付款人處理。');}

  function changeMyNickname(next){if(!group)return'找不到群組。';if(group.memberIds.some((id)=>id!==actorId&&nameFor(id,group).toLocaleLowerCase('zh-TW')===next.toLocaleLowerCase('zh-TW')))return'這個群組已有人使用相同暱稱。';const old=nameFor(actorId,group);updateGroup({...group,nicknames:{...(group.nicknames||{}),[actorId]:next},policyHistory:[...(group.policyHistory||[]),{id:makeId(),type:'nickname',by:actorId,at:now(),from:old,to:next}]});notify('群組暱稱已更新，所有活動同步顯示。');setModal(null);return'';}

  function promoteDeputy(targetUid,enabled){try{updateGroup(setDeputy(group,targetUid,enabled,actorId,now()));notify(enabled?'已設為副群主。':'已取消副群主。');}catch(e){notify(e.message);}}
  function removeGroupMember(targetUid){if(!isOwner(group,actorId))return;setModal({kind:'confirmRemoveGroupMember',targetUid});}
  function confirmRemoveGroupMember(targetUid){const next={...group,memberIds:group.memberIds.filter((id)=>id!==targetUid),deputyUids:(group.deputyUids||[]).filter((id)=>id!==targetUid),policyHistory:[...(group.policyHistory||[]),{id:makeId(),type:'memberRemoved',targetUid,by:actorId,at:now()}]};updateGroup(next);setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.groupId===group.id?{...a,participantIds:a.participantIds.filter((id)=>id!==targetUid)}:a)}));setModal(null);notify('成員已移出群組；歷史帳目仍保留。');}

  function groupHasOutstanding(uid){return data.activities.filter((a)=>a.groupId===group.id&&a.participantIds.includes(uid)).some((a)=>{const f=financesFor(a);return (f.balances[uid]||0)!==0 || data.settlements.some((s)=>s.activityId===a.id&&s.status==='pending'&&(s.fromUid===uid||s.toUid===uid));});}
  function exitGroup(){if(isOwner(group,actorId))return notify('群主需先轉讓群主後才能退出。');if(groupHasOutstanding(actorId))return notify('目前仍有未結清或待確認帳目，請先完成結算。');setModal({kind:'confirmExitGroup'});}
  function confirmExit(){updateGroup({...group,memberIds:group.memberIds.filter((id)=>id!==actorId),deputyUids:(group.deputyUids||[]).filter((id)=>id!==actorId)});setModal(null);goHome();notify('已退出群組。');}

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

  function removeActivityMember(uid){if(!canManageActivity(group,actorId))return;if(activitySettlements.length)return notify('活動已有還款紀錄，請先處理後再移出成員。');const unsafe=activityExpenses.filter((e)=>{const share=e.allocations?.[uid]||0;if(!share)return false;if(e.lines?.length)return e.lines.some((line)=>(line.allocations?.[uid]||0)>0 && !(line.splitMode==='equal'&&sameMembers(line.participantIds,activity.participantIds)));return !(e.splitMode==='equal'&&sameMembers(e.participantIds,activity.participantIds));});setModal({kind:'confirmRemoveActivityMember',targetUid:uid,unsafeCount:unsafe.length});}
  function confirmRemoveActivityMember(uid){const oldIds=[...activity.participantIds];const newIds=oldIds.filter((id)=>id!==uid);const unsafeCount=modal.unsafeCount;if(unsafeCount>0){notify(`有 ${unsafeCount} 筆特殊分攤需要先人工處理，暫不移出。`);setModal(null);return;}setData((prev)=>({...prev,activities:prev.activities.map((a)=>a.id===activity.id?{...a,participantIds:newIds,memberReviewIds:(a.memberReviewIds||[]).filter((id)=>id!==uid),auditHistory:[...(a.auditHistory||[]),{id:makeId(),type:'memberRemoved',by:actorId,at:now(),message:`${nameFor(uid)} 已移出活動，${oldIds.length} → ${newIds.length} 人。`,notifyUids:newIds}]}:a),expenses:prev.expenses.map((e,i)=>e.activityId===activity.id?recalcExpenseForActivity(e,oldIds,newIds,i):e)}));setModal(null);notify('已移出活動並重新計算可安全調整的共同支出。');}

  const editingExpense=modal?.kind==='expense'&&modal.expenseId?data.expenses.find((e)=>e.id===modal.expenseId):null;
  const detailExpense=modal?.kind==='expenseDetail'?data.expenses.find((e)=>e.id===modal.expenseId):null;
  const draftExpense=modal?.kind==='expense'&&modal.draftId?data.drafts.find((d)=>d.id===modal.draftId):null;
  const lockedActivity=activitySettlements.some((s)=>['pending','confirmed','disputed'].includes(s.status));
  const canInvite=Boolean(group&&(isOwner(group,actorId)||group.allowMemberInvites));
  const canManage=Boolean(group&&canManageActivity(group,actorId));

  const pageHeader = (showBrand=true) => <header className="app-header">{showBrand?<button className="brand-button" type="button" onClick={goHome}><BrandLockup compact/></button>:<span/>}<div className="header-actions"><button className="header-icon" type="button" aria-label="通知" onClick={openNotifications}><Bell size={20}/>{actionableCount>0&&<span className="notification-badge">{actionableCount>9?'9+':actionableCount}</span>}</button><button className="avatar-button" type="button" aria-label="我的" onClick={()=>setScreen('profile')}>{initials(accountName())}</button></div></header>;

  return <div className={`app-shell ${screen==='activity'?'has-activity-nav':''}`}>
    {screen==='home'&&pageHeader(true)}
    {screen==='notifications'&&pageHeader(false)}
    {screen==='profile'&&pageHeader(false)}

    <main className="page-content">
      {screen==='home'&&<>
        <div className="welcome"><h1>嗨，{accountName()}</h1><p>先看看今天有哪些帳目需要處理。</p></div>
        {homeActions.length>0&&<section className="home-action-section"><div className="section-heading"><div><h2>需要處理</h2><p>待確認 → 我要付 → 我要收</p></div></div><div className="card-list">{homeActions.slice(0,showAllActions?homeActions.length:3).map((item)=><button key={item.activity.id} type="button" className="action-card click-card" onClick={()=>goActivity(item.activity.id,item.group.id)}><span className={`action-dot p${item.priority}`}/><span className="card-main"><strong>{item.group.name} · {item.activity.title}</strong><small>{item.label}</small></span><span className="action-amount">{formatMoney(item.amount)}</span><ChevronRight size={18}/></button>)}</div>{homeActions.length>3&&<button className="text-action-button home-more" type="button" onClick={()=>setShowAllActions((v)=>!v)}>{showAllActions?'收合':`查看另外 ${homeActions.length-3} 項待處理`}</button>}</section>}
        <section><div className="section-heading"><div><h2>我的群組</h2><p>有待處理帳目的群組優先，其餘依最近使用排序</p></div></div>{sortedGroups.length===0?<EmptyState icon={UsersRound} title="還沒有群組" detail="建立固定朋友群組，再為每次聚餐或旅行建立活動。" action="建立群組" onAction={()=>setModal({kind:'createGroup'})}/>:<div className="card-list">{sortedGroups.slice(0,showAllGroups?sortedGroups.length:5).map((g)=>{const actionCount=homeActions.filter((x)=>x.group.id===g.id).length;return <button key={g.id} className="group-card click-card" type="button" onClick={()=>goGroup(g.id)}><span className="group-icon"><UsersRound size={22}/></span><span className="card-main"><strong>{g.name}</strong><small>{g.memberIds.length} 位朋友 · {actionCount?`${actionCount} 個活動待處理`:'目前已結清'}</small></span><ChevronRight size={18}/></button>;})}</div>}{sortedGroups.length>5&&<button className="text-action-button home-more" type="button" onClick={()=>setShowAllGroups((v)=>!v)}>{showAllGroups?'收合':`查看其他 ${sortedGroups.length-5} 個群組`}</button>}<button className="outline-button full create-bottom" type="button" onClick={()=>setModal({kind:'createGroup'})}><Plus size={17}/>建立群組</button></section>
        <button className="demo-link" type="button" onClick={loadCostcoDemo}>載入 17 人好市多示範帳本</button>
      </>}

      {screen==='notifications'&&<NotificationScreen items={notificationItems} readKeys={readKeys} onRead={markNotificationRead} onBack={goHome} onOpen={(item)=>{setNavigationOrigin('notifications');setGroupId(item.groupId);setActivityId(item.activityId);if(item.target==='activityAudit'){setScreen('activitySettings');}else{setTab(item.target==='settlement'?'settlements':'expenses');setScreen('activity');}}}/>}

      {screen==='profile'&&<ProfileScreen actor={actor} account={data.account} groups={data.groups.filter((g)=>g.memberIds.includes(actorId)&&!g.archived)} nameFor={(id,g)=>nameFor(id,g)} actorId={actorId} onBack={goHome} onEditAccountName={()=>setModal({kind:'accountName'})} onArchived={()=>setScreen('archivedGroups')} onConnectGoogle={()=>{setData((prev)=>({...prev,account:{...prev.account,googleLinked:true}}));setSuccessFlash('Google 帳號已連結');}} onOpenGroupNickname={(gid)=>{setGroupId(gid);setScreen('memberDetail');setModal({kind:'memberDetailTarget',targetUid:actorId});}}/>}

      {screen==='archivedGroups'&&<ArchivedGroups groups={data.groups.filter((g)=>g.memberIds.includes(actorId)&&g.archived)} actorId={actorId} onBack={()=>setScreen('profile')} onRestore={(gid)=>{setData((prev)=>({...prev,groups:prev.groups.map((g)=>g.id===gid?{...g,archived:false,lastUsedAt:now()}:g)}));notify('群組已恢復。');}}/>}

      {screen==='group'&&group&&<GroupScreen group={group} activities={groupActivities} data={data} actorId={actorId} nameFor={nameFor} financesFor={financesFor} canInvite={canInvite} onBack={goHome} onInvite={()=>setModal({kind:'invite'})} onSettings={()=>setScreen('groupSettings')} onOpenActivity={(id)=>goActivity(id)} onCreateActivity={()=>setModal({kind:'createActivity'})}/>} 

      {screen==='groupSettings'&&group&&<GroupSettings group={group} actorId={actorId} nameFor={nameFor} onBack={()=>setScreen('group')} onToggleInvites={toggleInvites} onToggleEdit={toggleEditPolicy} onMembers={()=>setScreen('groupMembers')} onArchive={()=>setModal({kind:'confirmArchive'})}/>} 

      {screen==='groupMembers'&&group&&<GroupMembers group={group} actorId={actorId} nameFor={nameFor} canAddTest={canInvite} onBack={()=>setScreen('groupSettings')} onOpen={(uid)=>{setModal({kind:'memberDetailTarget',targetUid:uid});setScreen('memberDetail');}} onRemove={removeGroupMember} onAddTest={()=>setModal({kind:'testMembers'})} onExit={exitGroup}/>} 

      {screen==='memberDetail'&&group&&<MemberDetail group={group} targetUid={modal?.targetUid||modal?.kind==='memberDetailTarget'&&modal.targetUid||actorId} actorId={actorId} nameFor={nameFor} activities={data.activities.filter((a)=>a.groupId===group.id)} isDeputy={(uid)=>isDeputy(group,uid)} onBack={()=>setScreen('groupMembers')} onEditNickname={()=>setModal({kind:'nickname'})} onDeputy={promoteDeputy}/>} 

      {screen==='activitySettings'&&activity&&group&&<ActivitySettings activity={activity} group={group} canManage={canManage} nameFor={nameFor} onBack={()=>setScreen('activity')} onMembers={()=>setScreen('activityMembers')}/>} 

      {screen==='activityMembers'&&activity&&group&&<ActivityMembers activity={activity} group={group} nameFor={nameFor} canManage={canManage} onBack={()=>setScreen('activitySettings')} onAdd={(uid)=>{if(activityExpenses.length)setModal({kind:'addActivityMemberChoice',targetUid:uid});else addActivityMember(uid,false);}} onAddMany={(uids)=>setModal({kind:'batchAddActivityMembers',memberIds:uids})} onRemove={removeActivityMember} onReview={(uid)=>setModal({kind:'reviewMember',targetUid:uid})}/>} 

      {screen==='allSettlements'&&activity&&group&&<AllSettlements activity={activity} users={data.users} nameFor={nameFor} balances={finalFinance.balances} transfers={finalFinance.transfers} onBack={()=>setScreen('activity')}/>} 

      {screen==='activity'&&activity&&group&&<>
        <div className="activity-topbar"><button className="icon-button" type="button" onClick={()=>{if(navigationOrigin==='notifications'){setNavigationOrigin(null);setScreen('notifications');}else goGroup(group.id);}}><ArrowLeft size={21}/></button><div className="activity-title"><small>{group.name}</small><strong>{activity.title}</strong></div><div className="activity-top-actions">{canInvite&&<button className="icon-button" type="button" aria-label="邀請朋友" onClick={()=>setModal({kind:'invite'})}><UserRoundPlus size={20}/></button>}<button className="icon-button" type="button" aria-label="活動設定" onClick={()=>setScreen('activitySettings')}><Settings2 size={20}/></button></div></div>
        {tab==='expenses'&&<ExpensesTab activity={activity} expenses={activityExpenses} drafts={data.drafts.filter((d)=>d.activityId===activity.id)} actorId={actorId} nameFor={nameFor} finances={finalFinance} filter={expenseFilter} setFilter={setExpenseFilter} locked={lockedActivity} onExpense={(id)=>setModal({kind:'expenseDetail',expenseId:id})} onAdd={()=>setModal({kind:'expense'})} onDraft={(id)=>setModal({kind:'expense',draftId:id})} onDiscardDraft={(id)=>setData((prev)=>({...prev,drafts:prev.drafts.filter((d)=>d.id!==id)}))} onReview={()=>setScreen('activityMembers')}/>} 
        {tab==='ledger'&&<MemberLedger participantIds={activity.participantIds} users={Object.fromEntries(activity.participantIds.map((id)=>[id,{...data.users[id],nickname:nameFor(id)}]))} actorId={actorId} expenses={activityExpenses} settlements={activitySettlements} onOpenExpense={(id)=>setModal({kind:'expenseDetail',expenseId:id})}/>} 
        {tab==='settlements'&&<SettlementTab activity={activity} group={group} actorId={actorId} nameFor={nameFor} expenses={activityExpenses} settlements={activitySettlements} baseBalances={finances.balances} baseProjected={finances.projected} finalFinance={finalFinance} onUpdateActivity={updateActivity} onPay={(transfer)=>setModal({kind:'payment',transfer})} onConfirm={confirmPayment} onIssue={(settlement)=>setModal({kind:'issue',settlement})} onAll={()=>setScreen('allSettlements')}/>} 
      </>}
    </main>

    {screen==='activity'&&activity&&<nav className="activity-bottom-nav" aria-label="活動導覽">{[['expenses',ReceiptText,'支出'],['ledger',UsersRound,'成員帳目'],['settlements',Wallet,'結算']].map(([id,Icon,label])=><button key={id} type="button" className={tab===id?'selected':''} onClick={()=>setTab(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>}

    {toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    {successFlash&&<SuccessFlash text={successFlash}/>} 

    {modal?.kind==='backupPrompt'&&<ConfirmModal title="建議連結 Google 帳號" confirmText="前往「我的」" cancelText="稍後再說" onClose={()=>setModal(null)} onConfirm={()=>{setModal(null);setScreen('profile');}}><p>連結 Google 後，日後更換裝置或重新登入時，可以更容易找回你的 Bopli 帳號與資料。</p><p className="muted small">也可以之後到「我的 → 帳號」完成連結；這個提示只主動出現一次。</p></ConfirmModal>}
    {modal?.kind==='createGroup'&&<CreateGroupModal accountName={accountName()} onClose={()=>setModal(null)} onSubmit={createGroup}/>} 
    {modal?.kind==='createActivity'&&<NameModal title="建立活動" label="活動名稱" placeholder="例如：好市多採買" onClose={()=>setModal(null)} onSubmit={createActivity} buttonText="建立活動"/>}
    {modal?.kind==='invite'&&group&&<InviteSheet group={group} activity={activity} canInvite={canInvite} onClose={()=>setModal(null)} onAddTest={()=>setModal({kind:'testMembers'})} onCopy={async(link,joinActivity)=>{try{await navigator.clipboard?.writeText(link);notify(`邀請連結已複製${joinActivity?'，加入者將同時加入目前活動':''}。`);}catch{notify('已準備邀請連結。');}setModal(null);}}/>}
    {modal?.kind==='testMembers'&&group&&<TestMembersModal group={group} nameFor={nameFor} onClose={()=>setModal(null)} onSubmit={addTestMembers}/>} 
    {modal?.kind==='accountName'&&<NameModal title="修改帳號名稱" label="帳號名稱" initial={accountName()} selectAll onClose={()=>setModal(null)} onSubmit={(next)=>{setData((prev)=>({...prev,users:{...prev.users,[actorId]:{...prev.users[actorId],accountName:next,nickname:next}}}));setModal(null);notify('帳號名稱已更新；既有群組暱稱不受影響。');return'';}} buttonText="儲存"/>}
    {modal?.kind==='nickname'&&group&&<NameModal title="修改群組暱稱" label="你在這個群組的暱稱" initial={nameFor(actorId)} selectAll onClose={()=>setModal(null)} onSubmit={changeMyNickname} buttonText="儲存暱稱"/>}
    {modal?.kind==='confirmRemoveGroupMember'&&<ConfirmModal danger title={`移除 ${nameFor(modal.targetUid)}？`} confirmText="確認移除" onClose={()=>setModal(null)} onConfirm={()=>confirmRemoveGroupMember(modal.targetUid)}><p>移除後，對方無法參與這個群組的新活動；過去的支出、付款與帳目紀錄仍會保留。</p>{groupHasOutstanding(modal.targetUid)&&<p className="field-hint"><CircleAlert size={15}/>此成員目前仍有未結清帳目，建議先完成結算。</p>}</ConfirmModal>}
    {modal?.kind==='confirmExitGroup'&&<ConfirmModal danger title={`確定要退出「${group?.name}」嗎？`} confirmText="確定退出" onClose={()=>setModal(null)} onConfirm={confirmExit}><p>退出後，你將無法參與這個群組的新活動；過去與你有關的帳目紀錄仍會保留。</p></ConfirmModal>}
    {modal?.kind==='confirmArchive'&&<ConfirmModal title={`封存「${group?.name}」？`} confirmText="封存群組" onClose={()=>setModal(null)} onConfirm={()=>{updateGroup({...group,archived:true});setModal(null);goHome();notify('群組已封存，可於日後版本恢復。');}}><p>封存後不會出現在首頁，歷史帳目仍完整保留。</p></ConfirmModal>}
    {modal?.kind==='batchAddActivityMembers'&&activity&&<BatchAddMembersModal memberIds={modal.memberIds||[]} nameFor={nameFor} hasExpenses={activityExpenses.length>0} hasRepayments={activitySettlements.length>0} onClose={()=>setModal(null)} onSubmit={(decisions)=>addActivityMembersBatch(modal.memberIds||[],decisions)}/>} 
    {modal?.kind==='addActivityMemberChoice'&&<ConfirmModal title={`將 ${nameFor(modal.targetUid)} 加入活動`} confirmText={`將共同支出改為 ${activity.participantIds.length+1} 人分攤`} cancelText="稍後更改，維持原狀" onClose={()=>addActivityMember(modal.targetUid,false)} onConfirm={()=>addActivityMember(modal.targetUid,true)}><p>這個活動目前已有 {activityExpenses.length} 筆支出。只有「全活動成員共同平均」的既有支出會安全重新計算；特殊分攤不會被擅自改動。</p>{activitySettlements.length>0&&<p className="field-hint"><LockKeyhole size={15}/>活動已開始結算，現在只能維持原狀，稍後再重新檢查。</p>}</ConfirmModal>}
    {modal?.kind==='reviewMember'&&<ConfirmModal title={`重新檢查 ${nameFor(modal.targetUid)}`} confirmText="套用至既有共同支出" cancelText="維持原狀，不再提醒" onClose={()=>{resolveMemberReview(modal.targetUid,false);setModal(null);}} onConfirm={()=>{resolveMemberReview(modal.targetUid,true);setModal(null);}}><p>如果這位成員原本就應該參與前面的共同支出，可以重新計算；如果是中途加入，維持原狀即可。</p></ConfirmModal>}
    {modal?.kind==='confirmRemoveActivityMember'&&<ConfirmModal danger title={`將 ${nameFor(modal.targetUid)} 移出活動？`} confirmText="確認重新計算並移出" onClose={()=>setModal(null)} onConfirm={()=>confirmRemoveActivityMember(modal.targetUid)}><p>活動成員將從 {activity.participantIds.length} 人變成 {activity.participantIds.length-1} 人；可安全重新計算的共同平均支出會一次更新。</p>{modal.unsafeCount>0&&<p className="field-hint"><CircleAlert size={15}/>{modal.unsafeCount} 筆私人／自訂／特殊分攤需要先人工處理，系統不會擅自分給其他人。</p>}</ConfirmModal>}
    {modal?.kind==='payment'&&<PaymentModal transfer={modal.transfer} users={data.users} nameFor={nameFor} onClose={()=>setModal(null)} onSubmit={(amount,method,meta)=>requestPayment(modal.transfer,amount,method,meta)}/>} 
    {modal?.kind==='issue'&&<IssueModal settlement={modal.settlement} nameFor={nameFor} onClose={()=>setModal(null)} onSubmit={(reason,note)=>disputePayment(modal.settlement,reason,note)}/>} 
    {modal?.kind==='expense'&&activity&&<ExpenseForm key={editingExpense?.id||draftExpense?.id||'new'} activity={activity} users={Object.fromEntries(activity.participantIds.map((id)=>[id,{...data.users[id],nickname:nameFor(id)}]))} actorId={actorId} expense={editingExpense} draft={draftExpense} remainderOffset={activityExpenses.length} onClose={()=>setModal(null)} onDraft={(snapshot,id)=>saveDraft(snapshot,id)} onSave={(fields,id)=>saveExpense(fields,editingExpense,id)}/>} 
    {detailExpense&&<ExpenseDetail expense={detailExpense} actorId={actorId} userName={nameFor} editable={canEditExpense(group,detailExpense,actorId,data.settlements)} locked={lockedActivity} onClose={()=>setModal(null)} onEdit={()=>setModal({kind:'expense',expenseId:detailExpense.id})}/>} 
  </div>;
}

function NotificationRow({ item, unread, onRead, onOpen }) {
  const ref=useRef(null);
  useEffect(()=>{
    if(!unread||!ref.current)return undefined;
    if(!('IntersectionObserver' in window)){onRead(item.key);return undefined;}
    const observer=new IntersectionObserver((entries)=>{if(entries.some((entry)=>entry.isIntersecting&&entry.intersectionRatio>=0.55)){onRead(item.key);observer.disconnect();}},{threshold:[0.55]});
    observer.observe(ref.current);return()=>observer.disconnect();
  },[item.key,unread,onRead]);
  const Icon=item.type==='alert'?CircleAlert:item.type==='payment'?Wallet:item.type==='change'?Pencil:Bell;
  return <button ref={ref} type="button" className={`notification-row ${unread?'unread':''} ${item.type==='alert'?'alert':''}`} onClick={()=>onOpen(item)}><span className="notification-icon"><Icon size={18}/></span><span className="notification-copy"><strong>{item.title}</strong><small>{item.detail}</small><em>{formattedTime(item.at)}</em></span>{item.actionable&&<span className="actionable-pill">待處理</span>}<ChevronRight size={17}/></button>;
}

function NotificationScreen({ items, readKeys, onRead, onBack, onOpen }) {
  const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  const sections=[['今天',items.filter((x)=>new Date(x.at)>=today)],['昨天',items.filter((x)=>new Date(x.at)>=yesterday&&new Date(x.at)<today)],['更早',items.filter((x)=>new Date(x.at)<yesterday)]];
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>首頁</button><div className="page-title-row"><div><h1>通知</h1><p>最近 90 天；真正完整的帳務歷史仍在各活動修改紀錄。</p></div></div>{items.length===0?<EmptyState icon={Bell} title="目前沒有通知" detail="帳目變更、待確認還款等消息會出現在這裡。"/>:sections.map(([label,rows])=>rows.length>0&&<section className="notification-section" key={label}><h2>{label}</h2><div className="notification-list">{rows.map((item)=><NotificationRow key={item.key} item={item} unread={!readKeys.includes(item.key)} onRead={onRead} onOpen={onOpen}/>)}</div></section>)}</>;
}

function ProfileScreen({ actor, account, groups, nameFor, actorId, onBack, onEditAccountName, onArchived, onConnectGoogle, onOpenGroupNickname }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>首頁</button><div className="profile-hero"><span className="profile-avatar">{initials(actor.accountName||actor.nickname)}</span><div><h1>我的</h1><p>{actor.accountName||actor.nickname}</p></div></div><section className="content-card"><div className="settings-simple-row"><span>帳號名稱</span><strong>{actor.accountName||actor.nickname}</strong></div><button className="settings-link-row" type="button" onClick={onEditAccountName}><span>修改帳號名稱</span><Pencil size={16}/></button><p className="muted tiny-note">修改帳號名稱不會更動既有群組暱稱，只會成為之後加入／建立新群組時的預設值。</p></section><section className="content-card"><div className="settings-label"><div className="settings-illustration"><Link2 size={19}/></div><div><h2>Google 帳號</h2><p>{account.googleLinked?'已連結，可作為日後找回帳號的入口。':'尚未連結；建議連結以利未來找回帳號。'}</p></div></div>{account.googleLinked?<div className="linked-state"><CheckCircle2 size={17}/>已連結</div>:<button className="outline-button full" type="button" onClick={onConnectGoogle}>連結 Google</button>}<p className="muted tiny-note">2.1 原型僅模擬連結狀態；第一版不提供解除連結。</p></section><section className="content-card"><div className="section-heading in-card"><div><h2>我的群組暱稱</h2><p>不同群組可以使用不同暱稱。</p></div></div>{groups.slice(0,5).map((g)=><button type="button" className="profile-group-nickname" key={g.id} onClick={()=>onOpenGroupNickname(g.id)}><span>{g.name}</span><strong>{nameFor(actorId,g)}</strong><ChevronRight size={16}/></button>)}</section><section className="content-card"><button className="settings-link-row" type="button" onClick={onArchived}><span>已封存群組</span><Archive size={17}/></button><div className="settings-label"><div className="settings-illustration"><Settings2 size={19}/></div><div><h2>其他設定</h2><p>通知設定、外觀與關於 Bopli 將逐步補齊。</p></div></div></section></>;
}

function ArchivedGroups({ groups, actorId, onBack, onRestore }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>我的</button><div className="page-title-row"><div><h1>已封存群組</h1><p>封存不會刪除歷史帳目。</p></div></div>{groups.length===0?<EmptyState icon={Archive} title="沒有封存群組" detail="封存的群組會出現在這裡。"/>:<div className="card-list">{groups.map((g)=><article className="archived-group-card" key={g.id}><div><strong>{g.name}</strong><small>{g.memberIds.length} 位成員</small></div>{g.ownerUid===actorId&&<button className="outline-button" type="button" onClick={()=>onRestore(g.id)}>恢復</button>}</article>)}</div>}</>;
}

function GroupScreen({ group, activities, data, actorId, nameFor, financesFor, canInvite, onBack, onInvite, onSettings, onOpenActivity, onCreateActivity }) {
  return <><div className="group-topbar"><button className="icon-button" onClick={onBack}><ArrowLeft size={20}/></button><div className="group-title"><small>朋友群組</small><h1>{group.name}</h1></div><div className="activity-top-actions">{canInvite&&<button className="icon-button" onClick={onInvite}><UserRoundPlus size={20}/></button>}<button className="icon-button" onClick={onSettings}><Settings2 size={20}/></button></div></div><div className="member-strip">{group.memberIds.slice(0,6).map((id)=><PersonAvatar key={id} name={nameFor(id)}/>)}{group.memberIds.length>6&&<span className="member-more">+{group.memberIds.length-6}</span>}</div><div className="section-heading"><div><h2>活動</h2><p>每次聚餐、旅行或採買各自結算。</p></div></div>{activities.length===0?<EmptyState icon={ReceiptText} title="還沒有活動" detail="建立第一個活動，開始記帳。" action="建立活動" onAction={onCreateActivity}/>:<div className="card-list">{activities.map((a)=>{const f=financesFor(a);const bal=f.projected[actorId]||0;const pending=data.settlements.some((s)=>s.activityId===a.id&&s.status==='pending'&&(s.fromUid===actorId||s.toUid===actorId));const status=pending?'有待確認款項':bal>0?`我待收 ${formatMoney(bal)}`:bal<0?`我需付 ${formatMoney(Math.abs(bal))}`:'已結清';return <button key={a.id} className="activity-card click-card" type="button" onClick={()=>onOpenActivity(a.id)}><span className="activity-icon"><ReceiptText size={21}/></span><span className="card-main"><strong>{a.title}</strong><small>{status}</small></span><ChevronRight size={18}/></button>;})}</div>}<button className="outline-button full create-bottom" type="button" onClick={onCreateActivity}><Plus size={17}/>建立活動</button></>;
}

function GroupSettings({ group, actorId, nameFor, onBack, onToggleInvites, onToggleEdit, onMembers, onArchive }) {
  const owner=isOwner(group,actorId);
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>群組</button><div className="page-title-row"><div><h1>群組設定</h1><p>{group.name}</p></div></div><section className="content-card"><h2 className="card-section-title">群組資訊</h2><div className="settings-simple-row"><span>群組名稱</span><strong>{group.name}</strong></div><div className="settings-simple-row"><span>成員</span><strong>{group.memberIds.length} 人</strong></div></section><section className="content-card"><div className="settings-label"><div className="settings-illustration"><UserRoundPlus size={19}/></div><div><h2>成員與邀請</h2><p>固定名稱的權限開關，不會因狀態翻轉文案。</p></div></div><label className="toggle-row"><span>所有成員皆可邀請</span><input type="checkbox" checked={Boolean(group.allowMemberInvites)} disabled={!owner} onChange={onToggleInvites}/><span className="toggle-track"/></label><button className="settings-link-row" type="button" onClick={onMembers}><span>成員名單與角色</span><ChevronRight size={17}/></button></section><section className="content-card"><div className="settings-label"><div className="settings-illustration"><Pencil size={19}/></div><div><h2>記帳權限</h2><p>待確認／已結算資料仍受保護，不因共享編輯權限被覆寫。</p></div></div><label className="toggle-row"><span>所有成員皆可編輯</span><input type="checkbox" checked={group.editPolicy===EDIT_POLICY.ALL} disabled={!owner} onChange={onToggleEdit}/><span className="toggle-track"/></label></section><section className="content-card"><button className="settings-link-row" type="button"><span>查看修改紀錄</span><ChevronRight size={17}/></button>{owner&&<button className="settings-link-row danger-link" type="button" onClick={onArchive}><span>封存群組</span><Archive size={17}/></button>}</section>{!owner&&<p className="field-hint"><ShieldCheck size={15}/>只有群主可以調整群組權限與所有權層級設定。</p>}</>;
}

function GroupMembers({ group, actorId, nameFor, canAddTest, onBack, onOpen, onRemove, onAddTest, onExit }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>群組設定</button><div className="page-title-row"><div><h1>成員</h1><p>{group.memberIds.length} 位成員 · 副群主最多 3 位</p></div></div>{canAddTest&&<section className="prototype-member-tools"><div><strong>測試版成員工具</strong><small>邀請連結尚未接後端，可先直接建立本機測試成員。</small></div><button className="outline-button" type="button" onClick={onAddTest}><UserRoundPlus size={16}/>新增測試成員</button></section>}<p className="swipe-hint">群主可在成員列向右滑，露出「移除」按鈕；滑到底不會直接移除。</p><div className="member-list-card">{group.memberIds.map((uid)=>{const role=uid===group.ownerUid?'群主':group.deputyUids?.includes(uid)?'副群主':'一般成員';return <SwipeMemberRow key={uid} memberId={uid} name={nameFor(uid)} role={role} canRemove={isOwner(group,actorId)&&uid!==group.ownerUid} onOpen={onOpen} onRemove={onRemove}/>;})}</div><button className="exit-group-button" type="button" onClick={onExit}><LogOut size={17}/>退出群組</button></>;
}

function MemberDetail({ group, targetUid, actorId, nameFor, activities, isDeputy:isDeputyFn, onBack, onEditNickname, onDeputy }) {
  const self=targetUid===actorId;const owner=isOwner(group,actorId);const deputy=isDeputyFn(targetUid);
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>成員名單</button><div className="member-profile"><PersonAvatar name={nameFor(targetUid)}/><div><h1>{nameFor(targetUid)}</h1><p>{targetUid===group.ownerUid?'群主':deputy?'副群主':'群組成員'}</p></div></div>{self&&<section className="content-card"><div className="section-heading in-card"><div><h2>我的群組暱稱</h2><p>修改後，這個群組的所有活動會同步顯示新暱稱。</p></div></div><button className="settings-link-row" type="button" onClick={onEditNickname}><span>{nameFor(targetUid)}</span><Pencil size={16}/></button></section>}{owner&&!self&&targetUid!==group.ownerUid&&<section className="content-card"><h2 className="card-section-title">管理角色</h2><button className="settings-link-row" type="button" onClick={()=>onDeputy(targetUid,!deputy)}><span>{deputy?'取消副群主':'設為副群主'}</span><Crown size={17}/></button><p className="muted small">只有群主可以新增或取消副群主；副群主最多 3 位。</p></section>}<section className="content-card"><h2 className="card-section-title">共同活動</h2>{activities.filter((a)=>a.participantIds.includes(targetUid)).map((a)=><div className="settings-simple-row" key={a.id}><span>{a.title}</span><strong>參與中</strong></div>)}</section></>;
}

function ActivitySettings({ activity, group, canManage, nameFor, onBack, onMembers }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>活動</button><div className="page-title-row"><div><h1>活動設定</h1><p>{activity.title}</p></div></div><section className="content-card"><button className="settings-link-row" type="button" onClick={onMembers}><span>活動成員 · {activity.participantIds.length} 人</span><ChevronRight size={17}/></button>{activity.memberReviewIds?.length>0&&<p className="field-hint"><Info size={15}/>{activity.memberReviewIds.length} 位新成員尚未套用至既有共同支出。</p>}</section><section className="content-card"><h2 className="card-section-title"><History size={17}/>修改紀錄</h2>{(activity.auditHistory||[]).length===0?<p className="muted small">目前沒有活動層級修改紀錄。</p>:[...activity.auditHistory].reverse().map((ev)=><div className="history-line" key={ev.id}><strong>{nameFor(ev.by)}</strong> {ev.message}<small>{formattedTime(ev.at)}</small></div>)}</section>{!canManage&&<p className="field-hint"><LockKeyhole size={15}/>活動成員管理僅限群主與副群主。</p>}</>;
}

function ActivityMembers({ activity, group, nameFor, canManage, onBack, onAdd, onAddMany, onRemove, onReview }) {
  const remaining=group.memberIds.filter((id)=>!activity.participantIds.includes(id));
  const [selected,setSelected]=useState([]);
  useEffect(()=>setSelected((prev)=>prev.filter((id)=>remaining.includes(id))),[activity.id,remaining.join('|')]);
  const toggle=(uid)=>setSelected((prev)=>prev.includes(uid)?prev.filter((id)=>id!==uid):[...prev,uid]);
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>活動設定</button><div className="page-title-row"><div><h1>活動成員</h1><p>{activity.participantIds.length} 人參與</p></div></div>{activity.memberReviewIds?.length>0&&<section className="content-card review-card"><h2 className="card-section-title">待重新檢查</h2>{activity.memberReviewIds.map((uid)=><div className="member-row" key={uid}><PersonAvatar name={nameFor(uid)} small/><span>{nameFor(uid)}</span><button className="small-action" type="button" disabled={!canManage} onClick={()=>onReview(uid)}>重新檢查</button></div>)}</section>}<section className="content-card">{activity.participantIds.map((uid)=><div className="member-row" key={uid}><PersonAvatar name={nameFor(uid)} small/><span>{nameFor(uid)}</span>{canManage&&<button className="small-action danger-text" type="button" onClick={()=>onRemove(uid)}>移出活動</button>}</div>)}</section>{remaining.length>0&&<section className="content-card"><div className="section-heading in-card"><div><h2>加入群組內成員</h2><p>可單獨加入，也可一次選多人後逐人設定是否套用舊支出。</p></div></div><div className="picker-actions"><button type="button" onClick={()=>setSelected([...remaining])}>全選</button><button type="button" onClick={()=>setSelected([])}>清除選取</button></div>{remaining.map((uid)=><div className="member-row selectable-member-row" key={uid}><button className={`member-select-dot ${selected.includes(uid)?'selected':''}`} type="button" onClick={()=>toggle(uid)} aria-label={`選取 ${nameFor(uid)}`}>{selected.includes(uid)&&<Check size={13}/>}</button><PersonAvatar name={nameFor(uid)} small/><span>{nameFor(uid)}</span><button className="small-action" disabled={!canManage} type="button" onClick={()=>onAdd(uid)}><Plus size={15}/>加入</button></div>)}{selected.length>0&&<button className="primary-button full" disabled={!canManage} type="button" onClick={()=>onAddMany(selected)}>批次加入 {selected.length} 人</button>}</section>}</>;
}

function ExpensesTab({ activity, expenses, drafts, actorId, nameFor, finances, filter, setFilter, locked, onExpense, onAdd, onDraft, onDiscardDraft, onReview }) {
  const myBalance=finances.balances?.[actorId]||0;
  const visible=expenses.filter((e)=>filter==='all'||(e.allocations?.[actorId]||0)>0||(e.payments||[{uid:e.paidBy,amount:e.amount}]).some((p)=>p.uid===actorId));
  const activityTotal=expenses.reduce((sum,e)=>sum+(e.amount||0),0);
  return <><section className="my-summary-card"><small>我的帳目</small><strong>{myBalance>0?`我目前還有 ${formatMoney(myBalance)} 待收`:myBalance<0?`我目前還需要付 ${formatMoney(Math.abs(myBalance))}`:'目前已結清'}</strong><span className="secondary-total">活動總支出 {formatMoney(activityTotal)}</span></section>{activity.memberReviewIds?.length>0&&<button className="member-review-banner" type="button" onClick={onReview}><Info size={16}/><span>有 {activity.memberReviewIds.length} 位成員尚未套用至既有共同支出</span><ChevronRight size={16}/></button>}{drafts.length>0&&<section><div className="section-heading"><div><h2>草稿</h2><p>草稿不計入活動總額與結算。</p></div></div><div className="draft-list">{drafts.slice(0,3).map((d)=><article className="draft-card" key={d.id}><button type="button" className="draft-main" onClick={()=>onDraft(d.id)}><strong>{d.title}</strong><small>{d.status||'尚未完成'}</small><span>繼續編輯 <ChevronRight size={15}/></span></button><button className="icon-button" type="button" onClick={()=>onDiscardDraft(d.id)}><MoreHorizontal size={18}/></button></article>)}</div></section>}<div className="section-heading"><div><h2>支出紀錄</h2><p>點整張卡片查看我的帳目、付款與商品分攤。</p></div><span className="count-pill">{expenses.length} 筆</span></div>{expenses.length>0&&<div className="ledger-filters expense-filters"><button type="button" className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>全部</button><button type="button" className={filter==='mine'?'active':''} onClick={()=>setFilter('mine')}>與我有關</button></div>}{expenses.length===0?<EmptyState icon={ReceiptText} title="還沒有任何支出" detail="新增第一筆支出，Bopli 會自動計算每個人的分攤。" action="新增支出" onAction={onAdd}/>:<><div className="card-list">{[...visible].reverse().map((e)=><ExpenseSummary key={e.id} expense={e} userName={nameFor} actorId={actorId} onClick={()=>onExpense(e.id)}/>)}</div><button className="primary-button full add-expense-single" type="button" onClick={onAdd}><Plus size={18}/>新增支出</button></>}{locked&&<div className="info-card"><LockKeyhole size={17}/><p>活動已有待確認／已確認／有爭議的還款紀錄，支出修改受到保護。</p></div>}</>;
}

function SettlementTab({ activity, group, actorId, nameFor, expenses, settlements, baseBalances, baseProjected, finalFinance, onUpdateActivity, onPay, onConfirm, onIssue, onAll }) {
  const pendingMine=settlements.filter((s)=>s.status==='pending'&&s.toUid===actorId);
  const completedMine=settlements.filter((s)=>s.status==='confirmed'&&(s.fromUid===actorId||s.toUid===actorId));
  const transfers=activity.roundingLockedAt?finalFinance.transfers:suggestTransfers(baseProjected);
  const pay=transfers.filter((t)=>t.fromUid===actorId); const receive=transfers.filter((t)=>t.toUid===actorId);
  const allClear=pendingMine.length===0&&pay.length===0&&receive.length===0;
  return <>{allClear?<div className="settled-hero"><CheckCircle2 size={31}/><h2>目前已結清</h2><p>這個活動沒有待處理的款項。</p>{completedMine.length>0&&<details><summary>查看還款紀錄</summary>{completedMine.map((s)=><div className="history-line" key={s.id}>{nameFor(s.fromUid)} → {nameFor(s.toUid)} <strong>{formatMoney(s.amount)}</strong></div>)}</details>}</div>:<>{pendingMine.length>0&&<section><div className="section-heading"><div><h2>待我確認</h2><p>確認後才會正式計入結算。</p></div></div><div className="card-list">{pendingMine.map((s)=><div className="repayment-card priority-card" key={s.id}><div className="repayment-top"><strong>{nameFor(s.fromUid)} → 我</strong><span className="status-tag">待確認</span></div><strong className="repayment-amount">{formatMoney(s.amount)}</strong><div className="repayment-actions"><button className="primary-button" type="button" onClick={()=>onConfirm(s)}><Check size={15}/>確認已收到</button><button className="outline-button" type="button" onClick={()=>onIssue(s)}>金額有問題</button></div></div>)}</div></section>}{pay.length>0&&<section><div className="section-heading"><div><h2>我要付</h2><p>預設帶入完整未付金額，可改成部分付款。</p></div></div><div className="card-list">{pay.map((t)=><div className="transfer-card" key={`${t.fromUid}-${t.toUid}`}><div className="transfer-line"><PersonAvatar name={nameFor(t.toUid)} small/><div className="transfer-description"><strong>付給 {nameFor(t.toUid)}</strong><small>目前尚需安排</small></div><strong>{formatMoney(t.amount)}</strong></div><button className="outline-button full" type="button" onClick={()=>onPay(t)}>記錄付款</button></div>)}</div></section>}{receive.length>0&&<section><div className="section-heading"><div><h2>我要收</h2><p>等待對方記錄付款後，再由你確認。</p></div></div><div className="card-list">{receive.map((t)=><div className="transfer-card" key={`${t.fromUid}-${t.toUid}`}><div className="transfer-line"><PersonAvatar name={nameFor(t.fromUid)} small/><div className="transfer-description"><strong>{nameFor(t.fromUid)} → 我</strong><small>尚未付款</small></div><strong>{formatMoney(t.amount)}</strong></div></div>)}</div></section>}</>}
    <RoundingPanel activity={activity} group={group} actorId={actorId} expenses={expenses} baseBalances={baseBalances} nameFor={nameFor} onUpdateActivity={onUpdateActivity}/>
    <button className="outline-button full" type="button" onClick={onAll}>查看全部結算</button>
  </>;
}

function AllSettlements({ activity, users, nameFor, balances, transfers, onBack }) {
  const displayUsers=Object.fromEntries(activity.participantIds.map((id)=>[id,{...users[id],nickname:nameFor(id)}]));
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>結算</button><div className="page-title-row"><div><h1>全部結算</h1><p>查看所有成員的應收應付與轉帳建議。</p></div></div><BalanceBars participantIds={activity.participantIds} balances={balances} users={displayUsers}/><section className="content-card"><h2 className="card-section-title">所有建議轉帳</h2>{transfers.map((t)=><div className="settings-simple-row" key={`${t.fromUid}-${t.toUid}`}><span>{nameFor(t.fromUid)} → {nameFor(t.toUid)}</span><strong>{formatMoney(t.amount)}</strong></div>)}</section></>;
}
