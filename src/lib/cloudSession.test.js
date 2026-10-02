import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSession } from './cloudSession.js';
const client=()=>({login:async()=>({uid:'auth'}),call:async name=>name==='syncBootstrap'?{id:'internal',accountName:'A'}:{ok:true},groups:async()=>[],watch:()=>()=>{}});
test('offline startup never ready or calls cloud; recovery authenticates and reads',async()=>{
  let online=false,calls=0;const c=client();c.login=async()=>{calls++;return {uid:'auth'};};
  const s=new CloudSession(c,()=>online);
  await s.connect();assert.equal(s.status,'waiting');assert.equal(calls,0);
  online=true;await s.connect();assert.equal(s.status,'ready');assert.equal(s.data.currentUserId,'internal');
  online=false;s.disconnect();assert.throws(()=>s.assertReady(),/正在連線/);s.close();
});
test('Firebase failure blocks even with network; successful recovery resyncs',async()=>{
  const c=client();const call=c.call;c.call=async()=>{throw new Error('server unavailable');};
  const s=new CloudSession(c,()=>true);await s.connect();assert.equal(s.status,'waiting');
  c.call=call;await s.connect();assert.equal(s.status,'ready');s.close();
});
test('late connect response cannot unblock a disconnected session',async()=>{
  const c=client();let resolve;c.login=()=>new Promise(r=>resolve=r);
  const s=new CloudSession(c,()=>true);const pending=s.connect();s.disconnect();resolve({uid:'auth'});await pending;
  assert.equal(s.status,'waiting');s.close();
});
