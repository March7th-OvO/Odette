// Optional browser regression: install Playwright or set PLAYWRIGHT_PATH to an existing installation.
// Run against npm run dev: node tests/browser.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH});
  const context = await browser.newContext({viewport:{width:1440,height:1100}, permissions:['clipboard-read','clipboard-write']});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const keys = [];
  try {
    await page.goto('http://127.0.0.1:5173');
    await page.waitForLoadState('networkidle');
    console.log('Initial buttons:', await page.getByRole('button').allTextContents());
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/images') && r.request().method() === 'POST');
    await page.getByLabel('选择要上传的图片').setInputFiles({name:'browser-check.png',mimeType:'image/png',buffer:png});
    const upload = await responsePromise;
    assert.equal(upload.status(),200,await upload.text());
    const item = (await upload.json()).data; keys.push(item.key);
    await page.getByRole('heading',{name:'browser-check.png',exact:true}).waitFor();
    const card = page.locator('.image-card').filter({hasText:'browser-check.png'});
    await card.getByRole('button',{name:'链接',exact:true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()),item.url);
    await card.getByRole('button',{name:'Markdown',exact:true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()),`![](${item.url})`);
    await page.getByRole('button',{name:'预览 browser-check.png',exact:true}).click();
    await page.locator('dialog[open]').waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('.preview img'); return img?.complete && img.naturalWidth > 0; });
    await page.getByRole('button',{name:'关闭弹窗'}).click();
    const filter = page.getByLabel('按对象路径前缀筛选');
    await filter.fill('image/no-match'); await page.getByRole('button',{name:'筛选',exact:true}).click();
    await page.getByText('这个路径下还没有图片').waitFor();
    await filter.fill('image/'); await page.getByRole('button',{name:'筛选',exact:true}).click();
    await card.waitFor();
    fs.mkdirSync('.wrangler/qa',{recursive:true});
    await page.screenshot({path:'.wrangler/qa/desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Mobile overflow');
    await page.screenshot({path:'.wrangler/qa/mobile.png',fullPage:true});
    await page.getByRole('button',{name:'删除 browser-check.png',exact:true}).click();
    await page.getByRole('button',{name:'保留图片',exact:true}).click();
    assert.equal(await card.count(),1);
    await page.getByRole('button',{name:'删除 browser-check.png',exact:true}).click();
    await page.getByRole('button',{name:'确认删除',exact:true}).click();
    await page.getByText('第一张图片，从这里开始').waitFor();
    assert.equal((await context.request.get(item.url)).status(),404);
    assert.deepEqual(errors,[]);
    console.log('PASS: upload, preview bytes, URL/Markdown clipboard, prefix, mobile, cancel/delete, no runtime errors');
  } finally {
    for (const key of keys) await context.request.delete('http://127.0.0.1:5173/api/images',{data:{key}});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
