// Local SDK protocol harness. Real PostgreSQL migration, service and handler;
// anonymous Auth and Realtime wire protocol are simulated, NOT a live project.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { postgresHarness } from './postgresHarness.js';
import { edgeHandler } from '../server/edgeHandler.js';
const h=await postgresHarness(),users=new Map(),refresh=new Map();
const key='local-public-key';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
function session(user) {
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.test-signature';
  users.set(jwt,user);const r=crypto.randomUUID();refresh.set(r,user);
  return {access_token:jwt,refresh_token:r,expires_in:3600,token_type:'bearer',user};
}
const handler=edgeHandler(h.service,async token=>users.get(token));
const server=createServer(async(req,res)=>{
  const send=(body,status=200)=>{res.writeHead(status,cors);res.end(JSON.stringify(body));};
  if(req.method==='OPTIONS')return send({});
  let text='';for await(const chunk of req)text+=chunk;
  const url=new URL(req.url,'http://127.0.0.1:54329');
  const token=req.headers.authorization?.replace(/^Bearer /i,'');
  try {
    if(url.pathname==='/health')return send({ok:true});
    if(url.pathname==='/auth/v1/signup') {
      const id=crypto.randomUUID();return send(session({id,aud:'authenticated',role:'authenticated',email:'',is_anonymous:true,created_at:new Date().toISOString(),app_metadata:{provider:'anonymous'},user_metadata:{}}));
    }
    if(url.pathname==='/auth/v1/user')return users.has(token)?send(users.get(token)):send({message:'Invalid token'},401);
    if(url.pathname==='/auth/v1/token') {
      const user=refresh.get(JSON.parse(text).refresh_token);return user?send(session(user)):send({message:'Invalid token'},401);
    }
    if(url.pathname==='/rest/v1/bopli_documents') {
      const user=users.get(token);if(!user)return send({message:'Unauthorized'},401);
      const rows=await h.asUser(user.id,"select path,data from public.bopli_documents where collection_path='groups'");
      return send(rows.rows);
    }
    if(url.pathname==='/functions/v1/bopli-sync') {
      const result=await handler(new Request(url,{method:req.method,headers:req.headers,body:text}));
      const body=await result.json();send(body,result.status);
      if(result.status===200)await publish();return;
    }
    if(token===key)return send({message:'Unauthorized'},401);
    send({message:'Not found'},404);
  }catch(e){send({message:e.message},500);}
});
const wss=new WebSocketServer({server});
wss.on('connection',socket=>{
  socket.on('message',raw=>{
    const wire=JSON.parse(raw);
    const msg=Array.isArray(wire)?{join_ref:wire[0],ref:wire[1],topic:wire[2],event:wire[3],payload:wire[4]}:wire;
    socket.v2=Array.isArray(wire);
    const send=payload=>socket.send(JSON.stringify(socket.v2?[msg.join_ref,msg.ref,msg.topic,'phx_reply',payload]:{event:'phx_reply',topic:msg.topic,ref:msg.ref,payload}));
    if(msg.event==='phx_join') {
      socket.topic=msg.topic;socket.token=msg.payload.access_token;
      send({status:'ok',response:{postgres_changes:[{id:1,event:'*',schema:'public',table:'bopli_documents',filter:'collection_path=eq.groups'}]}});
    }else if(msg.event==='heartbeat'||msg.event==='phx_leave') {
      send({status:'ok',response:{}});
    }else if(msg.event==='access_token')socket.token=msg.payload.access_token;
  });
});
async function publish() {
  for(const socket of wss.clients) {
    const user=users.get(socket.token);if(!user||!socket.topic||socket.readyState!==1)continue;
    const groups=await h.asUser(user.id,"select path,data from public.bopli_documents where collection_path='groups'");
    for(const row of groups.rows) {
      const payload={ids:[1],data:{schema:'public',table:'bopli_documents',type:'UPDATE',commit_timestamp:new Date().toISOString(),columns:[],record:{...row,collection_path:'groups'},old_record:{}}};
      socket.send(JSON.stringify(socket.v2?[null,null,socket.topic,'postgres_changes',payload]:{event:'postgres_changes',topic:socket.topic,payload}));
    }
  }
}
server.listen(54329,'127.0.0.1',()=>process.stdout.write('Local PostgreSQL SDK harness ready\n'));
const stop=()=>{for(const socket of wss.clients)socket.terminate();wss.close();server.close(async()=>{await h.close();process.exit(0);});};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
