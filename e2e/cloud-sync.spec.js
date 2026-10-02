import {test,expect} from '@playwright/test';
const gate=page=>page.getByRole('alertdialog',{name:'連線狀態'});
async function api(page,name,data={}) {
  return page.evaluate(async({name,data})=>{
    const {firebaseClient}=await import('/src/lib/firebaseClient.js');
    const client=firebaseClient();
    if(name==='state') {
      const groups=await client.groups((await client.login()).uid);
      return (await client.call('syncRead',{groupId:groups[0].id})).store;
    }
    return client.call(name,data);
  },{name,data});
}
async function onboard(page,name) {
  await page.goto('/');await page.getByLabel('帳號名稱').fill(name);
  await page.getByRole('button',{name:'開始使用',exact:true}).click();
  await expect(page.getByRole('button',{name:'輸入邀請碼加入群組'})).toBeVisible();
}
test('offline startup cannot enter; recovery loads cloud; disconnect overlay preserves screen and drafts',async({page,context})=>{
  // Load the static shell first; emulate lack of Firebase network before boot.
  await page.route('http://127.0.0.1:9099/**',route=>route.abort());
  await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
  await page.goto('/');await expect(gate(page)).toContainText('目前無網路，等待重新連線');
  await expect(page.getByRole('button',{name:'開始使用'})).toHaveCount(0);
  await page.unroute('http://127.0.0.1:9099/**');
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));});
  await page.getByLabel('帳號名稱').fill('Reconnect');await page.getByRole('button',{name:'開始使用'}).click();
  await expect(gate(page)).toHaveCount(0);
  await page.getByRole('button',{name:'建立群組'}).first().click();
  await page.getByLabel('群組名稱').fill('保留輸入');
  await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await expect(gate(page)).toContainText('目前無網路');
  await expect(page.locator('[inert]')).toHaveCount(1);
  await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(gate(page)).toHaveCount(0,{timeout:20000});
  await expect(page.getByLabel('群組名稱')).toHaveValue('保留輸入');
});
test('two browser clients join by invite and synchronize an expense',async({page,browser})=>{
  const other=await browser.newContext();const bob=await other.newPage();
  try {
    await onboard(page,'Alice');await onboard(bob,'Bob');
    await page.getByRole('button',{name:'建立群組'}).first().click();
    await page.getByLabel('群組名稱').fill('Realtime');await page.getByRole('button',{name:'建立群組',exact:true}).last().click();
    await expect(page.getByRole('heading',{name:'Realtime'})).toBeVisible();
    await page.getByRole('button',{name:/邀請/}).first().click();
    await page.getByRole('button',{name:'產生邀請碼'}).click();
    const code=await page.getByLabel('邀請碼').textContent();
    await bob.getByRole('button',{name:'輸入邀請碼加入群組'}).click();await bob.getByLabel('邀請碼').fill(code);
    await bob.getByRole('button',{name:'加入群組',exact:true}).click();
    await expect(bob.getByRole('heading',{name:'Realtime'})).toBeVisible();
    await page.getByRole('button',{name:'關閉',exact:true}).click();
    await page.getByRole('button',{name:/建立活動/}).first().click();await page.getByLabel('活動名稱').fill('Lunch');
    await page.getByRole('button',{name:'建立活動',exact:true}).last().click();
    await expect(bob.locator('.activity-card')).toContainText('Lunch');await bob.locator('.activity-card').click();
    await page.getByRole('button',{name:/記一筆/}).click();await page.getByLabel('支出名稱').fill('Synced meal');
    await page.locator('.simple-payment-block input[inputmode="numeric"]').fill('100');await page.getByRole('button',{name:'儲存支出'}).click();
    await expect(bob.getByText('Synced meal',{exact:true})).toBeVisible();
    // Real formal rows are not persisted in the local prototype key.
    expect(await page.evaluate(()=>localStorage.getItem('bopli-test-2.6-v1'))).toBeNull();
    const state=await api(page,'state'),group=state.groups[0];
    await api(page,'syncCommit',{groupId:group.id,requestId:crypto.randomUUID(),patch:[{kind:'groups',id:group.id,before:group,after:{...group,editPolicy:'allMembers'}}]});
    // Keep both edit forms open across a remote update; the losing form must not
    // silently change its captured base revision when the listener receives it.
    await bob.getByText('Synced meal',{exact:true}).click();await bob.getByRole('button',{name:'編輯支出',exact:true}).click();
    await page.getByText('Synced meal',{exact:true}).click();await page.getByRole('button',{name:'編輯支出',exact:true}).click();
    await bob.getByLabel('支出名稱').fill('Bob stale edit');await page.getByLabel('支出名稱').fill('Alice wins');
    await page.getByRole('button',{name:'儲存修改'}).click();await expect(page.getByText('Alice wins',{exact:true})).toBeVisible();
    await expect.poll(async()=> (await api(bob,'state')).expenses[0].revision).toBe(2);
    await bob.getByRole('button',{name:'儲存修改'}).click();await expect(bob.getByText('這筆支出已被其他成員更新，請重新確認',{exact:true})).toBeVisible();
    await bob.getByRole('button',{name:'返回',exact:true}).click();
    await page.getByRole('button',{name:'結算',exact:true}).click();await page.getByRole('button',{name:'結算所有帳單',exact:true}).click();
    await expect(page.getByRole('button',{name:'已結算',exact:true})).toBeDisabled();
    const current=await api(page,'state');const act=current.activities[0];
    const from=current.groups[0].memberIds.find(id=>id!==current.groups[0].ownerUid),to=current.groups[0].ownerUid;
    const makePayment=()=>{const id=crypto.randomUUID();return {kind:'settlements',id,before:null,after:{id,activityId:act.id,fromUid:from,toUid:to,amount:40,status:'pending',createdBy:from,createdAt:new Date().toISOString(),snapshotId:act.settlementSnapshot.id,manualPlanConsumption:[]}};};
    const attempts=await Promise.allSettled([api(bob,'syncCommit',{groupId:group.id,requestId:crypto.randomUUID(),patch:[makePayment()]}),api(bob,'syncCommit',{groupId:group.id,requestId:crypto.randomUUID(),patch:[makePayment()]})]);
    expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const paid=await api(page,'state');expect(paid.settlements).toHaveLength(1);expect(paid.settlements[0].amount).toBe(40);
  } finally {await other.close();}
});
