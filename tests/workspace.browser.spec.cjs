const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

test('official brand and six-step app load without outer scrolling',async({page})=>{
  const faults=[];
  page.on('pageerror',err=>faults.push(err.message));
  const logoResponses=[];
  page.on('response',r=>{
    if(r.url().includes('upstate-data-systems-icon.svg')||r.url().includes('upstate-data-systems-logo.png'))
      logoResponses.push(r.status());
  });
  await page.goto('/');
  await expect(page.locator('#stage-title')).toHaveText('Choose a starting point');
  await expect(page.locator('#side-total')).not.toHaveText('—');
  await expect(page.locator('.example-option')).toHaveCount(4);
  await expect(page.locator('.step')).toHaveCount(6);
  await expect(page.locator('.brand-icon-official')).toHaveAttribute('src',/upstate-data-systems-icon/);
  await expect(page.locator('#rail-data-status')).not.toContainText('Loading');
  const dims=await page.evaluate(()=>({
    outer:document.documentElement.scrollHeight,
    viewport:window.innerHeight,
    app:document.querySelector('#app').getBoundingClientRect().height
  }));
  expect(dims.outer).toBeLessThanOrEqual(dims.viewport+2);
  expect(dims.app).toBeLessThanOrEqual(dims.viewport+2);
  expect(logoResponses.every(code=>code===200)).toBeTruthy();
  expect(faults).toEqual([]);
});

test('two subscriptions share the work rather than double-counting it',async({page})=>{
  await page.goto('/');
  await page.locator('[data-go="access"]').click();
  await expect(page.locator('#stage-title')).toHaveText('Choose how you access AI');
  await expect(page.locator('#access-monthly-paid')).toHaveText('$39.99');
  await expect(page.locator('.sub-result')).toHaveCount(2);
  await expect(page.locator('#access-enabled-openai')).toBeChecked();
  await expect(page.locator('#access-enabled-google')).toBeChecked();
  await page.locator('#access-enabled-google').uncheck();
  await expect(page.locator('#access-monthly-paid')).toHaveText('$20.00');
  await expect(page.locator('.sub-result')).toHaveCount(1);
  await page.locator('#access-enabled-google').check();
  await page.locator('#access-plan-google').selectOption('google-ultra5');
  await expect(page.locator('#access-monthly-paid')).toHaveText('$119.99');
  await page.locator('#mode-api').click();
  await expect(page.locator('#api-provider')).toBeVisible();
  await page.locator('#api-provider').selectOption('google');
  const paid=await page.locator('#access-monthly-paid').innerText();
  const retail=await page.locator('#access-api-value').innerText();
  expect(paid).toBe(retail);
  await page.locator('#mode-subscriptions').click();
  await expect(page.locator('#access-monthly-paid')).toHaveText('$119.99');
});

test('workload inputs, task expense and company tiers recalculate',async({page})=>{
  await page.goto('/');
  await page.locator('[data-sample="coding"]').click();
  await expect(page.locator('#chosen-calls')).toHaveText('60');
  await expect(page.locator('#chosen-tools')).toHaveText('85');
  await page.locator('[data-go="usage"]').click();
  await page.locator('#model-calls').fill('5');
  await expect(page.locator('#side-calls')).toHaveText('5');
  await page.locator('[data-go="economics"]').click();
  await expect(page.locator('#cost-total')).not.toHaveText('—');
  await page.locator('#extra-tool-cost').fill('2.50');
  await expect(page.locator('#cost-tools')).toHaveText('$2.50');
  await page.locator('#ownership').selectOption('owned');
  await expect(page.locator('#cost-total')).not.toHaveText('—');
  await page.locator('[data-go="scale"]').click();
  await expect(page.locator('#personal-tasks')).not.toHaveText('—');
  await page.locator('#scale-company').click();
  await expect(page.locator('#macro-tier-rows .tier-editor')).toHaveCount(6);
  await expect(page.locator('#macro-revenue')).not.toHaveText('—');
  await page.locator('#macro-cost-basis').selectOption('capacity');
  await expect(page.locator('#macro-provisioned')).not.toHaveText('—');
  await page.locator('#macro-users-openai-plus').fill('0');
  await page.locator('#macro-users-openai-free').fill('0');
  await page.locator('#macro-api-customers').fill('0');
  await expect(page.locator('#macro-revenue')).toHaveText('$0.00');
  await page.locator('.period[data-period="year"]').click();
  await expect(page.locator('.period[data-period="year"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#macro-provider').selectOption('google');
  await expect(page.locator('#macro-tier-rows .tier-editor')).toHaveCount(5);
  await page.locator('[data-go="evidence"]').click();
  await page.locator('.evidence-toggle[data-evidence="health"]').click();
  await expect(page.locator('#source-status .source-item')).toHaveCount(12);
  await expect(page.locator('#collector-summary')).toContainText('manual');
});

test('custom prompt stays local and is excluded from diagnostics',async({page})=>{
  await page.goto('/');
  await page.locator('[data-sample="custom"]').click();
  await page.locator('[data-go="usage"]').click();
  await page.locator('#question-text').fill('NEVER_EXPORT_PRIVATE_QUESTION');
  await page.locator('#answer-text').fill('NEVER_EXPORT_PRIVATE_ANSWER');
  await expect(page.locator('#tokens-input')).not.toHaveText('—');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-diagnostics').click()
  ]);
  expect(download.suggestedFilename()).toBe('ai-economics-browser-diagnostics.json');
  const serialized=fs.readFileSync(await download.path(),'utf8');
  expect(serialized).not.toContain('NEVER_EXPORT_PRIVATE_QUESTION');
  expect(serialized).not.toContain('NEVER_EXPORT_PRIVATE_ANSWER');
  const data=JSON.parse(serialized);
  expect(data.app_version).toBe('0.5');
  expect(data.errors).toEqual([]);
});

test('Continue and Back navigate all six stages',async({page})=>{
  await page.goto('/');
  const titles=[
    'Choose a starting point','Choose how you access AI','Size the work',
    'Estimate the serving cost','Explore the bigger picture','Verify the evidence'
  ];
  for(let i=0;i<titles.length;i++){
    await expect(page.locator('#stage-title')).toHaveText(titles[i]);
    if(i<titles.length-1)await page.locator('#next').click();
  }
  await expect(page.locator('#next')).toHaveText('Back to start ↺');
  await page.locator('#next').click();
  await expect(page.locator('#stage-title')).toHaveText(titles[0]);
  await page.locator('#next').click();
  await page.locator('#previous').click();
  await expect(page.locator('#stage-title')).toHaveText(titles[0]);
});
