import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, UsersRound } from 'lucide-react';
import { formatMoney } from '../lib/money.js';
import { memberLedger } from '../lib/ledger.js';

const money = (n) => formatMoney(Math.abs(n));
const methodNames = {transfer:'銀行轉帳',cash:'現金',mobile:'行動支付',other:'其他'};

function MoneyRow({ label, value, emphasized = false }) {
  return <div className={`ledger-money-row ${emphasized ? 'strong' : ''}`}><span>{label}</span><strong>{formatMoney(value)}</strong></div>;
}

export default function MemberLedger({ participantIds, users, actorId, expenses, settlements, finances, onOpenExpense }) {
  const [query, setQuery] = useState('');
  const [expandedUid, setExpandedUid] = useState(null);
  const [showSettled, setShowSettled] = useState(false);
  const ledgers = useMemo(() => memberLedger(participantIds, expenses, settlements, finances || {}), [participantIds, expenses, settlements, finances]);

  const ordered = useMemo(() => {
    const stableIndex = Object.fromEntries(participantIds.map((id, i) => [id, i]));
    const rows = participantIds.map((uid) => ({ uid, ...ledgers[uid] }));
    return rows.sort((a,b) => {
      if (a.uid === actorId) return -1;
      if (b.uid === actorId) return 1;
      const rank = (row) => row.balance !== 0 ? 0 : (row.pendingIn || row.pendingOut) ? 1 : 2;
      return rank(a)-rank(b) || stableIndex[a.uid]-stableIndex[b.uid];
    });
  }, [participantIds, ledgers, actorId]);

  const filtered = ordered.filter((row) => users[row.uid]?.nickname?.toLocaleLowerCase('zh-TW').includes(query.trim().toLocaleLowerCase('zh-TW')));
  const unsettled = filtered.filter((row) => row.balance !== 0 || row.pendingIn || row.pendingOut);
  const started = expenses.length > 0;
  const settled = filtered.filter((row) => row.balance === 0 && !row.pendingIn && !row.pendingOut);

  function renderCard(row) {
    const uid=row.uid; const expanded=expandedUid===uid;
    const status=row.balance>0?'應收':row.balance<0?'應付':(row.pendingIn||row.pendingOut)?'待確認':started?'已結清':'尚未開始記帳';
    return <article className={`ledger-person-card ${expanded?'expanded':''}`} key={uid}>
      <button className="ledger-person-trigger compact-ledger-trigger" type="button" aria-expanded={expanded} onClick={()=>setExpandedUid(expanded?null:uid)}>
        <span className="ledger-avatar" aria-hidden="true">{users[uid]?.nickname?.slice(0,1)||'?'}</span>
        <span className="ledger-person-main"><strong>{users[uid]?.nickname || '未知成員'} {uid===actorId&&<small className="me-inline">我</small>}</strong></span>
        <span className={`ledger-person-value ${row.balance>0?'receivable':row.balance<0?'payable':''}`}><small>{status}</small><strong>{row.balance===0?((row.pendingIn||row.pendingOut)?money((row.pendingIn||0)+(row.pendingOut||0)):'—'):money(row.balance)}</strong></span>
        <ChevronRight size={17} className={expanded?'chevron-open':''}/>
      </button>
      {expanded&&<div className="ledger-expanded">
        <MoneyRow label="實際墊付" value={row.advanced} emphasized/>
        <MoneyRow label="應分攤" value={row.share}/>
        {row.roundingCredit>0&&<MoneyRow label="尾差增加應收" value={row.roundingCredit}/>}
        <MoneyRow label="已確認付給別人" value={row.repaid}/>
        <MoneyRow label="已確認收到還款" value={row.received}/>
        {(row.pendingOut||row.pendingIn)?<div className="ledger-pending">待確認：付出 {money(row.pendingOut)} ／ 收取 {money(row.pendingIn)}。待確認金額不視為已結清。</div>:null}
        <div className="ledger-net"><span>目前{status}</span><strong>{row.balance===0?formatMoney(0):money(row.balance)}</strong></div>
        {row.expenseRows.length>0&&<details className="ledger-subsection disclosure"><summary>相關支出（{row.expenseRows.length}）</summary>{[...row.expenseRows].reverse().map((item)=><button type="button" key={item.expenseId} className="ledger-expense-link" onClick={()=>onOpenExpense(item.expenseId)}><span><strong>{item.title}</strong><small>墊付 {money(item.advanced)} ／ 分攤 {money(item.share)}</small></span><span className={item.net>=0?'receivable':'payable'}>{item.net>0?'+':item.net<0?'−':''}{money(item.net)}</span></button>)}</details>}
        {row.repaymentRows.length>0&&<details className="ledger-subsection disclosure"><summary>還款紀錄（{row.repaymentRows.length}）</summary>{[...row.repaymentRows].reverse().map((item)=><div className="ledger-repayment" key={item.id}><span>{item.fromUid===uid?'付給朋友':'朋友付給他'} · {methodNames[item.method]||'其他'}<small>{item.status==='confirmed'?'已確認':item.status==='pending'?'待確認':'有問題'}</small></span><strong>{money(item.amount)}</strong></div>)}</details>}
      </div>}
    </article>;
  }

  return <section className="member-ledger">
    <div className="section-heading"><div><h2>成員帳目</h2><p>{participantIds.length} 位成員 · {unsettled.length} 位仍有待處理帳目</p></div></div>
    <label className="ledger-search"><Search size={17}/><input type="search" placeholder="搜尋成員" aria-label="搜尋成員" value={query} onChange={(e)=>setQuery(e.target.value)}/></label>
    {filtered.length===0?<div className="empty-state compact-empty"><UsersRound size={22}/><h3>找不到成員</h3><p>請調整搜尋關鍵字。</p></div>:<div className="card-list ledger-person-list">{unsettled.map(renderCard)}
      {settled.length>0&&<><button className="settled-collapse" type="button" onClick={()=>setShowSettled((v)=>!v)}><span>{started?'已結清':'尚未開始記帳'} {settled.length} 人</span><span>{showSettled?'收合':'展開'} <ChevronDown size={15} className={showSettled?'chevron-open':''}/></span></button>{showSettled&&settled.map(renderCard)}</>}
    </div>}
  </section>;
}

export function BalanceBars({ participantIds, balances, users }) {
  const [showAll,setShowAll] = useState(false);
  const entries = participantIds.map((uid)=>({uid,amount:balances[uid] || 0})).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
  const max = Math.max(1, ...entries.map((item)=>Math.abs(item.amount)));
  const shown = showAll ? entries : entries.slice(0,6);
  if (!entries.some((entry)=>entry.amount !== 0)) return null;
  return <section className="content-card balance-chart-card">
    <div className="section-heading in-card"><div><h2>應收與應付比較</h2><p>補充視覺化，不取代實際結算明細</p></div></div>
    <div className="balance-chart" role="img" aria-label="所有成員的應收與應付金額水平長條比較">
      <div className="balance-chart-head"><span>應付</span><span>應收</span></div>
      {shown.map(({uid,amount})=><div className="balance-chart-row" key={uid}><span className="balance-chart-name">{users[uid]?.nickname || '未知成員'}</span><span className="balance-chart-half negative"><span style={{width:`${amount<0?100*Math.abs(amount)/max:0}%`}}/></span><span className="balance-chart-half positive"><span style={{width:`${amount>0?100*amount/max:0}%`}}/></span><strong className={amount>0?'receivable':amount<0?'payable':''}>{amount>0?'+':amount<0?'−':''}{money(amount)}</strong></div>)}
    </div>
    {entries.length>6&&<button className="outline-button full" type="button" onClick={()=>setShowAll(!showAll)}>{showAll?'收起成員':`查看全部 ${entries.length} 位成員`}</button>}
  </section>;
}
