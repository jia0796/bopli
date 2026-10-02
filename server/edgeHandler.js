const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const statuses={'unauthenticated':401,'permission-denied':403,'invalid-argument':400,'resource-exhausted':429,'unavailable':503,'aborted':409,'failed-precondition':409};
export function edgeHandler(service,authenticate) {
  return async request=>{
    if(request.method==='OPTIONS')return response({});
    if(request.method!=='POST')return response({error:{message:'不支援的操作'}},405);
    try {
      const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
      const user=token&&await authenticate(token);
      if(!user?.id)return response({error:{code:'unauthenticated',message:'請先登入'}},401);
      const text=await request.text();
      if(text.length>1024*1024)return response({error:{message:'資料過大'}},413);
      let body;try{body=JSON.parse(text);}catch{return response({error:{message:'無效的資料'}},400);}
      if(!Object.hasOwn(service,body?.name)||typeof service[body.name]!=='function')return response({error:{message:'無效的操作'}},400);
      // Identity always comes from verified Auth, never from request data.
      return response({data:await service[body.name](user.id,body.data||{})});
    } catch(e) {
      const code=e.code||'failed-precondition';
      return response({error:{code,message:statuses[code]?e.message:'目前無法連線，請重試'}},statuses[code]||503);
    }
  };
}
