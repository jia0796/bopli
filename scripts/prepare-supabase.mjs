import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url),target=new URL('supabase/functions/_shared/',root);
await mkdir(new URL('domain/',target),{recursive:true});
await mkdir(new URL('server/',target),{recursive:true});
for(const file of ['cloudProtocol','domain','money','ledger','activityFinance','rounding','settlementBatch','lifecycle','inputRules']) {
  await copyFile(new URL(`src/lib/${file}.js`,root),new URL(`domain/${file}.js`,target));
}
for(const file of ['syncService','postgresStore','edgeHandler']) {
  const code=await readFile(new URL(`server/${file}.js`,root),'utf8');
  await writeFile(new URL(`server/${file}.js`,target),code.replaceAll('../src/lib/','../domain/'));
}
