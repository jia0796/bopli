import { createClient } from '@supabase/supabase-js';

let instance;
export function supabaseClient(env=import.meta.env) {
  if(instance)return instance;
  const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('尚未設定連線，請完成 Supabase 免費方案設定');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('雲端連線必須使用 HTTPS');
  if(key.startsWith('sb_secret_'))throw new Error('請使用公開金鑰，不能使用伺服器私鑰');
  // Legacy anon JWT is accepted, but a service_role JWT must never be exposed.
  if(key.split('.').length===3) {
    try{if(JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role')throw new Error('伺服器私鑰不可放在前端');}
    catch(e){if(e.message==='伺服器私鑰不可放在前端')throw e;}
  }
  const sdk=createClient(url,key);
  const groups=async()=>{
    const {data,error}=await sdk.from('bopli_documents').select('path,data').eq('collection_path','groups');
    if(error)throw new Error('無法連線至資料庫，等待重新連線');
    return data.map(row=>({id:row.data.id,epoch:row.data.epoch}));
  };
  instance={
    async login() {
      let {data,error}=await sdk.auth.getSession();
      if(error)throw error;
      if(!data.session) {
        const signed=await sdk.auth.signInAnonymously();
        if(signed.error)throw new Error(signed.error.message);
        return {uid:signed.data.user.id};
      }
      return {uid:data.session.user.id};
    },
    async call(name,data={}) {
      // Database heartbeat avoids consuming Edge invocations every five seconds.
      if(name==='syncHealth'){await groups();return {ok:true};}
      const result=await sdk.functions.invoke('bopli-sync',{body:{name,data}});
      if(result.error) {
        let detail;
        try{detail=(await result.error.context?.json())?.error;}catch{}
        const error=new Error(detail?.message||'無法連線至伺服器，等待重新連線');
        error.code=detail?.code||'unavailable';throw error;
      }
      return result.data.data;
    },
    groups,
    watch(uid,onGroups,onError) {
      let closed=false,last='',polling=false;
      const check=async()=>{
        if(closed||polling)return;polling=true;
        try {
          const rows=await groups(),signature=JSON.stringify(rows);
          if(!closed&&signature!==last){last=signature;onGroups(rows);}
        }catch(e){if(!closed)onError(e);}finally{polling=false;}
      };
      const channel=sdk.channel(`bopli-groups-${uid}`).on('postgres_changes',{
        event:'*',schema:'public',table:'bopli_documents',filter:'collection_path=eq.groups',
      },()=>check()).subscribe(status=>{
        if(status==='SUBSCRIBED')check();
        if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)&&!closed)onError(new Error('即時連線中斷'));
      });
      // Recover missed events and RLS membership removal without persistent cache.
      const timer=setInterval(check,15000);check();
      return()=>{closed=true;clearInterval(timer);sdk.removeChannel(channel);};
    },
  };
  return instance;
}
