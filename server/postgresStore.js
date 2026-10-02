import { fail } from '../src/lib/cloudProtocol.js';

const copy=value=>structuredClone(value);
class Ref {
  constructor(path,query=false,filter=null) {this.path=path;this.query=query;this.filter=filter;this.id=path.split('/').at(-1);}
  collection(name) {return new Ref(`${this.path}/${name}`,true);}
  doc(id) {return new Ref(`${this.path}/${id}`);}
  where(field,op,value) {
    if(op!=='array-contains')throw new Error('Unsupported query');
    return new Ref(this.path,true,{field,value});
  }
}
const snapshot=(row,ref)=>({id:ref.id,ref,exists:!!row,data:()=>row?copy(row.data):undefined});

/** Validations run against individually stored rows. A SQL compare-and-swap of
 * the database revision proves EVERY read is still current before one atomic
 * commit. This also detects missing-row/collection phantom changes. Retry reruns
 * the domain checks, never merges stale expense revisions. */
export function postgresStore(client,{attempts=8}={}) {
  async function rpc(name,args) {
    const {data,error}=await client.rpc(name,args);
    if(error){const e=new Error('無法連線至資料庫，等待重新連線');e.code='unavailable';throw e;}
    return data;
  }
  const store={
    doc:path=>new Ref(path),collection:path=>new Ref(path,true),
    async runTransaction(fn) {
      for(let attempt=0;attempt<attempts;attempt++) {
        const start=await rpc('bopli_read',{p_path:null,p_collection:null});
        const writes=[];
        const tx={
          async get(ref) {
            const read=await rpc('bopli_read',{p_path:ref.query?null:ref.path,p_collection:ref.query?ref.path:null});
            if(ref.query) {
              const rows=ref.filter?read.rows.filter(r=>r.data[ref.filter.field]?.includes(ref.filter.value)):read.rows;
              return {docs:rows.map(r=>snapshot(r,new Ref(r.path)))};
            }
            return snapshot(read.rows[0],ref);
          },
          create:(ref,data)=>writes.push({path:ref.path,mode:'create',data:copy(data)}),
          set:(ref,data)=>writes.push({path:ref.path,mode:'set',data:copy(data)}),
          update:(ref,data)=>writes.push({path:ref.path,mode:'update',data:copy(data)}),
        };
        let result,error;
        try{result=await fn(tx);}catch(e){error=e;}
        // Even validation errors and read-only results require a coherent read.
        const commit=await rpc('bopli_commit',{p_revision:start.revision,p_writes:error?[]:writes});
        if(commit.conflict)continue;
        if(error)throw error;
        return result;
      }
      fail('資料正在更新，請重新確認後再試','aborted');
    },
  };
  return store;
}
