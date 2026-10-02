import { changes, equal } from './cloudProtocol.js';
import { freshStore } from './store.js';
const LOCAL_KEY='bopli-cloud-ui-v1';
const timed=(promise,ms=12000)=>{
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('連線逾時，等待重新連線')),ms);})]).finally(()=>clearTimeout(timer));
};
/** Online session: health + coherent transaction read required before ready.
 * A generation token prevents late network responses reopening an offline app. */
export class CloudSession {
  constructor(client,network=()=>navigator.onLine) {
    this.client=client;this.network=network;this.listeners=new Set();this.generation=0;
    this.data=freshStore();this.status='connecting';this.message='正在連線…';this.busy=false;this.error='';this.closed=false;
    this.readSequence=0;
    try{this.local=JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}');}catch{this.local={};}
  }
  subscribe(fn) {this.listeners.add(fn);fn(this);return()=>this.listeners.delete(fn);}
  emit() {for(const fn of this.listeners)fn(this);}
  disconnect(message='目前無網路，等待重新連線') {
    this.generation++;this.status='waiting';this.message=message;this.emit();
  }
  async connect() {
    if(this.connecting||this.closed)return;
    if(!this.network())return this.disconnect();
    const generation=this.generation;
    this.connecting=true;this.status='connecting';this.message='正在連線…';this.emit();
    try {
      this.user=await timed(this.client.login());
      await timed(this.client.call('syncHealth'));
      this.profile=await timed(this.client.call('syncBootstrap'));
      await this.refresh();
      if(this.closed||generation!==this.generation||!this.network())return;
      this.status='ready';this.error='';
      if(!this.unwatch)this.unwatch=this.client.watch(this.user.uid,()=>{
        if(this.status==='ready'&&!this.busy)this.refresh().catch(()=>this.disconnect('無法同步，等待重新連線'));
      },()=>this.disconnect('無法連線至資料庫，等待重新連線'));
    } catch(e){if(!this.closed&&generation===this.generation)this.disconnect(e.message||'無法連線，等待重新連線');}
    finally{this.connecting=false;this.emit();}
  }
  async refresh() {
    if(!this.user)return;
    const generation=this.generation;
    const readSequence=++this.readSequence;
    const groups=await timed(this.client.groups(this.user.uid));
    const reads=await timed(Promise.all(groups.map(g=>this.client.call('syncRead',{groupId:g.id}))));
    if(this.closed||generation!==this.generation||readSequence!==this.readSequence)return;
    const data=freshStore();
    for(const {store} of reads) {
      Object.assign(data.users,store.users);
      for(const key of ['groups','activities','expenses','settlements'])data[key].push(...store[key]);
    }
    if(this.profile) {
      data.currentUserId=this.profile.id;data.account.primaryUserId=this.profile.id;
      data.users[this.profile.id]=this.profile;
    }
    data.drafts=this.local.drafts||[];
    data.account.readNotificationKeys=this.local.readNotificationKeys||[];
    this.data=data;this.emit();
  }
  assertReady() {if(this.status!=='ready'||!this.network()||this.busy)throw new Error('正在連線，請稍後再試');}
  async action(fn) {
    this.assertReady();this.busy=true;this.error='';this.emit();
    try{const result=await timed(fn());await this.refresh();return result;}
    catch(e){this.error=e.message;await this.refresh().catch(()=>this.disconnect('無法連線，等待重新連線'));throw e;}
    finally{this.busy=false;this.emit();}
  }
  async update(next) {
    // Only drafts/notification UI are local; never save formal cloud rows locally.
    const saveLocal=()=>{
      this.local={drafts:next.drafts,readNotificationKeys:next.account?.readNotificationKeys};
      try{localStorage.setItem(LOCAL_KEY,JSON.stringify(this.local));}catch{this.error='本機草稿儲存失敗';this.emit();}
    };
    if(!this.profile&&next.currentUserId) {
      return this.action(async()=>{this.profile=await this.client.call('syncBootstrap',{name:next.users[next.currentUserId].accountName});});
    }
    if(next.currentUserId!==this.data.currentUserId)throw new Error('雲端模式不支援切換測試身分');
    const patch=changes(this.data,next).filter(c=>!(c.kind==='groups'&&c.before&&equal({...c.before,lastUsedAt:c.after?.lastUsedAt},c.after)));
    const profile=next.users[this.profile?.id];
    if(profile&&!equal(profile,this.profile)&&!patch.length) {
      return this.action(async()=>{this.profile=await this.client.call('syncProfile',{accountName:profile.accountName,avatarId:profile.avatarId});});
    }
    if(!patch.length){saveLocal();this.data={...this.data,drafts:this.local.drafts,account:{...this.data.account,readNotificationKeys:this.local.readNotificationKeys}};this.emit();return;}
    const ids=new Set(patch.map(c=>{
      const row=c.after||c.before;
      if(c.kind==='groups')return row.id;
      if(c.kind==='activities')return row.groupId;
      return next.activities.find(a=>a.id===row.activityId)?.groupId||this.data.activities.find(a=>a.id===row.activityId)?.groupId;
    }));
    if(ids.size!==1)throw new Error('一次只能修改一個群組');
    return this.action(async()=>{
      const result=await this.client.call('syncCommit',{groupId:[...ids][0],patch,requestId:crypto.randomUUID()});
      saveLocal();return result;
    });
  }
  async invite(groupId) {return this.action(()=>this.client.call('syncInvite',{groupId}));}
  async join(code,nickname) {
    return this.action(async()=>{const result=await this.client.call('syncJoin',{code,nickname});if(result.error)throw new Error(result.error);return result;});
  }
  close() {this.closed=true;this.generation++;this.unwatch?.();this.listeners.clear();}
}
