import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { applyCloudChanges, assertId, fail } from '../src/lib/cloudProtocol.js';
import { assertName } from '../src/lib/inputRules.js';
const paths={activities:'activities',expenses:'expenses',settlements:'repayments'};
const clean=x=>JSON.parse(JSON.stringify(x));
// The domain and authorization checks are shared with the former Firebase service.
export function createSyncService(db) {
async function identity(tx,uid) {
  const snap=await tx.get(db.doc(`identities/${uid}`));
  return snap.exists?snap.data():null;
}
async function groupStore(tx,id,uid) {
  assertId(id);
  const ref=db.doc(`groups/${id}`);
  const group=await tx.get(ref);
  if(!group.exists)return {ref,store:{version:26,users:{},groups:[],activities:[],expenses:[],settlements:[],drafts:[]},epoch:0};
  if(!group.data().readerAuthUids.includes(uid))fail('你不是這個群組的成員','permission-denied');
  const {epoch,readerAuthUids,...metadata}=group.data();
  const results=await Promise.all(['members',...Object.values(paths),'settlementSnapshots'].map(c=>tx.get(ref.collection(c))));
  const [members,activityRows,expenses,settlements,snapshots]=results.map(s=>s.docs.map(d=>d.data()).filter(d=>!d.deletedAt));
  const activities=activityRows.map(({currentSnapshotId,currentSnapshotSignature,...a})=>{
    const history=snapshots.filter(s=>s.activityId===a.id).sort((x,y)=>x.sequence-y.sequence).map(({activityId,sequence,...s})=>s);
    const current=history.find(s=>s.id===currentSnapshotId);
    return {...a,settlementSnapshots:history,settlementSnapshot:current?{...current,signature:currentSnapshotSignature}:null};
  });
  const retiredIds=new Set();
  for(const [kind,index] of [['activities',1],['expenses',2],['settlements',3]])for(const doc of results[index].docs)if(doc.data().deletedAt)retiredIds.add(`${kind}/${doc.id}`);
  return {ref,epoch,readerAuthUids,retiredIds,store:{version:26,users:Object.fromEntries(members.map(m=>[m.id,m])),groups:[metadata],activities,expenses,settlements,drafts:[]}};
}
const syncHealth=(async(uid)=>{
  await db.runTransaction(tx=>tx.get(db.doc(`identities/${uid}`)));
  return {ok:true,serverTime:Date.now()};
});
const syncBootstrap=(async(uid,{name})=>db.runTransaction(async tx=>{
  let profile=await identity(tx,uid);
  if(!profile&&name) {
    name=assertName(name);
    profile={id:randomUUID(),authUid:uid,accountName:name,nickname:name,avatarId:'coral',isGuest:true,createdAt:new Date().toISOString()};
    tx.create(db.doc(`identities/${uid}`),profile);
  }
  return profile;
}));
const syncRead=(async(uid,{groupId})=>db.runTransaction(async tx=>{
  const profile=await identity(tx,uid);
  if(!profile)fail('請先設定名稱');
  const data=await groupStore(tx,groupId,uid);
  return {store:data.store,epoch:data.epoch};
}));
const syncCommit=(async(uid,{groupId,patch,requestId})=>db.runTransaction(async tx=>{
  assertId(requestId);
  const receipt=db.doc(`identities/${uid}/requests/${requestId}`);
  const [profile,done]=await Promise.all([identity(tx,uid),tx.get(receipt)]);
  if(done.exists)return done.data();
  if(!profile)fail('請先設定名稱');
  const loaded=await groupStore(tx,groupId,uid);
  if(!loaded.store.groups.length) {
    if(!Array.isArray(patch)||patch.length!==1||patch[0].kind!=='groups'||patch[0].id!==groupId||patch[0].before)fail('群組不存在');
    loaded.store.users[profile.id]=profile;
  }
  if(Array.isArray(patch)&&patch.some(c=>c.after&&!c.before&&loaded.retiredIds?.has(`${c.kind}/${c.id}`)))fail('不可重用歷史資料 ID');
  const next=applyCloudChanges(loaded.store,patch,profile.id);
  // Every row must belong to this transaction's group; reject cross-group IDs.
  if(next.groups.some(g=>g.id!==groupId)||next.activities.some(a=>a.groupId!==groupId))fail('不可跨群組寫入');
  const count=patch.length+next.activities.reduce((s,a)=>s+(a.settlementSnapshots||[]).filter(snapshot=>!loaded.store.activities.find(x=>x.id===a.id)?.settlementSnapshots?.some(x=>x.id===snapshot.id)).length,0);
  if(count>400)fail('本群組資料過大，請縮小操作','resource-exhausted');
  for(const c of patch) {
    if(c.kind==='groups')continue;
    const ref=loaded.ref.collection(paths[c.kind]).doc(c.id);
    const item=next[c.kind].find(x=>x.id===c.id);
    if(item&&c.kind==='activities') {
      const {settlementSnapshot,settlementSnapshots,...metadata}=item;
      tx.set(ref,clean({...metadata,currentSnapshotId:settlementSnapshot?.id||null,currentSnapshotSignature:settlementSnapshot?.signature||null}));
    } else item?tx.set(ref,clean(item)):tx.set(ref,clean({...c.before,deletedAt:new Date().toISOString(),deletedBy:profile.id}));
  }
  for(const a of next.activities)for(const [sequence,snapshot] of (a.settlementSnapshots||[]).entries()) {
    if(loaded.store.activities.find(x=>x.id===a.id)?.settlementSnapshots?.some(s=>s.id===snapshot.id))continue;
    tx.create(loaded.ref.collection('settlementSnapshots').doc(assertId(snapshot.id)),clean({...snapshot,activityId:a.id,sequence}));
  }
  const group=next.groups[0];
  if(group) {
    tx.set(loaded.ref,clean({...group,epoch:loaded.epoch+1,readerAuthUids:loaded.readerAuthUids||[uid]}));
    if(!loaded.store.groups.length)tx.create(loaded.ref.collection('members').doc(profile.id),profile);
  } else tx.set(loaded.ref,clean({...loaded.store.groups[0],epoch:loaded.epoch+1,readerAuthUids:[],deletedAt:new Date().toISOString(),deletedBy:profile.id}));
  const result={ok:true,epoch:loaded.epoch+1};
  tx.create(receipt,result);
  return result;
}));
const syncProfile=(async(uid,{accountName,avatarId})=>db.runTransaction(async tx=>{
  const profile=await identity(tx,uid);
  if(!profile)fail('請先設定名稱');
  assertName(accountName);
  if(!['coral','peach','navy','duo'].includes(avatarId))fail('頭像不正確');
  const groups=await tx.get(db.collection('groups').where('readerAuthUids','array-contains',uid));
  const updated={...profile,accountName,nickname:accountName,avatarId};
  tx.set(db.doc(`identities/${uid}`),updated);
  for(const g of groups.docs) {
    tx.set(g.ref.collection('members').doc(profile.id),updated);
    tx.update(g.ref,{epoch:g.data().epoch+1});
  }
  return updated;
}));
const hash=code=>createHash('sha256').update(code).digest('hex');
const syncInvite=(async(uid,{groupId})=>{
  // 80 bits, not enumerable group IDs. Hash stored, 7-day expiration.
  const code=randomBytes(10).toString('hex').toUpperCase();
  await db.runTransaction(async tx=>{
    const profile=await identity(tx,uid);
    const {store}=await groupStore(tx,groupId,uid);
    const g=store.groups[0];
    if(!g||!profile||!g.memberIds.includes(profile.id)||(g.ownerUid!==profile.id&&!g.allowMemberInvites))fail('沒有邀請權限','permission-denied');
    tx.create(db.doc(`invites/${hash(code)}`),{groupId,createdBy:profile.id,expiresAt:Date.now()+7*86400000});
  });
  return {code};
});
const syncJoin=(async(uid,{code,nickname})=>db.runTransaction(async tx=>{
  if(typeof code!=='string'||!/^[A-F0-9]{20}$/.test(code.toUpperCase()))fail('邀請碼不正確');
  nickname=assertName(nickname);
  const profile=await identity(tx,uid);
  if(!profile)fail('請先設定名稱');
  const rateRef=db.doc(`identities/${uid}/limits/join`);
  const rate=await tx.get(rateRef);
  const recent=rate.exists&&Date.now()-rate.data().at<60000;
  if(recent&&rate.data().count>=10)fail('請稍後再試','resource-exhausted');
  const invite=await tx.get(db.doc(`invites/${hash(code.toUpperCase())}`));
  // Persist failed attempts rather than rolling back the limiter.
  if(!invite.exists||invite.data().expiresAt<Date.now()) {
    tx.set(rateRef,{at:recent?rate.data().at:Date.now(),count:recent?rate.data().count+1:1});
    return {error:'邀請碼無效或已過期'};
  }
  const ref=db.doc(`groups/${assertId(invite.data().groupId)}`);
  const snap=await tx.get(ref);
  if(!snap.exists)fail('群組不存在');
  const g=snap.data();
  const inviter=invite.data().createdBy;
  if(!g.memberIds.includes(inviter)||(g.ownerUid!==inviter&&!g.allowMemberInvites))fail('邀請已失效');
  if(g.readerAuthUids.includes(uid))return {groupId:g.id};
  if(Object.values(g.nicknames).some(n=>n.toLocaleLowerCase('zh-TW')===nickname.toLocaleLowerCase('zh-TW')))fail('這個群組已有人使用相同暱稱');
  tx.set(rateRef,{at:recent?rate.data().at:Date.now(),count:recent?rate.data().count+1:1});
  tx.update(ref,{memberIds:[...g.memberIds,profile.id],readerAuthUids:[...g.readerAuthUids,uid],nicknames:{...g.nicknames,[profile.id]:nickname},epoch:g.epoch+1});
  tx.create(ref.collection('members').doc(profile.id),profile);
  return {groupId:g.id};
}));

return {syncHealth,syncBootstrap,syncRead,syncCommit,syncProfile,syncInvite,syncJoin};
}
