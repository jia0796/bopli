import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { postgresStore } from '../_shared/server/postgresStore.js';
import { createSyncService } from '../_shared/server/syncService.js';
import { edgeHandler } from '../_shared/server/edgeHandler.js';

// Supabase supplies these server-only secrets. Never put service_role in VITE_*.
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
  auth:{persistSession:false,autoRefreshToken:false},
});
const service=createSyncService(postgresStore(admin));
Deno.serve(edgeHandler(service,async (token:string)=>{
  const {data,error}=await admin.auth.getUser(token);
  return error?null:data.user;
}));
