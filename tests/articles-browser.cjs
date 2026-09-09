// 所有 API 请求在浏览器内模拟，不读写真实 GitHub 或 R2。
// 启动 Vite 后运行 npm run test:articles-browser；可用 CHROMIUM_PATH 指定浏览器。
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const originalBody = '\r\nimport { Badge } from "@components/firefly-mdx";\r\n\r\n# Furina\r\n\r\n<Badge>故事</Badge>  \r\n';
const docs = {
  'guide/index.mdx': { path: 'guide/index.mdx', sha: 'a'.repeat(40), extension: '.mdx', frontmatter: { title: '芙宁娜角色攻略', published: '2026-09-09T00:00:00.000Z', slug: 'furina-guide', draft: false, image: './cover.png', tags: ['Furina', '攻略'], custom: { keep: true } }, body: originalBody },
  'hello.md': { path: 'hello.md', sha: 'a'.repeat(40), extension: '.md', frontmatter: { title: 'Hello', published: '2026-09-09', draft: true }, body: '# Hello\n\n<script>window.pwned=true</script>\n\n[unsafe](javascript:alert(1))' },
};
const writes = [];
let forceConflict = false;
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'msedge' }) });
  try {
    const page = await browser.newPage({ viewport: { width: 1560, height: 1060 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('https://images.example/**', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const ok = data => route.fulfill({ json: { code: 200, data } });
      if (url.pathname === '/api/posts/asset') return route.fulfill({ contentType: 'image/png', body: png });
      if (url.pathname === '/api/posts/tree') return ok({ revision: 'c'.repeat(40), entries: [
        { path: 'guide', sha: 'a', kind: 'bundle', entryPath: 'guide/index.mdx' }, { path: 'guide/cover.png', sha: 'a', kind: 'asset' },
        ...Object.values(docs).map(doc => ({ path: doc.path, sha: doc.sha, kind: 'article' })),
      ] });
      if (url.pathname === '/api/images') return ok({ prefix: 'image/', folders: [], cursor: null, items: [{ key: 'image/furina.webp', originalName: 'furina.webp', url: 'https://images.example/image/furina.webp', thumbnailUrl: 'https://images.example/thumb.webp', size: 100, contentType: 'image/webp', uploaded: '2026-09-09' }] });
      if (url.pathname === '/api/posts' && request.method() === 'GET') return ok(docs[url.searchParams.get('path')]);
      if (url.pathname === '/api/posts' && request.method() === 'DELETE') { const body = request.postDataJSON(); delete docs[body.path]; return ok({ commitSha: 'd'.repeat(40), commitUrl: 'https://github.com/example/commit/d' }); }
      if (url.pathname === '/api/posts' && ['PUT', 'POST'].includes(request.method())) {
        const body = request.postDataJSON(); writes.push(body);
        if (forceConflict) { forceConflict = false; docs[body.path].sha = 'f'.repeat(40); docs[body.path].body = 'GitHub 外部更新'; return route.fulfill({ status: 409, json: { code: 409, data: null, message: '文章已被其他地方修改' } }); }
        const doc = { ...body, sha: String(writes.length).repeat(40), extension: body.path.endsWith('.mdx') ? '.mdx' : '.md' };
        docs[body.path] = doc;
        return ok({ document: doc, commitSha: 'd'.repeat(40), commitUrl: 'https://github.com/example/commit/d' });
      }
      throw new Error('Unexpected API request: ' + request.method() + ' ' + url.pathname);
    });
    await page.goto('http://127.0.0.1:5173/articles');
    await page.waitForLoadState('networkidle');
    await page.getByText('guide', { exact: true }).click();
    await page.getByRole('button', { name: 'index.mdx', exact: true }).click();
    await page.getByLabel('标题', { exact: true }).fill('芙宁娜角色攻略 · 更新');
    await page.getByRole('button', { name: '保存更新', exact: true }).click();
    await page.getByText(/已提交 GitHub/).waitFor();
    assert.equal(writes[0].body, originalBody, 'metadata-only save must preserve CRLF body');
    assert.equal(writes[0].path, 'guide/index.mdx');
    assert.deepEqual(writes[0].frontmatter.custom, { keep: true });

    await page.getByLabel('Slug', { exact: true }).fill('furina-complete-guide');
    await page.getByRole('button', { name: '保存更新', exact: true }).click();
    await page.getByText(/已提交 GitHub/).waitFor();
    assert.equal(writes[1].sha, '1'.repeat(40), 'consecutive saves must use refreshed SHA');
    assert.equal(writes[1].path, 'guide/index.mdx');

    const bodyInput = page.getByLabel('Markdown 正文');
    await bodyInput.focus();
    await bodyInput.evaluate(el => { el.setSelectionRange(0, 0); el.dispatchEvent(new Event('select', { bubbles: true })); });
    await page.getByRole('button', { name: 'Insert Image' }).click();
    await page.getByRole('button', { name: 'furina.webp', exact: true }).click();
    await page.getByLabel('图片描述', { exact: true }).fill('Furina');
    await page.getByRole('button', { name: '使用这张图片' }).click();
    assert.match(await bodyInput.inputValue(), /!\[Furina\]\(<https:\/\/images.example\/image\/furina.webp>\)/);

    await page.getByRole('button', { name: '选择 / 上传图片' }).click();
    await page.getByRole('button', { name: 'Repository Assets', exact: true }).click();
    await page.getByRole('button', { name: 'guide/cover.png', exact: true }).click();
    await page.getByRole('button', { name: '使用这张图片' }).click();
    assert.equal(await page.getByLabel('封面引用', { exact: true }).inputValue(), './cover.png');
    fs.mkdirSync('.wrangler/qa', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.article-properties').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: '.wrangler/qa/articles-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile must not overflow');
    await page.screenshot({ path: '.wrangler/qa/articles-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1560, height: 1060 });

    forceConflict = true;
    const localBody = await bodyInput.inputValue();
    await page.getByRole('button', { name: '保存更新', exact: true }).click();
    await page.getByRole('heading', { name: '比较 GitHub 最新版本' }).waitFor();
    assert.equal(await bodyInput.inputValue(), localBody, 'conflict must retain local edits');
    await page.getByRole('button', { name: '已比较，使用最新 SHA 继续编辑' }).click();
    await page.getByRole('button', { name: '保存更新', exact: true }).click();
    await page.getByText(/已提交 GitHub/).waitFor();
    assert.equal(writes.at(-1).sha, 'f'.repeat(40));

    await page.getByRole('button', { name: 'hello.md', exact: true }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('heading', { name: 'Hello', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator('.markdown-preview a[href^="javascript:"]').count(), 0);

    await page.getByRole('button', { name: '新建文章', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建文章' });
    await dialog.getByLabel('标题', { exact: true }).fill('New Story');
    await dialog.getByLabel('相对文件路径').fill('new-story');
    await dialog.getByRole('button', { name: '开始编辑' }).click();
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await page.getByText(/已提交 GitHub/).waitFor();
    assert.equal(writes.at(-1).frontmatter.draft, true);
    assert.equal(writes.at(-1).path, 'new-story.md');
    assert.equal(writes.at(-1).frontmatter.updated, undefined);
    await page.getByRole('button', { name: '删除文章', exact: true }).click();
    await page.getByText(/删除已提交 GitHub/).waitFor();
    assert.equal(docs['new-story.md'], undefined);
    assert.ok(docs['guide/index.mdx']);
    assert.deepEqual(errors, []);
    console.log('PASS: content tree, opaque MDX, stable path, consecutive SHA, R2/local picker, mobile, conflict, safe preview, create/delete');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
