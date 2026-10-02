import { mkdir, copyFile } from 'node:fs/promises';
const files=['cloudProtocol','domain','money','ledger','activityFinance','rounding','settlementBatch','lifecycle','inputRules'];
await mkdir(new URL('../functions/shared/',import.meta.url),{recursive:true});
for(const file of files)await copyFile(new URL(`../src/lib/${file}.js`,import.meta.url),new URL(`../functions/shared/${file}.js`,import.meta.url));
