import {test,expect} from '@playwright/test';
import {readFile,copyFile} from 'node:fs/promises';
const key='bopli-test-2.5-v1',marker='bopli-test-2.5-reset-once-20261001';
function fixture(large=false){
 const ids=large?['A',...Array.from({length:18},(_,i)=>'M'+i)]:['A','B','C','D'];
 const users=Object.fromEntries(ids.map(id=>[id,{id,nickname:id,accountName:id}]));
 const expense=(id,paidBy,allocations)=>({id,activityId:'act',title:id,amount:Object.values(allocations).reduce((s,n)=>s+n,0),paidBy,createdBy:'A',participantIds:Object.keys(allocations),splitMode:'custom',customAmounts:allocations,allocations,createdAt:'2026-10-01',history:[]});
 return {version:25,currentUserId:'A',account:{primaryUserId:'A',testIdentityIds:ids.slice(1),backupPromptSeen:true},users,groups:[{id:'g',name:'Friends',ownerUid:'A',deputyUids:[],memberIds:ids,nicknames:Object.fromEntries(ids.map(id=>[id,id])),editPolicy:'allMembers'}],activities:[{id:'act',groupId:'g',title:'Trip',participantIds:ids,auditHistory:[],memberReviewIds:[]}],expenses:large?[expense('Large','A',Object.fromEntries(ids.slice(1).map(id=>[id,500])))]:[expense('Related','A',{B:100}),expense('Unrelated','C',{D:60})],settlements:[],drafts:[],notifications:[]};
}
async function seed(page,data){
 await page.addInitScript(({data,key,marker})=>{if(sessionStorage.getItem('seed25'))return;sessionStorage.setItem('seed25','1');localStorage.setItem(marker,'1');localStorage.setItem(key,JSON.stringify(data));Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true});},{data,key,marker});await page.goto('/');
}
async function open(page,tab='結算'){await page.locator('.group-card').filter({hasText:'Friends'}).click();await page.locator('.activity-card').filter({hasText:'Trip'}).click();await page.getByRole('button',{name:tab,exact:true}).click();}
async function identity(page,name){await page.getByRole('button',{name:'切換',exact:true}).click();if(name==='A')await page.getByRole('button',{name:'回到預設身分'}).click();else await page.locator('.test-identity-row').filter({hasText:name}).click();await open(page);}

test('settlement batch dirty gates new repayment but unrelated edit and pending confirmation still work',async({page})=>{
 await seed(page,fixture());await open(page);
 await expect(page.getByRole('button',{name:'結算所有帳單',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'結算所有帳單',exact:true}).click();await expect(page.getByRole('button',{name:'已結算',exact:true})).toBeDisabled();
 await identity(page,'B');await page.getByRole('button',{name:'記錄付款',exact:true}).click();await page.getByLabel('付款金額').fill('50');await page.locator('.payment-modal button[type="submit"]').click();
 await identity(page,'A');await expect(page.getByRole('button',{name:'確認已收到'})).toBeVisible();
 await page.getByRole('button',{name:'支出',exact:true}).click();await page.getByRole('button',{name:'查看 Related'}).click();await expect(page.getByRole('button',{name:'編輯支出',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'查看 Unrelated'}).click();await page.getByRole('button',{name:'編輯支出',exact:true}).click();await page.getByLabel('支出名稱').fill('Unrelated edited');await page.getByRole('button',{name:'儲存修改',exact:true}).click();
 await page.getByRole('button',{name:'結算',exact:true}).click();await expect(page.getByRole('button',{name:'結算所有帳單',exact:true})).toBeEnabled();await page.getByRole('button',{name:'確認已收到'}).click();
 await identity(page,'B');await expect(page.getByRole('button',{name:'記錄付款',exact:true})).toBeDisabled();await identity(page,'A');await page.getByRole('button',{name:'結算所有帳單',exact:true}).click();await identity(page,'B');await expect(page.getByRole('button',{name:'記錄付款',exact:true})).toBeEnabled();
});

test('personal, other and all PNG templates: swipe preserves selection, zero blocks, selected downloads only',async({page})=>{
 await seed(page,fixture(true));await open(page);await page.getByRole('button',{name:'分享',exact:true}).click();await page.getByRole('button',{name:'個人結算表分享'}).click();
 await expect(page.getByText('已選擇 3 / 3 張')).toBeVisible({timeout:20000});await expect(page.locator('.share-page img')).toHaveCount(3);
 await expect.poll(()=>page.locator('.share-page img').first().evaluate(img=>[img.naturalWidth,img.naturalHeight])).toEqual([1080,1350]);
 await page.getByLabel('選取第 2 張').uncheck();await page.locator('.share-carousel').evaluate(el=>{el.scrollLeft=el.clientWidth;});await expect(page.getByText('已選擇 2 / 3 張')).toBeVisible();
 await page.getByLabel('選取第 1 張').uncheck();await page.getByLabel('選取第 3 張').uncheck();await expect(page.getByRole('dialog',{name:'分享結算'}).getByRole('button',{name:'分享',exact:true})).toBeDisabled();await page.getByLabel('選取第 1 張').check();
 const downloads=[];page.on('download',download=>downloads.push(download));const downloadEvent=page.waitForEvent('download');await page.getByRole('dialog',{name:'分享結算'}).getByRole('button',{name:'分享',exact:true}).click();const download=await downloadEvent;await copyFile(await download.path(),'/tmp/bopli25-share-example.png');const bytes=await readFile(await download.path());expect(bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(1350);expect(downloads).toHaveLength(1);
 await page.getByRole('button',{name:'關閉分享'}).click();await page.getByRole('button',{name:'分享',exact:true}).click();await page.getByRole('button',{name:'他人結算表分享'}).click();await page.getByLabel('選擇成員').selectOption('M0');await page.getByRole('button',{name:'產生圖片'}).click();await expect(page.locator('.share-page img')).toHaveCount(1);await expect.poll(()=>page.locator('.share-page img').evaluate(img=>[img.naturalWidth,img.naturalHeight])).toEqual([1080,1350]);
 await page.getByRole('button',{name:'關閉分享'}).click();await page.getByRole('button',{name:'分享',exact:true}).click();await page.getByRole('button',{name:'全部結算表分享'}).click();await expect(page.getByText('已選擇 3 / 3 張')).toBeVisible({timeout:20000});
});

test('name width and paste overflow reject immediately; draft delete requires confirmation',async({page})=>{
 await page.goto('/');await page.getByLabel('帳號名稱').fill('中文中文中文中文');await expect(page.getByText('名稱太長了，請縮短一些')).toBeVisible();await expect(page.getByRole('button',{name:'開始使用'})).toBeDisabled();await page.getByLabel('帳號名稱').fill('Tester');await page.getByRole('button',{name:'開始使用'}).click();await page.getByRole('button',{name:'稍後再說'}).click();
 await page.getByRole('button',{name:'建立群組',exact:true}).first().click();await page.getByLabel('群組名稱').fill('New group');await page.locator('.modal button[type="submit"]').click();await page.getByRole('button',{name:'建立活動',exact:true}).first().click();await page.getByLabel('活動名稱').fill('New activity');await page.locator('.modal button[type="submit"]').click();await page.getByRole('button',{name:'記一筆'}).click();await page.getByLabel('支出名稱').fill('Draft');const input=page.locator('.simple-payment-block input[inputmode="numeric"]');await input.fill('100');await input.fill('1000000001');await expect(input).toHaveValue('100');await expect(page.getByText('超過金額上限')).toBeVisible();
 await expect.poll(async()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.drafts.length,key)).toBe(1);await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:'刪除草稿'}).click();await expect(page.getByText('刪除這份草稿？')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.draft-card')).toHaveCount(1);await page.getByRole('button',{name:'刪除草稿'}).click();await page.getByRole('button',{name:'刪除',exact:true}).click();await expect(page.locator('.draft-card')).toHaveCount(0);
});
