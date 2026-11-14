const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

test('loads the first step without scrolling the outer document', async({page})=>{
  const uncaught=[];
  page.on('pageerror',e=>uncaught.push(e.message));
  await page.goto('/');
  await expect(page.locator('#stage-title')).toHaveText('Choose a starting point');
  await expect(page.locator('#side-total')).not.toHaveText('—');
  await expect(page.locator('.example-option')).toHaveCount(4);
  const metrics=await page.evaluate(()=>({
    html:document.documentElement.scrollHeight,
    viewport:window.innerHeight,
    app:document.querySelector('#app').getBoundingClientRect().height
  }));
  expect(metrics.html).toBeLessThanOrEqual(metrics.viewport+2);
  expect(metrics.app).toBeLessThanOrEqual(metrics.viewport+2);
  expect(uncaught).toEqual([]);
});

test('guided task economics react to controls',async({page})=>{
  await page.goto('/');
  await page.locator('[data-sample="coding"]').click();
  await expect(page.locator('#chosen-calls')).toHaveText('60');
  await expect(page.locator('#chosen-tools')).toHaveText('85');
  await page.locator('[data-go="usage"]').click();
  await expect(page.locator('#stage-title')).toHaveText('Size the work');
  await page.locator('#model-calls').fill('5');
  await expect(page.locator('#side-calls')).toHaveText('5');
  await page.locator('[data-go="economics"]').click();
  await page.locator('#provider').selectOption('anthropic');
  await expect(page.locator('#side-provider')).toContainText('Anthropic');
  await expect(page.locator('#cost-total')).not.toHaveText('—');
  await page.locator('#ownership').selectOption('owned');
  await expect(page.locator('#cost-total')).not.toHaveText('—');
  await page.locator('[data-go="scale"]').click();
  await expect(page.locator('#personal-tasks')).not.toHaveText('—');
  await page.locator('#scale-company').click();
  await expect(page.locator('#macro-revenue')).not.toHaveText('—');
  await page.locator('#macro-settings summary').click();
  await page.locator('#macro-paid-users').fill('0');
  await page.locator('#macro-free-users').fill('0');
  await page.locator('#macro-api-tasks').fill('0');
  await expect(page.locator('#macro-revenue')).toHaveText('$0.00');
  await page.locator('.period[data-period="year"]').click();
  await expect(page.locator('.period[data-period="year"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-go="evidence"]').click();
  await page.locator('.evidence-toggle[data-evidence="health"]').click();
  await expect(page.locator('#source-status .source-item')).toHaveCount(12);
  await expect(page.locator('#collector-summary')).toContainText('manual');
});

test('custom prompt remains local and is omitted from downloadable diagnostics',async({page})=>{
  await page.goto('/');
  await page.locator('[data-sample="custom"]').click();
  await page.locator('[data-go="usage"]').click();
  await page.locator('#question-text').fill('NEVER_EXPORT_THIS_PRIVATE_SAMPLE');
  await page.locator('#answer-text').fill('Short answer.');
  await expect(page.locator('#tokens-input')).not.toHaveText('—');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-diagnostics').click()
  ]);
  expect(download.suggestedFilename()).toBe('ai-economics-browser-diagnostics.json');
  const diagnostics=fs.readFileSync(await download.path(),'utf8');
  expect(diagnostics).not.toContain('NEVER_EXPORT_THIS_PRIVATE_SAMPLE');
  expect(JSON.parse(diagnostics).errors).toEqual([]);
});
