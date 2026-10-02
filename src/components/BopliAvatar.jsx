import React from 'react';
import {avatarFor} from '../lib/avatars.js';
export default function BopliAvatar({avatarId,size=48}) {
  const avatar=avatarFor(avatarId);
  return <svg className="bopli-avatar" data-avatar={avatar.id} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Bopli ${avatar.label}頭像`}>
    <circle cx="50" cy="50" r="49" fill={avatar.background}/>
    <ellipse cx={avatar.id==='duo'?39:50} cy="51" rx="29" ry="33" fill={avatar.color}/>
    <circle cx={avatar.id==='duo'?32:42} cy="45" r="3.2" fill={avatar.eyes}/><circle cx={avatar.id==='duo'?46:58} cy="45" r="3.2" fill={avatar.eyes}/>
    <path d={avatar.id==='duo'?'M31 55q8 11 16 0':'M41 55q9 11 18 0'} stroke={avatar.eyes} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
    {avatar.id==='duo'&&<><ellipse cx="66" cy="60" rx="24" ry="23" fill="#FFE0D5"/><circle cx="59" cy="55" r="2.8" fill="#24334F"/><circle cx="73" cy="55" r="2.8" fill="#24334F"/><path d="M59 64q7 9 14 0" stroke="#D96A55" strokeWidth="3" fill="none" strokeLinecap="round"/></>}
  </svg>;
}
