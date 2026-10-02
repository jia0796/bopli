import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { postgresStore } from '../server/postgresStore.js';
import { createSyncService } from '../server/syncService.js';

// Runs the actual production migration/RLS/RPCs in embedded PostgreSQL.
// Auth/Realtime platform services are not provided by PGlite; use stubs only
// for those platform boundaries and label browser tests accordingly.
export async function postgresHarness() {
  const pg=new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await pg.exec(await readFile(new URL('../supabase/migrations/202610020001_sync.sql',import.meta.url),'utf8'));
  const admin={rpc:async(name,args)=>{
    try{
      let result;
      if(name==='bopli_read')result=await pg.query('select public.bopli_read($1,$2) as result',[args.p_path,args.p_collection]);
      else if(name==='bopli_commit')result=await pg.query('select public.bopli_commit($1,$2::jsonb) as result',[args.p_revision,JSON.stringify(args.p_writes)]);
      else throw new Error('Unknown RPC');
      return {data:result.rows[0].result,error:null};
    }catch(error){return {data:null,error};}
  }};
  const store=postgresStore(admin);
  const service=createSyncService(store);
  async function asUser(uid,sql,args=[]) {
    return pg.transaction(async tx=>{
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
      return tx.query(sql,args);
    });
  }
  return {pg,admin,store,service,asUser,close:()=>pg.close()};
}
