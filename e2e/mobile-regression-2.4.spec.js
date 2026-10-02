import {buildSnapshot} from '../src/lib/settlementBatch.js';
import { test, expect } from '@playwright/test';

const key='bopli-test-2.6-v1';
const marker='bopli-test-2.6-reset-once-20261002';
function fixture(actor='debtor', {empty=false, review=false, large=false}={}) {
  const ids=large?['owner',...Array.from({length:29},(_,i)=>'m'+i)]:['owner','debtor','deputy'];
  const users=Object.fromEntries(ids.map(id=>[id,{id,nickname:id==='owner'?'Owner':id==='debtor'?'Debtor':id==='deputy'?'Deputy':id,accountName:id,isGuest:true}]));
  const at='2026-10-01T00:00:00Z';
  const expense={id:'e',activityId:'a',title:'晚餐',amount:large?3000:2000,paidBy:'owner',createdBy:'owner',participantIds:large?ids:['owner','debtor'],splitMode:'equal',allocations:large?Object.fromEntries(ids.map(id=>[id,100])):{owner:1000,debtor:1000},createdAt:at,updatedAt:at,revision:1,history:[]};
  return {version:26,currentUserId:actor,account:{primaryUserId:'owner',testIdentityIds:ids.filter(id=>id!=='owner'),backupPromptSeen:true},users,
    groups:[{id:'g',name:'回歸群組',ownerUid:'owner',deputyUids:large?[]:['deputy'],memberIds:ids,nicknames:Object.fromEntries(ids.map(id=>[id,users[id].nickname])),editPolicy:'allMembers',createdAt:at}],
    activities:[{id:'a',groupId:'g',title:'回歸活動',participantIds:ids,memberReviewIds:review?['debtor']:[],auditHistory:[],createdAt:at,settlementManualTransfers:empty?[]:[{id:'manual',fromUid:large?'m0':'debtor',toUid:'owner',amount:400}]}],
    expenses:empty?[]:large?Array.from({length:35},(_,i)=>({...expense,id:'e'+i,title:'支出'+i})): [expense],
    settlements:[],drafts:[],notifications:[]};
}
async function seed(page,data) {
  data.activities[0].settlementSnapshot=buildSnapshot(data.activities[0],data.expenses,data.settlements,'fixture-snapshot','2026-10-01','owner');
  const token='fixture-'+Date.now()+'-'+Math.random();
  await page.addInitScript(({key,marker,data,token})=>{
    if(sessionStorage.getItem(token))return;
    sessionStorage.setItem(token,'1');
    localStorage.setItem(marker,'1');
    localStorage.setItem(key,JSON.stringify(data));
  },{key,marker,data,token});
  await page.goto('/');
}
async function openActivity(page,tab='結算') {
  await page.locator('.group-card').filter({hasText:'回歸群組'}).click();
  await page.locator('.activity-card').filter({hasText:'回歸活動'}).click();
  await page.getByRole('button',{name:tab,exact:true}).click();
}
async function switchTo(page,id) {
  await page.getByRole('button',{name:'切換',exact:true}).click();
  if(id==='owner')await page.getByRole('button',{name:'回到預設身分'}).click();
  else await page.locator('.test-identity-row').filter({hasText:id==='debtor'?'Debtor':'Deputy'}).click();
  await openActivity(page);
}
async function state(page) {return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}

test('2.6 reset removes every old key only once, preserving new account after reload',async({page})=>{
  await page.goto('/');
  const keys=['bopli-test-2.5-v1','bopli-test-2.4-v1','bopli-test-2.3-v1','bopli-test-2.2-v1','bopli-2.1.1-v1','bopli-2.1-v1'];
  await page.evaluate(({keys,marker})=>{
    localStorage.removeItem(marker);for(const k of keys)localStorage.setItem(k,'old');
    localStorage.setItem('unrelated','keep');
  },{keys,marker});
  await page.reload();
  await expect(page.getByLabel('帳號名稱')).toBeVisible();
  expect(await page.evaluate(({keys,marker})=>({values:keys.map(k=>localStorage.getItem(k)),marker:localStorage.getItem(marker),other:localStorage.getItem('unrelated')}),{keys,marker})).toEqual({values:keys.map(()=>null),marker:'1',other:'keep'});
  await page.getByLabel('帳號名稱').fill('New 2.4');
  await page.getByRole('button',{name:'開始使用',exact:true}).click();
  await page.getByRole('button',{name:'稍後再說'}).click();
  await expect.poll(async()=>Boolean((await state(page))?.currentUserId)).toBe(true);
  await page.reload();
  await expect(page.getByText('嗨，New 2.4')).toBeVisible();
});

test('partial payment consumes manual allocation, reserves pending, and confirms same record',async({page})=>{
  await seed(page,fixture());
  await openActivity(page);
  await expect(page.getByRole('button',{name:'調整分帳',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'為什麼我要付他？'}).click();
  await expect(page.getByText('我的總分攤')).toBeVisible();
  await page.getByRole('button',{name:'知道了'}).click();
  await page.getByRole('button',{name:'記錄付款',exact:true}).click();
  await page.locator('.payment-modal input[inputmode="numeric"]').fill('300');
  await page.locator('.payment-modal button[type="submit"]').click();
  await expect(page.locator('.settlement-route-card')).toContainText('待對方確認 NT$ 300');
  await expect(page.locator('.settlement-route-card')).toContainText('尚需支付 NT$ 700');
  await expect.poll(async()=>(await state(page)).activities[0].settlementManualTransfers[0].amount).toBe(100);
  await switchTo(page,'owner');
  await expect(page.getByRole('heading',{name:'待我確認',exact:true})).toBeVisible();
  await expect(page.locator('.transfer-card')).toContainText('NT$ 700');
  await page.getByRole('button',{name:'確認已收到'}).click();
  await expect.poll(async()=>(await state(page)).settlements[0].status).toBe('confirmed');
  await switchTo(page,'debtor');
  await expect(page.locator('.settlement-route-card')).toContainText('尚需支付 NT$ 700');
  expect((await state(page)).settlements).toHaveLength(1);
  await expect(page.locator('.settlement-completed')).not.toHaveAttribute('open','');
});

for(const actor of ['owner','deputy'])test(actor+' can change remaining manual plan while pending amount stays fixed',async({page})=>{
  const data=fixture(actor);data.settlements=[{id:'s',activityId:'a',fromUid:'debtor',toUid:'owner',amount:300,status:'pending',createdAt:'2026-10-01',events:[]}];
  data.activities[0].settlementManualTransfers[0].amount=100;
  await seed(page,data);await openActivity(page);
  await page.getByRole('button',{name:'調整分帳',exact:true}).click();
  await page.locator('.settlement-manual-row input').fill('250');
  await page.getByRole('button',{name:'套用並自動分配剩餘'}).click();
  await expect.poll(async()=>(await state(page)).activities[0].settlementManualTransfers[0].amount).toBe(250);
  expect((await state(page)).settlements[0].amount).toBe(300);
});

test('disputed payment stays reserved and can be resubmitted without a duplicate',async({page})=>{
  const data=fixture();data.settlements=[{id:'s',activityId:'a',fromUid:'debtor',toUid:'owner',amount:300,status:'disputed',createdAt:'2026-10-01',events:[]}];
  data.activities[0].settlementManualTransfers[0].amount=100;
  await seed(page,data);await openActivity(page);
  await expect(page.getByRole('heading',{name:'還款需要處理'})).toBeVisible();
  await expect(page.locator('.settlement-route-card')).toContainText('尚需支付 NT$ 700');
  await page.getByRole('button',{name:'已處理，重新送出確認'}).click();
  await expect.poll(async()=>(await state(page)).settlements[0].status).toBe('pending');
  expect((await state(page)).settlements).toHaveLength(1);
  await switchTo(page,'owner');
  await page.getByRole('button',{name:'確認已收到'}).click();
  await expect.poll(async()=>(await state(page)).settlements[0].status).toBe('confirmed');
});

test('empty status is consistent across tabs; zero-balance spectator cannot settle others',async({page})=>{
  await seed(page,fixture('owner',{empty:true}));await openActivity(page,'支出');
  await expect(page.getByText('尚未開始記帳')).toBeVisible();
  await page.getByRole('button',{name:'帳目',exact:true}).click();
  await expect(page.getByText(/尚未開始記帳/)).toBeVisible();
  await expect(page.getByText(/已結清/)).toHaveCount(0);
  await page.getByRole('button',{name:'結算',exact:true}).click();
  await expect(page.getByText('尚未開始記帳')).toBeVisible();
  await seed(page,fixture('deputy'));await openActivity(page);
  await expect(page.getByText('目前已結清')).toHaveCount(0);
  await page.getByRole('button',{name:'支出',exact:true}).click();
  await expect(page.locator('.activity-glance-card')).not.toContainText('已結清');
});

test('review member appears once, resolves into current members, and returns directly to activity',async({page})=>{
  await seed(page,fixture('owner',{review:true}));await openActivity(page,'支出');
  await page.getByRole('button',{name:'活動設定',exact:true}).click();
  await page.getByRole('button',{name:/活動成員/}).click();
  await expect(page.getByText('Debtor',{exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'檢查',exact:true}).click();
  await page.getByRole('button',{name:'維持原狀，不再提醒'}).click();
  await expect(page.getByText('Debtor',{exact:true})).toHaveCount(1);
  await expect(page.getByText('目前成員',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'活動',exact:true}).click();
  await expect(page.locator('.activity-bottom-nav')).toBeVisible();
  await expect(page.getByRole('heading',{name:'活動設定',exact:true})).toHaveCount(0);
});

test('tabs preserve each scroll position and second tap scrolls to top',async({page})=>{
  await seed(page,fixture('owner',{large:true}));await openActivity(page,'支出');
  for(const [tab,scroll] of [['支出',600],['帳目',350],['結算',800]]){
    await page.getByRole('button',{name:tab,exact:true}).click();
    await page.evaluate(y=>window.scrollTo(0,y),scroll);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(scroll);
  }
  for(const [tab,scroll] of [['支出',600],['帳目',350],['結算',800]]){
    await page.getByRole('button',{name:tab,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(scroll);
  }
  await page.getByRole('button',{name:'結算',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await expect(page.locator('.back-to-top-button')).toHaveCount(0);
  await expect(page.locator('.activity-bottom-nav')).toContainText('帳目');
  await expect(page.locator('.activity-bottom-nav button').nth(1).locator('svg')).not.toHaveClass(/users/);
});

test('home notification and profile share logo geometry and logo returns home',async({page})=>{
  await seed(page,fixture('owner'));
  const rect=await page.locator('.app-header').boundingBox();
  const logo=await page.locator('.brand-button').boundingBox();
  for(const name of ['通知','我的']){
    await page.getByRole('button',{name,exact:true}).click();
    expect(await page.locator('.app-header').boundingBox()).toEqual(rect);
    expect(await page.locator('.brand-button').boundingBox()).toEqual(logo);
    await page.locator('.brand-button').click();
    await expect(page.getByText('嗨，owner')).toBeVisible();
  }
});

test('shared input modal adapts to reduced visual viewport with close, input and save operable',async({page})=>{
  await seed(page,fixture('owner'));
  await page.getByRole('button',{name:'建立群組',exact:true}).last().click();
  const before=await page.evaluate(()=>window.scrollY);
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:280});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.getByLabel('群組名稱').fill('Keyboard');
  const modal=page.locator('.modal');
  expect((await modal.boundingBox()).height).toBeLessThanOrEqual(280);
  const close=await modal.locator('.modal-top .icon-button').boundingBox();
  expect(close.y).toBeGreaterThanOrEqual(0);expect(close.y+close.height).toBeLessThanOrEqual(280);
  const save=page.locator('.modal button[type="submit"]');
  await save.click();
  await expect(page.getByRole('heading',{name:'Keyboard',exact:true})).toBeVisible();
  expect(before).toBeGreaterThanOrEqual(0);
});

test('cumulative 15-person fairness backfills receipt allocations before rounding up',async({page})=>{
  const data=fixture('owner',{large:true});
  const ids=data.activities[0].participantIds.slice(0,15);
  data.activities[0].participantIds=ids;
  data.groups[0].memberIds=ids;
  data.activities[0].settlementManualTransfers=[];
  data.expenses=[4000,2000].map((amount,index)=>{
    const floor=Math.floor(amount/15), remainder=amount%15;
    const allocations=Object.fromEntries(ids.map(id=>[id,floor]));
    for(let i=0;i<remainder;i++)allocations[ids[(i+index)%15]]++;
    return {id:'e'+index,activityId:'a',title:'Expense '+index,amount,paidBy:'owner',createdBy:'owner',participantIds:ids,splitMode:'equal',allocations,createdAt:'2026-10-01',history:[]};
  });
  await seed(page,data);await openActivity(page,'帳目');
  await expect.poll(async()=>{
    const saved=await state(page);
    return ids.map(id=>saved.expenses.reduce((sum,e)=>sum+e.allocations[id],0));
  }).toEqual(ids.map(()=>400));
  for(const card of await page.locator('.ledger-person-card').all()) {
    if(!(await card.textContent()).includes('Owner'))await expect(card).toContainText('NT$ 400');
  }
  await page.getByRole('button',{name:'結算',exact:true}).click();
  await page.getByText('進階結算設定',{exact:true}).click();
  await page.getByRole('button',{name:/全員向上補齊/}).click();
  await expect(page.locator('.rounding-extra')).toContainText('NT$ 0');
  await expect(page.locator('.rounding-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'確認結算方案'}).click();
  const saved=await state(page);
  for(const expense of saved.expenses)expect(Object.values(expense.allocations).reduce((sum,n)=>sum+n,0)).toBe(expense.amount);
  await page.reload();await openActivity(page,'帳目');
  await expect(page.locator('.ledger-person-card').filter({hasText:'m0'})).toContainText('NT$ 400');
});
