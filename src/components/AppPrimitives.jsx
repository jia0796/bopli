import React, { useRef, useState } from 'react';
import { ArrowRight, ChevronRight, X } from 'lucide-react';

const initials = (name) => (name || '?').slice(0, 1);

export function PersonAvatar({ name, small=false }) {
  return <span className={`avatar ${small?'avatar-small':''}`} aria-hidden="true">{initials(name)}</span>;
}

export function EmptyState({ icon:Icon, title, detail, action=null, onAction=null }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={27}/></div><h3>{title}</h3><p>{detail}</p>{action&&<button type="button" className="outline-button" onClick={onAction}>{action}<ArrowRight size={16}/></button>}</div>;
}

export function ConfirmModal({ title, children, confirmText='確認', cancelText='再想想', danger=false, onConfirm, onClose }) {
  return <div className="modal-overlay" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal small-modal confirm-modal" role="dialog" aria-modal="true"><div className="modal-top"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose}><X size={20}/></button></div><div className="confirm-copy">{children}</div><div className="confirm-actions"><button type="button" className="outline-button" onClick={onClose}>{cancelText}</button><button type="button" className={danger?'danger-button':'primary-button'} onClick={onConfirm}>{confirmText}</button></div></section></div>;
}


export function SwipeMemberRow({ memberId, name, role, canRemove, onOpen, onRemove }) {
  const [revealed,setRevealed]=useState(false); const startX=useRef(0);
  function down(e){startX.current=e.clientX;}
  function up(e){const dx=e.clientX-startX.current;if(dx>45)setRevealed(true);else if(dx<-35)setRevealed(false);}
  return <div className={`swipe-member-row ${revealed?'revealed':''}`}><button className="swipe-remove" type="button" disabled={!canRemove} onClick={()=>onRemove(memberId)}>移除</button><button className="swipe-content" type="button" onPointerDown={down} onPointerUp={up} onClick={()=>revealed?setRevealed(false):onOpen(memberId)}><PersonAvatar name={name} small/><span className="member-row-main"><strong>{name}</strong><small>{role}</small></span><ChevronRight size={17}/></button></div>;
}

