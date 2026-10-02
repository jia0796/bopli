import React, { useEffect, useState } from 'react';
import App from '../App.jsx';
import { supabaseClient } from '../lib/supabaseClient.js';
import { CloudSession } from '../lib/cloudSession.js';

export function ConnectionScreen({message,onRetry,busy=false}) {
  return <div className="cloud-connection" role="alertdialog" aria-modal="true" aria-label="連線狀態"><div className="cloud-spinner" aria-hidden="true"/><h1>{busy?'正在同步…':message||'正在連線…'}</h1><p>{busy?'正在安全儲存，請稍候。':'連線成功後會自動繼續。'}</p>{!busy&&<button type="button" className="primary-button" onClick={onRetry}>重試</button>}</div>;
}
export default function CloudApp({createClient=supabaseClient}) {
  const [session,setSession]=useState(null);
  const [state,setState]=useState({status:'connecting',message:'正在連線…'});
  const [entered,setEntered]=useState(false);
  useEffect(()=>{
    let current;
    try{current=new CloudSession(createClient());}catch(e){setState({status:'waiting',message:e.message});return;}
    setSession(current);
    const unsubscribe=current.subscribe(s=>{
      setState({status:s.status,message:s.message,data:s.data,busy:s.busy,error:s.error});
      if(s.status==='ready')setEntered(true);
    });
    const online=()=>current.connect();const offline=()=>current.disconnect();
    window.addEventListener('online',online);window.addEventListener('offline',offline);
    const interval=setInterval(()=>current.checkConnection(),5000);
    current.connect();
    return()=>{clearInterval(interval);window.removeEventListener('online',online);window.removeEventListener('offline',offline);unsubscribe();current.close();};
  },[createClient]);
  const blocked=state.status!=='ready'||state.busy;
  return <>{entered&&session&&<div inert={blocked?'':undefined} aria-hidden={blocked||undefined}><App cloud={{...state,session}}/></div>}{blocked&&<ConnectionScreen message={state.message} busy={state.busy&&state.status==='ready'} onRetry={()=>session?session.connect():location.reload()}/>}</>;
}
