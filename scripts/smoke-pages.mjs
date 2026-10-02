import { chromium, devices } from '@playwright/test';

const url=process.env.BOPLI_PAGES_URL || 'https://jia0796.github.io/bopli/';
const browser=await chromium.launch();
const context=await browser.newContext({...devices['Pixel 7']});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  const response=await page.goto(url,{waitUntil:'networkidle'});
  if(!response?.ok())throw new Error('Pages response: '+response?.status());
  await page.getByLabel('帳號名稱').fill('Pages smoke');
  await page.getByRole('button',{name:'開始使用',exact:true}).click();
  await page.getByRole('button',{name:'稍後再說'}).click();
  await page.getByText('bopli_test.2.6',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'建立群組',exact:true}).first().click();
  await page.getByLabel('群組名稱').fill('Smoke group');
  await page.locator('.modal button[type="submit"]').click();
  await page.getByRole('button',{name:'建立活動',exact:true}).first().click();
  await page.getByLabel('活動名稱').fill('Smoke activity');
  await page.locator('.modal button[type="submit"]').click();
  await page.getByText('尚未開始記帳',{exact:true}).waitFor();
  await page.getByRole('button',{name:'記一筆',exact:true}).click();
  await page.getByLabel('支出名稱').fill('Smoke expense');
  await page.locator('.simple-payment-block input[inputmode="numeric"]').fill('100');
  await page.getByRole('button',{name:'儲存支出',exact:true}).click();
  await page.getByText('目前已結清',{exact:true}).waitFor();
  await page.getByRole('button',{name:'結算',exact:true}).click();
  await page.getByRole('heading',{name:'目前已結清',exact:true}).waitFor();
  if(errors.length)throw new Error(errors.join('\n'));
  const overflow=await page.evaluate(()=>document.body.scrollWidth>document.documentElement.clientWidth+1);
  if(overflow)throw new Error('Mobile horizontal overflow');
  console.log('PAGES_MOBILE_SMOKE_PASS '+url);
} finally {
  await browser.close();
}
