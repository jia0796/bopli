import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, History, LockKeyhole, Pencil, ReceiptText, Search, ShoppingBasket, X } from 'lucide-react';
import { formatMoney } from '../lib/money.js';
import { describeExpenseChanges } from '../lib/expenseHistory.js';
import { expenseChange, expensePayments, expensePaymentSummary } from '../lib/ledger.js';

const dateText = (date) => date ? new Date(date).toLocaleString('zh-TW', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';

const modeLabel = (mode) => ({ equal: '平均', custom: '自訂金額', ratio: '依比例', shopping: '購物單', quantity: '依購買數量' })[mode] || '平均';

function myAdvance(expense, actorId) {
  const paid = expensePayments(expense).filter((p) => p.uid === actorId).reduce((s, p) => s + p.amount, 0);
  const change = expenseChange(expense);
  return paid - (change?.receiverUid === actorId ? change.amount : 0);
}

export function ExpenseSummary({ expense, userName, actorId, onClick }) {
  const summary = expensePaymentSummary(expense);
  const change = expenseChange(expense);
  const share = expense.allocations?.[actorId] || 0;
  const advanced = myAdvance(expense, actorId);
  const related = share > 0 || advanced > 0;
  return (
    <button className="expense-summary click-card" type="button" onClick={onClick} aria-label={`查看 ${expense.title} ${formatMoney(expense.amount)} 的詳細帳目`}>
      <span className="expense-summary-icon">
        {summary.type === '購物單' ? <ShoppingBasket size={22} /> : <ReceiptText size={22} />}
      </span>
      <span className="expense-summary-body">
        <span className="expense-summary-title">{expense.title}</span>
        <span className="expense-summary-meta">
          {summary.payerCount === 1 ? `${userName(expensePayments(expense)[0]?.uid)} 付款` : `${summary.payerCount} 人付款`}
          {' · '}{summary.memberCount} 人分攤
        </span>
        <span className="expense-me-lines">
          {share > 0 ? <small>我分攤 <strong>{formatMoney(share)}</strong></small> : <small>{related ? '我未參與分攤' : '我未參與分攤'}</small>}
          {advanced > 0 && <small>我墊付 <strong>{formatMoney(advanced)}</strong></small>}
        </span>
        <span className="expense-summary-tags">
          <span>{summary.type}</span>
          {summary.type === '購物單' && <span>{summary.itemCount} 項</span>}
          {change && <span>找零 {formatMoney(change.amount)}</span>}
        </span>
      </span>
      <span className="expense-summary-end"><strong>{formatMoney(expense.amount)}</strong><ChevronRight size={17}/></span>
    </button>
  );
}

function DetailRows({ allocations, userName }) {
  return <div className="detail-rows">
    {Object.entries(allocations || {}).filter(([, amount]) => amount > 0).map(([uid, amount]) =>
      <div className="detail-row" key={uid}><span>{userName(uid)}</span><strong>{formatMoney(amount)}</strong></div>)}
  </div>;
}

function AllItemsPage({ lines, actorId, onBack }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const visible = useMemo(() => lines.filter((line) => {
    const matchesQuery = !query.trim() || (line.title || '').toLocaleLowerCase('zh-TW').includes(query.trim().toLocaleLowerCase('zh-TW'));
    const mine = (line.allocations?.[actorId] || 0) > 0;
    const special = !line.isAutoRemainder && (line.participantIds?.length || 0) < 3;
    const common = Boolean(line.isAutoRemainder) || (line.participantIds?.length || 0) >= 3;
    const matchesFilter = filter === 'all' || (filter === 'mine' && mine) || (filter === 'common' && common) || (filter === 'special' && special);
    return matchesQuery && matchesFilter;
  }), [lines, query, filter, actorId]);
  return <div className="all-items-page">
    <div className="modal-top"><button className="icon-button" type="button" onClick={onBack} aria-label="返回"><ArrowLeft size={20}/></button><h2>全部商品</h2><span className="modal-top-spacer"/></div>
    <label className="ledger-search"><Search size={17}/><input type="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="搜尋商品"/></label>
    <div className="ledger-filters item-filters">{[['all','全部'],['common','共同採買'],['special','特殊商品'],['mine','與我有關']].map(([id,label])=><button key={id} type="button" className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
    <div className="receipt-order-list">{visible.map((line,index)=><div className="receipt-order-row" key={`${line.title}-${index}`}><span className="receipt-index">{index+1}</span><span className="receipt-title">{line.title || '未命名品項'}</span><strong>{formatMoney(line.amount)}</strong></div>)}</div>
  </div>;
}

export function ExpenseDetail({ expense, userName, actorId, editable, deletable, locked, onEdit, onDelete, onClose }) {
  const [openLines, setOpenLines] = useState({});
  const [showAllItems, setShowAllItems] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const payments = expensePayments(expense);
  const change = expenseChange(expense);
  const lines = expense.lines?.length ? expense.lines : [{
    title: expense.title, amount: expense.amount, allocations: expense.allocations,
    splitMode: expense.splitMode, participantIds: expense.participantIds,
  }];
  const history = expense.history || [];
  const paid = payments.reduce((sum, item) => sum + item.amount, 0);
  const share = expense.allocations?.[actorId] || 0;
  const advanced = myAdvance(expense, actorId);
  const net = advanced - share;
  const myLines = lines.filter((line) => (line.allocations?.[actorId] || 0) > 0);
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-label={`${expense.title} 支出詳情`}>
        {showAllItems ? <AllItemsPage lines={lines} actorId={actorId} onBack={()=>setShowAllItems(false)}/> : <>
        <div className="modal-top"><h2>支出詳情</h2><button className="icon-button" type="button" aria-label="關閉" onClick={onClose}><X size={20}/></button></div>
        <div className="detail-amount"><span>{expense.title} · {expense.expenseType === 'shopping' ? '購物單' : '一般支出'}</span><strong>{formatMoney(expense.amount)}</strong><small>{dateText(expense.createdAt)} · {payments.length} 筆付款 · {lines.length} 項分攤</small></div>

        <section className="detail-section my-ledger-detail">
          <h3>我的帳目</h3>
          <div className="detail-rows">
            <div className="detail-row"><span>我的分攤</span><strong>{formatMoney(share)}</strong></div>
            {advanced > 0 && <div className="detail-row"><span>我的墊付</span><strong>{formatMoney(advanced)}</strong></div>}
            <div className="detail-row detail-row-total"><span>{net > 0 ? '這筆我應收' : net < 0 ? '這筆我應付' : '這筆已平衡'}</span><strong>{formatMoney(Math.abs(net))}</strong></div>
          </div>
        </section>

        <section className="detail-section"><details className="payment-collapse"><summary>付款與找零 · {payments.length} 位付款人{change ? ` · ${userName(change.receiverUid)} 收到 ${formatMoney(change.amount)} 找零` : ''}</summary><div className="detail-rows">
          {payments.map((payment, index) => <div className="detail-row" key={`${payment.uid}-${index}`}><span>{userName(payment.uid)} 交出</span><strong>{formatMoney(payment.amount)}</strong></div>)}
          {change && <div className="detail-row change-row"><span>{userName(change.receiverUid)} 收到找零</span><strong>− {formatMoney(change.amount)}</strong></div>}
          <div className="detail-row detail-row-total"><span>實際墊付合計</span><strong>{formatMoney(paid - (change?.amount || 0))}</strong></div>
        </div></details></section>

        <section className="detail-section"><div className="detail-section-heading"><h3>與我有關的商品</h3><span className="count-pill">{myLines.length} 項</span></div>
          {myLines.length===0 ? <p className="muted small">你沒有分攤這筆支出的任何商品。</p> : myLines.slice(0,6).map((line,index)=>{
            const opened=Boolean(openLines[index]);
            return <div className="detail-line-card" key={`${line.title}-${index}`}><button className="detail-line-trigger" type="button" aria-expanded={opened} onClick={()=>setOpenLines((prev)=>({...prev,[index]:!prev[index]}))}><span className="detail-line-copy"><strong>{line.title || '未命名品項'}</strong><small>{line.isAutoRemainder ? '共同採買' : modeLabel(line.splitMode)}</small></span><span className="detail-line-amount">我 {formatMoney(line.allocations?.[actorId] || 0)}</span><ChevronDown size={17} className={opened?'chevron-open':''}/></button>{opened&&<DetailRows allocations={line.allocations} userName={userName}/>}</div>;
          })}
          {lines.length > myLines.slice(0,6).length && <button className="outline-button full" type="button" onClick={()=>setShowAllItems(true)}>查看全部商品（{lines.length}）</button>}
        </section>

        <section className="detail-section history-entry-section"><button type="button" className="outline-button full" onClick={()=>setShowHistory(true)}><History size={17}/>查看修改紀錄</button></section>
        {showHistory&&<div className="history-sheet-overlay" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&setShowHistory(false)}><section className="history-sheet" role="dialog" aria-modal="true" aria-label="修改紀錄"><div className="history-sheet-top"><h3>修改紀錄</h3><button className="icon-button" type="button" aria-label="關閉修改紀錄" onClick={()=>setShowHistory(false)}><X size={20}/></button></div><div className="history-sheet-scroll">{history.length===0?<p className="muted small">尚無修改紀錄。由 {userName(expense.createdBy)} 建立。</p>:[...history].reverse().map((event)=><div className="audit-card" key={event.id}><div className="audit-title"><History size={15}/>{userName(event.by)} {event.type==='memberShareRemoved' ? ('移除了 ' + userName(event.targetUid) + ' 的舊分攤') : '修改了這筆支出'}<small>{dateText(event.at)}</small></div>{event.type==='memberShareRemoved' ? <div className="audit-change"><span>原分攤：{formatMoney(event.beforeShare)}</span><span>新分攤：{formatMoney(event.afterShare)}</span></div> : <div className="audit-change">{describeExpenseChanges(event.before,event.after,userName).map((change,index)=><span key={index}>{change}</span>)}</div>}</div>)}</div></section></div>}
        {editable||deletable ? <div className="expense-detail-actions">{editable&&<button type="button" className="primary-button" onClick={onEdit}><Pencil size={17}/>編輯支出</button>}{deletable&&<button type="button" className="danger-button" onClick={onDelete}>刪除支出</button>}</div> : <p className="field-hint"><LockKeyhole size={15}/>{locked ? '此支出影響既有還款，不能直接修改或刪除。' : '目前沒有修改這筆支出的權限。'}</p>}
        </>}
      </section>
    </div>
  );
}
