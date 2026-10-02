import { test, expect } from '@playwright/test';

async function onboard(page, name='Owner') {
  await page.goto('/');
  await page.getByLabel('帳號名稱').fill(name);
  await page.getByRole('button', { name: '開始使用' }).click();
  await page.getByText('建議連結 Google 帳號').waitFor();
  await page.getByRole('button', { name: '稍後再說' }).click();
}

async function createGroup(page, name) {
  await page.getByRole('button', { name: /建立群組/ }).first().click();
  await page.getByLabel('群組名稱').fill(name);
  await page.getByRole('button', { name: '建立群組' }).last().click();
}

async function addTestMembers(page, names) {
  await page.getByRole('button', { name: '群組設定' }).click();
  await page.getByRole('button', { name: /成員/ }).click();
  await page.getByRole('button', { name: /新增測試成員/ }).click();
  await page.getByLabel('成員暱稱').fill(names.join('\n'));
  await page.getByRole('button', { name: new RegExp(`新增 ${names.length} 位測試成員`) }).click();
}

async function createActivity(page, name) {
  // Accept either group screen or members/settings return path.
  if (await page.getByRole('button', { name: /群組設定/ }).count()) {
    await page.getByRole('button', { name: /群組設定/ }).first().click();
    await page.getByRole('button', { name: /群組/ }).first().click();
  }
  await page.getByRole('button', { name: /建立活動/ }).first().click();
  await page.getByLabel('活動名稱').fill(name);
  await page.getByRole('button', { name: '建立活動' }).last().click();
}

async function addSimpleExpense(page, title, amount) {
  await page.getByRole('button', { name: /記一筆/ }).click();
  await page.getByLabel('支出名稱').fill(title);
  await page.locator('.simple-payment-block input[inputmode="numeric"]').fill(String(amount));
  await page.getByRole('button', { name: '儲存支出' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`查看 ${title}`) })).toBeVisible();
}

async function goHomeFromActivity(page) {
  await page.getByRole('button', { name: '返回群組' }).click();
  await page.locator('.group-topbar > .icon-button').first().click();
}

async function addSwitchableIdentityAndSwitch(page, name) {
  await page.getByRole('button', { name: '切換' }).click();
  if (await page.getByRole('button', { name: /新增測試身分/ }).count()) {
    await page.getByRole('button', { name: /新增測試身分/ }).click();
    await page.getByRole('button', { name: new RegExp(name) }).click();
  }
  await page.locator('.test-identity-row').filter({hasText:name}).click();
  await expect(page.locator('.test-version-strip')).toContainText(`測試身分：${name}`);
}

test.describe('Bopli 2.6 mobile extended journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('活動中途退出成員時預設只影響之後，舊支出保留', async ({ page }) => {
    await onboard(page);
    await createGroup(page, '退出測試');
    await addTestMembers(page, ['小安']);
    await createActivity(page, '台北一天');
    await addSimpleExpense(page, '午餐', 200);

    await page.getByRole('button', { name: '活動設定' }).click();
    await page.getByRole('button', { name: /活動成員/ }).click();
    const row=page.locator('.member-row').filter({hasText:'小安'}).first();
    await row.getByRole('button', { name: '移出活動' }).click();

    await expect(page.getByText('只影響之後的支出')).toBeVisible();
    await page.getByRole('button', { name: '確認移出活動' }).click();
    await expect(page.getByText('1 人參與')).toBeVisible();

    await page.getByRole('button', { name: '活動', exact: true }).click();
    await expect(page.getByText('午餐')).toBeVisible();
    await page.getByRole('button', { name: '帳目', exact: true }).click();
    await expect(page.getByText('小安')).toBeVisible();
  });

  test('首頁待處理卡直接進結算，活動可一鍵開啟成員管理', async ({ page }) => {
    await onboard(page);
    await createGroup(page, '捷徑測試');
    await addTestMembers(page, ['小安']);
    await createActivity(page, '捷徑活動');
    await addSimpleExpense(page, '咖啡', 100);

    await page.getByRole('button', { name: '活動成員' }).click();
    await expect(page.getByRole('heading', { name: '活動成員' })).toBeVisible();
    await page.getByRole('button', { name: '活動', exact: true }).click();

    await goHomeFromActivity(page);
    await addSwitchableIdentityAndSwitch(page, '小安');
    await page.locator('.action-card').filter({hasText:'捷徑活動'}).click();
    await expect(page.getByRole('heading', { name: '我要付', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '結算', exact: true })).toHaveClass(/selected/);
  });

  test('付款人記錄付款後，收款人可切換身分確認並完成結清', async ({ page }) => {
    await onboard(page);
    await createGroup(page, '付款旅行');
    await addTestMembers(page, ['小安']);
    await createActivity(page, '晚餐活動');
    await addSimpleExpense(page, '晚餐', 100);
    await page.getByRole('button',{name:'結算',exact:true}).click();
    await page.getByRole('button',{name:'結算所有帳單',exact:true}).click();

    await goHomeFromActivity(page);
    await addSwitchableIdentityAndSwitch(page, '小安');

    await page.getByRole('button', { name: /晚餐活動/ }).first().click();
    await page.getByRole('button', { name: '結算', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我要付', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '記錄付款' }).click();
    await page.getByRole('button', { name: '記錄付款' }).last().click();
    await expect(page.getByText(/已記錄付款/)).toBeVisible();

    await page.getByRole('button', { name: '切換' }).click();
    await page.getByRole('button', { name: '回到預設身分' }).click();
    await page.getByRole('button', { name: /晚餐活動/ }).first().click();
    await page.getByRole('button', { name: '結算', exact: true }).click();
    await expect(page.getByRole('heading', { name: '待我確認', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /確認已收到/ }).click();
    await expect(page.getByText('目前已結清')).toBeVisible();
  });

  test('副群主看不到永久刪除；群主可刪除空活動與群組', async ({ page }) => {
    await onboard(page);
    await createGroup(page, '權限測試');
    await addTestMembers(page, ['副手']);

    // Owner promotes member to deputy.
    await page.locator('.member-list-card .swipe-content').filter({hasText:'副手'}).click();
    await page.getByRole('button', { name: '設為副群主' }).click();
    await expect(page.getByText('副群主', { exact: true })).toBeVisible();

    // Add deputy as a switchable identity and verify owner-only danger action is hidden.
    await page.getByRole('button', { name: '切換' }).click();
    await page.getByRole('button', { name: /新增測試身分/ }).click();
    await page.getByRole('button', { name: /副手/ }).click();
    await page.locator('.test-identity-row').filter({hasText:'副手'}).click();
    await page.getByRole('button', { name: /權限測試/ }).click();
    await page.getByRole('button', { name: '群組設定' }).click();
    await expect(page.getByRole('button', { name: '永久刪除群組' })).toHaveCount(0);

    // Return to owner, create and permanently delete an empty activity, then the group.
    await page.getByRole('button', { name: '切換' }).click();
    await page.getByRole('button', { name: '回到預設身分' }).click();
    await page.getByRole('button', { name: /權限測試/ }).click();
    await createActivity(page, '空活動');
    await page.getByRole('button', { name: '活動設定' }).click();
    await page.getByRole('button', { name: '永久刪除活動' }).click();
    await page.getByRole('button', { name: '永久刪除活動' }).last().click();
    await expect(page.getByText('空活動')).toHaveCount(0);

    await page.getByRole('button', { name: '群組設定' }).click();
    await page.getByRole('button', { name: '永久刪除群組' }).click();
    await page.getByRole('button', { name: '永久刪除群組' }).last().click();
    await expect(page.getByText('權限測試')).toHaveCount(0);
  });

  test('14 人旅行與第二群組帳目互不污染', async ({ page }) => {
    await onboard(page, 'U01');
    await createGroup(page, '法國旅行');
    const original=Array.from({length:13},(_,i)=>`U${String(i+2).padStart(2,'0')}`);
    await addTestMembers(page, original);
    await createActivity(page, '巴黎行程');
    await page.getByRole('button', { name: '活動設定' }).click();
    await expect(page.getByRole('button', { name: /活動成員/ })).toContainText('14 人');
    await page.getByRole('button', { name: /活動/ }).first().click();
    await addSimpleExpense(page, '巴黎晚餐', 1400);

    // Mid-trip add one member and keep old expense unchanged.
    await page.getByRole('button', { name: '返回群組' }).click();
    await page.getByRole('button', { name: '群組設定' }).click();
    await page.getByRole('button', { name: /成員/ }).click();
    await page.getByRole('button', { name: /新增測試成員/ }).click();
    await page.getByLabel('成員暱稱').fill('U15');
    await page.getByRole('button', { name: /新增 1 位測試成員/ }).click();
    await page.getByRole('button', { name: /群組設定/ }).first().click();
    await page.getByRole('button', { name: /群組/ }).first().click();
    await page.getByRole('button', { name: /巴黎行程/ }).click();
    await page.getByRole('button', { name: '活動設定' }).click();
    await page.getByRole('button', { name: /活動成員/ }).click();
    const u15=page.locator('.member-row').filter({hasText:'U15'}).first();
    await u15.getByRole('button', { name: /加入/ }).click();
    await page.getByRole('button', { name: '確認加入' }).click();
    await expect(page.getByText('15 人參與')).toBeVisible();

    // Remove two participants from future expenses only.
    for (const name of ['U04','U09']) {
      const memberRow=page.locator('.member-row').filter({hasText:name}).first();
      await memberRow.getByRole('button', { name: '移出活動' }).click();
      await page.getByRole('button', { name: '確認移出活動' }).click();
    }
    await expect(page.getByText('13 人參與')).toBeVisible();

    // Build a completely separate second group and activity.
    await page.getByRole('button', { name: '活動', exact: true }).click();
    await page.getByRole('button', { name: '返回群組' }).click();
    await page.getByRole('button', { name: '返回首頁' }).click();
    await createGroup(page, '第二群組');
    await addTestMembers(page, ['B02','B03']);
    await createActivity(page, '第二活動');
    await addSimpleExpense(page, '第二群晚餐', 300);
    await goHomeFromActivity(page);

    // Re-open France and verify its original ledger is still isolated.
    await page.locator('.group-card').filter({hasText:'法國旅行'}).click();
    await page.getByRole('button', { name: /巴黎行程/ }).click();
    await expect(page.getByRole('button', { name: /查看 巴黎晚餐/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /查看 第二群晚餐/ })).toHaveCount(0);
    await page.getByRole('button', { name: '活動設定' }).click();
    await page.getByRole('button', { name: /活動成員/ }).click();
    await expect(page.getByText('13 人參與')).toBeVisible();
  });
});
