import React, { useEffect, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, Bell, Check, CheckCircle2, ChevronRight, CircleAlert, Crown, History, Info,
  Link2, LockKeyhole, LogOut, Pencil, Plus, ReceiptText, Settings2, ShieldCheck, Shuffle,
  Trash2, UserRoundPlus, Wallet,
} from 'lucide-react';
import { formatMoney } from '../lib/money.js';
import { EDIT_POLICY, isOwner } from '../lib/domain.js';
import { APP_LABEL } from '../version.js';
import { EmptyState, PersonAvatar, SwipeMemberRow } from './AppPrimitives.jsx';

const formattedTime = (date) => date ? new Date(date).toLocaleString('zh-TW', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const initials = (name) => (name || '?').slice(0, 1);

export function NotificationRow({ item, unread, onRead, onOpen }) {
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

export function NotificationScreen({ items, readKeys, onRead, onBack, onOpen }) {
  const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  const sections=[['今天',items.filter((x)=>new Date(x.at)>=today)],['昨天',items.filter((x)=>new Date(x.at)>=yesterday&&new Date(x.at)<today)],['更早',items.filter((x)=>new Date(x.at)<yesterday)]];
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>首頁</button><div className="page-title-row"><div><h1>通知</h1><p>最近 90 天；真正完整的帳務歷史仍在各活動修改紀錄。</p></div></div>{items.length===0?<EmptyState icon={Bell} title="目前沒有通知" detail="帳目變更、待確認還款等消息會出現在這裡。"/>:sections.map(([label,rows])=>rows.length>0&&<section className="notification-section" key={label}><h2>{label}</h2><div className="notification-list">{rows.map((item)=><NotificationRow key={item.key} item={item} unread={!readKeys.includes(item.key)} onRead={onRead} onOpen={onOpen}/>)}</div></section>)}</>;
}

export function ProfileScreen({ actor, account, groups, nameFor, actorId, primaryUserId, onBack, onEditAccountName, onArchived, onConnectGoogle, onOpenGroupNickname, onSwitchIdentity }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>首頁</button><div className="profile-hero"><span className="profile-avatar">{initials(actor.accountName||actor.nickname)}</span><div><h1>我的</h1><p>{actor.accountName||actor.nickname}</p></div></div><section className="content-card"><div className="settings-simple-row"><span>帳號名稱</span><strong>{actor.accountName||actor.nickname}</strong></div><button className="settings-link-row" type="button" onClick={onEditAccountName}><span>修改帳號名稱</span><Pencil size={16}/></button><p className="muted tiny-note">修改帳號名稱不會更動既有群組暱稱，只會成為之後加入／建立新群組時的預設值。</p></section><section className="content-card"><div className="settings-label"><div className="settings-illustration"><Link2 size={19}/></div><div><h2>Google 帳號</h2><p>{account.googleLinked?'已連結，可作為日後找回帳號的入口。':'尚未連結；建議連結以利未來找回帳號。'}</p></div></div>{account.googleLinked?<div className="linked-state"><CheckCircle2 size={17}/>已連結</div>:<button className="outline-button full" type="button" onClick={onConnectGoogle}>連結 Google</button>}<p className="muted tiny-note">2.1 原型僅模擬連結狀態；第一版不提供解除連結。</p></section><section className="content-card"><div className="section-heading in-card"><div><h2>我的群組暱稱</h2><p>不同群組可以使用不同暱稱。</p></div></div>{groups.slice(0,5).map((g)=><button type="button" className="profile-group-nickname" key={g.id} onClick={()=>onOpenGroupNickname(g.id)}><span>{g.name}</span><strong>{nameFor(actorId,g)}</strong><ChevronRight size={16}/></button>)}</section><section className="content-card test-tools-card"><div className="settings-label"><div className="settings-illustration"><Shuffle size={19}/></div><div><h2>測試工具</h2><p>{APP_LABEL} 可切換不同成員視角測試權限與帳目。</p></div></div><button className="settings-link-row" type="button" onClick={onSwitchIdentity}><span>切換測試身分</span><strong>{actorId===primaryUserId?'目前為預設身分':'目前為模擬身分'}</strong><ChevronRight size={17}/></button></section><section className="content-card"><button className="settings-link-row" type="button" onClick={onArchived}><span>已封存群組</span><Archive size={17}/></button><div className="settings-label"><div className="settings-illustration"><Settings2 size={19}/></div><div><h2>其他設定</h2><p>通知設定、外觀與關於 Bopli 將逐步補齊。</p></div></div></section></>;
}

export function ArchivedGroups({ groups, actorId, onBack, onRestore, onDelete }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>我的</button><div className="page-title-row"><div><h1>已封存群組</h1><p>封存不會刪除歷史帳目。</p></div></div>{groups.length===0?<EmptyState icon={Archive} title="沒有封存群組" detail="封存的群組會出現在這裡。"/>:<div className="card-list">{groups.map((g)=><article className="archived-group-card" key={g.id}><div><strong>{g.name}</strong><small>{g.memberIds.length} 位成員</small></div>{g.ownerUid===actorId&&<span><button className="outline-button" type="button" onClick={()=>onRestore(g.id)}>恢復</button><button className="small-action danger-text" type="button" onClick={()=>onDelete(g.id)}>永久刪除</button></span>}</article>)}</div>}</>;
}

export function GroupScreen({ group, activities, data, actorId, nameFor, financesFor, canInvite, historicalOnly=false, onBack, onInvite, onSettings, onOpenActivity, onCreateActivity }) {
  return <><div className="group-topbar"><button className="icon-button" onClick={onBack}><ArrowLeft size={20}/></button><div className="group-title"><small>{historicalOnly?'歷史帳務':'朋友群組'}</small><h1>{group.name}</h1></div><div className="activity-top-actions">{!historicalOnly&&canInvite&&<button className="icon-button" onClick={onInvite}><UserRoundPlus size={20}/></button>}{!historicalOnly&&<button className="icon-button" onClick={onSettings}><Settings2 size={20}/></button>}</div></div>{historicalOnly?<div className="info-card"><Info size={17}/><p>你已離開此群組，目前只顯示與你有關、仍需處理的歷史帳務。</p></div>:<div className="member-strip">{group.memberIds.slice(0,6).map((id)=><PersonAvatar key={id} name={nameFor(id)}/>)}{group.memberIds.length>6&&<span className="member-more">+{group.memberIds.length-6}</span>}</div>}<div className="section-heading"><div><h2>{historicalOnly?'我的歷史活動':'活動'}</h2><p>{historicalOnly?'完成結算後，已結清的退出成員不再占目前成員名單。':'每次聚餐、旅行或採買各自結算。'}</p></div></div>{activities.length===0?<EmptyState icon={ReceiptText} title={historicalOnly?'目前沒有待處理歷史帳目':'還沒有活動'} detail={historicalOnly?'與你有關的未結清帳目會顯示在這裡。':'建立第一個活動，開始記帳。'} action={historicalOnly?null:'建立活動'} onAction={historicalOnly?null:onCreateActivity}/>:<div className="card-list">{activities.map((a)=>{const f=financesFor(a);const bal=f.projected[actorId]||0;const pending=data.settlements.some((x)=>x.activityId===a.id&&x.status==='pending'&&(x.fromUid===actorId||x.toUid===actorId));const hasExpenses=data.expenses.some((e)=>e.activityId===a.id);const status=!hasExpenses?'尚未開始記帳':pending?'有待確認款項':bal>0?`我待收 ${formatMoney(bal)}`:bal<0?`我需付 ${formatMoney(Math.abs(bal))}`:'已結清';return <button key={a.id} className="activity-card click-card" type="button" onClick={()=>onOpenActivity(a.id)}><span className="activity-icon"><ReceiptText size={21}/></span><span className="card-main"><strong>{a.title}</strong><small>{status}</small></span><ChevronRight size={18}/></button>;})}</div>}{!historicalOnly&&<button className="outline-button full create-bottom" type="button" onClick={onCreateActivity}><Plus size={17}/>建立活動</button>}</>;
}

export function GroupSettings({ group, actorId, nameFor, onBack, onToggleInvites, onToggleEdit, onMembers, onArchive, onDelete }) {
  const owner=isOwner(group,actorId);
  const inviteText=group.allowMemberInvites?'所有成員':'只有群主';
  const editText=group.editPolicy===EDIT_POLICY.ALL?'所有成員':'只有記帳的人';
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>群組</button><div className="page-title-row"><div><h1>群組設定</h1><p>{group.name}</p></div></div>
    <section className="content-card"><button className="settings-link-row" type="button" onClick={onMembers}><span>成員</span><strong>{group.memberIds.length} 人</strong><ChevronRight size={17}/></button></section>
    <section className="content-card"><h2 className="card-section-title">權限</h2>
      {owner?<><button className="settings-link-row" type="button" onClick={onToggleInvites}><span>誰可以邀請朋友</span><strong>{inviteText}</strong><ChevronRight size={17}/></button><button className="settings-link-row" type="button" onClick={onToggleEdit}><span>誰可以修改支出</span><strong>{editText}</strong><ChevronRight size={17}/></button></>:<><div className="settings-simple-row"><span>邀請朋友</span><strong>{inviteText}</strong></div><div className="settings-simple-row"><span>修改支出</span><strong>{editText}</strong></div></>}
      <p className="muted tiny-note">已有還款的支出仍會自動鎖定，避免結算後被改寫。</p>
    </section>
    {owner&&<section className="content-card"><h2 className="card-section-title">群組管理</h2><button className="settings-link-row" type="button" onClick={onArchive}><span>封存群組</span><Archive size={17}/></button><button className="settings-link-row danger-link" type="button" onClick={onDelete}><span>永久刪除群組</span><Trash2 size={17}/></button></section>}
  </>;
}

export function GroupMembers({ group, actorId, nameFor, canAddTest, onBack, onOpen, onRemove, onAddTest, onExit }) {
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>群組設定</button><div className="page-title-row"><div><h1>成員</h1><p>{group.memberIds.length} 位成員 · 副群主最多 3 位</p></div></div>{canAddTest&&<section className="prototype-member-tools"><div><strong>測試版成員工具</strong><small>邀請連結尚未接後端，可先直接建立本機測試成員。</small></div><button className="outline-button" type="button" onClick={onAddTest}><UserRoundPlus size={16}/>新增測試成員</button></section>}<p className="swipe-hint">群主可在成員列向右滑，露出「移除」按鈕；滑到底不會直接移除。</p><div className="member-list-card">{group.memberIds.map((uid)=>{const role=uid===group.ownerUid?'群主':group.deputyUids?.includes(uid)?'副群主':'一般成員';return <SwipeMemberRow key={uid} memberId={uid} name={nameFor(uid)} role={role} canRemove={isOwner(group,actorId)&&uid!==group.ownerUid} onOpen={onOpen} onRemove={onRemove}/>;})}</div><button className="exit-group-button" type="button" onClick={onExit}><LogOut size={17}/>退出群組</button></>;
}

export function MemberDetail({ group, targetUid, actorId, nameFor, activities, isDeputy:isDeputyFn, onBack, onEditNickname, onDeputy }) {
  const self=targetUid===actorId;const owner=isOwner(group,actorId);const deputy=isDeputyFn(targetUid);
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>成員名單</button><div className="member-profile"><PersonAvatar name={nameFor(targetUid)}/><div><h1>{nameFor(targetUid)}</h1><p>{targetUid===group.ownerUid?'群主':deputy?'副群主':'群組成員'}</p></div></div>{self&&<section className="content-card"><div className="section-heading in-card"><div><h2>我的群組暱稱</h2><p>修改後，這個群組的所有活動會同步顯示新暱稱。</p></div></div><button className="settings-link-row" type="button" onClick={onEditNickname}><span>{nameFor(targetUid)}</span><Pencil size={16}/></button></section>}{owner&&!self&&targetUid!==group.ownerUid&&<section className="content-card"><h2 className="card-section-title">管理角色</h2><button className="settings-link-row" type="button" onClick={()=>onDeputy(targetUid,!deputy)}><span>{deputy?'取消副群主':'設為副群主'}</span><Crown size={17}/></button><p className="muted small">只有群主可以新增或取消副群主；副群主最多 3 位。</p></section>}<section className="content-card"><h2 className="card-section-title">共同活動</h2>{activities.filter((a)=>a.participantIds.includes(targetUid)).map((a)=><div className="settings-simple-row" key={a.id}><span>{a.title}</span><strong>參與中</strong></div>)}</section></>;
}

export function ActivitySettings({ activity, group, canManage, canDelete, nameFor, onBack, onMembers, onDelete }) {
  const history=[...(activity.auditHistory||[])].reverse();
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>活動</button><div className="page-title-row"><div><h1>活動設定</h1><p>{activity.title}</p></div></div>
    <section className="content-card"><button className="settings-link-row" type="button" onClick={onMembers}><span>一起分帳的人</span><strong>{activity.participantIds.length} 人</strong><ChevronRight size={17}/></button>{activity.memberReviewIds?.length>0&&<p className="field-hint"><Info size={15}/>{activity.memberReviewIds.length} 人需要確認是否要分攤加入前的支出。</p>}</section>
    <section className="content-card"><details className="disclosure"><summary>查看修改紀錄（{history.length}）</summary>{history.length===0?<p className="muted small">目前沒有修改紀錄。</p>:history.map((ev)=><div className="history-line" key={ev.id}><strong>{nameFor(ev.by)}</strong> {ev.message}<small>{formattedTime(ev.at)}</small></div>)}</details></section>
    {canDelete&&<section className="content-card"><h2 className="card-section-title">活動管理</h2><button className="settings-link-row danger-link" type="button" onClick={onDelete}><span>永久刪除活動</span><Trash2 size={17}/></button><p className="muted tiny-note">有未結清款項時會自動阻擋刪除。</p></section>}
  </>;
}

export function ActivityMembers({ activity, group, nameFor, canManage, onBack, onAdd, onAddMany, onRemove, onReview }) {
  const remaining=group.memberIds.filter((id)=>!activity.participantIds.includes(id));
  const [selected,setSelected]=useState([]);
  useEffect(()=>setSelected((prev)=>prev.filter((id)=>remaining.includes(id))),[activity.id,remaining.join('|')]);
  const toggle=(uid)=>setSelected((prev)=>prev.includes(uid)?prev.filter((id)=>id!==uid):[...prev,uid]);
  return <><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/>活動設定</button><div className="page-title-row"><div><h1>活動成員</h1><p>{activity.participantIds.length} 人參與</p></div></div>{activity.memberReviewIds?.length>0&&<section className="content-card review-card"><h2 className="card-section-title">待重新檢查</h2>{activity.memberReviewIds.map((uid)=><div className="member-row" key={uid}><PersonAvatar name={nameFor(uid)} small/><span>{nameFor(uid)}</span><button className="small-action" type="button" disabled={!canManage} onClick={()=>onReview(uid)}>重新檢查</button></div>)}</section>}<section className="content-card">{activity.participantIds.map((uid)=><div className="member-row" key={uid}><PersonAvatar name={nameFor(uid)} small/><span>{nameFor(uid)}</span>{canManage&&<button className="small-action danger-text" type="button" onClick={()=>onRemove(uid)}>移出活動</button>}</div>)}</section>{remaining.length>0&&<section className="content-card"><div className="section-heading in-card"><div><h2>加入群組內成員</h2><p>可單獨加入，也可一次選多人後逐人設定是否套用舊支出。</p></div></div><div className="picker-actions"><button type="button" onClick={()=>setSelected([...remaining])}>全選</button><button type="button" onClick={()=>setSelected([])}>清除選取</button></div>{remaining.map((uid)=><div className="member-row selectable-member-row" key={uid}><button className={`member-select-dot ${selected.includes(uid)?'selected':''}`} type="button" onClick={()=>toggle(uid)} aria-label={`選取 ${nameFor(uid)}`}>{selected.includes(uid)&&<Check size={13}/>}</button><PersonAvatar name={nameFor(uid)} small/><span>{nameFor(uid)}</span><button className="small-action" disabled={!canManage} type="button" onClick={()=>onAdd(uid)}><Plus size={15}/>加入</button></div>)}{selected.length>0&&<button className="primary-button full" disabled={!canManage} type="button" onClick={()=>onAddMany(selected)}>批次加入 {selected.length} 人</button>}</section>}</>;
}

