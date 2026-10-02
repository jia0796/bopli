import React, { useState } from 'react';
import { nameError } from '../lib/inputRules.js';
export function CloudInvite({session,group,onClose}) {
  const [code,setCode]=useState('');const [error,setError]=useState('');
  return <div className="modal-overlay"><section className="modal small-modal"><h2>邀請朋友</h2><p>邀請碼有效 7 天。朋友加入群組後，可由群主加入既有活動。</p>{code?<><output aria-label="邀請碼">{code}</output><button className="outline-button full" onClick={()=>navigator.clipboard.writeText(code).catch(()=>setError('請直接選取邀請碼複製'))}>複製邀請碼</button></>:<button className="primary-button full" onClick={()=>session.invite(group.id).then(r=>setCode(r.code)).catch(e=>setError(e.message))}>產生邀請碼</button>}{error&&<p role="alert">{error}</p>}<button className="outline-button full" onClick={onClose}>關閉</button></section></div>;
}
export function CloudJoin({session,accountName,onClose,onJoined}) {
  const [code,setCode]=useState('');const [nickname,setNickname]=useState(accountName);const [error,setError]=useState('');
  return <div className="modal-overlay"><section className="modal small-modal"><h2>加入群組</h2><form onSubmit={e=>{e.preventDefault();session.join(code.trim().toUpperCase(),nickname.trim()).then(r=>onJoined(r.groupId)).catch(e=>setError(e.message));}}><label className="field"><span>邀請碼</span><input autoFocus value={code} onChange={e=>setCode(e.target.value)} /></label><label className="field"><span>群組暱稱</span><input value={nickname} onChange={e=>setNickname(e.target.value)} /></label>{(error||nameError(nickname))&&<p role="alert">{error||nameError(nickname)}</p>}<button className="primary-button full" disabled={!code||Boolean(nameError(nickname))}>加入群組</button></form><button className="outline-button full" onClick={onClose}>取消</button></section></div>;
}
