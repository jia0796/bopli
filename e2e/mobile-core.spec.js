import { test, expect } from '@playwright/test';

async function onboard(page, name='Cayden') {
  await page.goto('/');
  await page.getByLabel('帳號名稱').fill(name);
  await page.getByRole('button', { name: '開始使用' }).click();
  await expect(page.getByText('建議連結 Google 帳號')).toBeVisible();
  await page.getByRole('button', { name: '稍後再說' }).click();
  await expect(page.getByText(`嗨，${name}`)).toBeVisible();
}

test.describe('Bopli 2.4 mobile core journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('新使用者可建立群組、活動、記第一筆支出並看到結算', async ({ page }) => {
    await onboard(page);

    await page.getByRole('button', { name: /建立群組/ }).first().click();
    await page.getByLabel('群組名稱').fill('法國旅行');
    await page.getByLabel('你在這個群組的暱稱').fill('Cayden');
    await page.getByRole('button', { name: '建立群組' }).last().click();

    await expect(page.getByRole('heading', { name: '法國旅行' })).toBeVisible();
    await page.getByRole('button', { name: /建立活動/ }).first().click();
    await page.getByLabel('活動名稱').fill('巴黎');
    await page.getByRole('button', { name: '建立活動' }).last().click();

    await expect(page.getByText('巴黎')).toBeVisible();
    await expect(page.getByText('尚未開始記帳')).toBeVisible();
    await page.getByRole('button', { name: /記一筆/ }).click();
    await page.getByLabel('支出名稱').fill('晚餐');
    await page.locator('.simple-payment-block input[inputmode="numeric"]').fill('1200');
    await page.getByRole('button', { name: '儲存支出' }).click();

    await expect(page.getByText('晚餐')).toBeVisible();
    await expect(page.getByText('已結清')).toBeVisible();
    await page.getByRole('button', { name: '去結算' }).click();
    await expect(page.getByText('目前已結清')).toBeVisible();
  });

  test('群主可在活動進行中加入新群組成員，預設不改過去支出', async ({ page }) => {
    await onboard(page, 'Owner');

    await page.getByRole('button', { name: /建立群組/ }).first().click();
    await page.getByLabel('群組名稱').fill('朋友旅行');
    await page.getByRole('button', { name: '建立群組' }).last().click();

    // 先建立只有群主的活動，之後才新增群組成員，模擬真正的中途加入。
    await page.getByRole('button', { name: /建立活動/ }).first().click();
    await page.getByLabel('活動名稱').fill('第一天');
    await page.getByRole('button', { name: '建立活動' }).last().click();
    await expect(page.getByText('尚未開始記帳')).toBeVisible();

    // 先建立一筆舊支出，確保新成員加入時需要明確決定是否影響過去帳目。
    await page.getByRole('button', { name: /記一筆/ }).click();
    await page.getByLabel('支出名稱').fill('加入前晚餐');
    await page.locator('.simple-payment-block input[inputmode="numeric"]').fill('300');
    await page.getByRole('button', { name: '儲存支出' }).click();
    await expect(page.getByText('加入前晚餐')).toBeVisible();

    // 回群組新增成員；既有活動不應自動加入。
    await page.getByRole('button', { name: '返回群組' }).click();
    await page.getByRole('button', { name: '群組設定' }).click();
    await page.getByRole('button', { name: /成員/ }).click();
    await page.getByRole('button', { name: /新增測試成員/ }).click();
    await page.getByLabel('成員暱稱').fill('小安\n阿哲');
    await page.getByRole('button', { name: /新增 2 位測試成員/ }).click();
    await expect(page.getByText('小安')).toBeVisible();
    await expect(page.getByText('阿哲')).toBeVisible();

    // 回到活動，把其中一位新群組成員從「現在開始」加入。
    await page.getByRole('button', { name: /群組設定/ }).first().click();
    await page.getByRole('button', { name: /群組/ }).first().click();
    await page.getByRole('button', { name: /第一天/ }).click();
    await page.getByRole('button', { name: '活動設定' }).click();
    await page.getByRole('button', { name: /活動成員/ }).click();
    await page.getByRole('button', { name: /加入/ }).first().click();
    await expect(page.getByText('從現在開始')).toBeVisible();
    await page.getByRole('button', { name: '確認加入' }).click();

    await expect(page.getByText(/2 人參與/)).toBeVisible();
  });

  test('手機畫面主要操作無水平溢出', async ({ page }) => {
    await onboard(page);
    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
    await expect(page.getByRole('button', { name: /建立群組/ }).first()).toBeInViewport();
  });
});
