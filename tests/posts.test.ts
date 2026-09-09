import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { parsePost, serializePost } from '../worker/utils/frontmatter';
import { classifyTree, effectiveSlug, PostService, validateFrontmatter, validatePostPath } from '../worker/services/post.service';
import { PostRepository, type GitEntry } from '../worker/repositories/post.repository';
import { relativeAssetPath, resolvePostAsset } from '../shared/post';
import app from '../worker/index';

const sha = 'a'.repeat(40), nextSha = 'b'.repeat(40), revision = 'c'.repeat(40);
const source = '---\r\n# 保留这个注释\r\ntitle: 原标题\r\npublished: 2026-09-09\r\ncustom: {nested: [one, two]}\r\ncomment: false\r\n---\r\n\r\nimport { Badge } from "@components/firefly-mdx";\r\n\r\n<TabGroup labels={["test.js", "test.py"]}>\r\n  text  \r\n</TabGroup>\r\n\r\n:::tip\r\n[[wiki-link]] $E = mc^2$\r\n::: \r\n<iframe src="https://example.com" />';
const entry = (path: string, type = 'blob', mode = '100644'): GitEntry => ({ path, sha, type, mode });
function repository(content = source, path = 'bundle/index.mdx') {
  return {
    getTree: vi.fn().mockResolvedValue({ entries: [entry(path)], revision }),
    getFile: vi.fn().mockImplementation(async (filePath: string) => ({ path: filePath, sha, content })),
    assertWritable: vi.fn(), head: vi.fn().mockResolvedValue(revision),
    createFile: vi.fn().mockResolvedValue({ sha: nextSha, commitSha: revision, commitUrl: 'https://github.com/example/commit/' + revision }),
    updateFile: vi.fn().mockResolvedValue({ sha: nextSha, commitSha: revision, commitUrl: 'https://github.com/example/commit/' + revision }),
    deleteFile: vi.fn().mockResolvedValue({ commitSha: revision }),
  };
}

describe('frontmatter 保真', () => {
  it('只改标题，MDX 正文、CRLF、尾部空白和未知字段不变', () => {
    const original = parsePost(source);
    const output = serializePost({ ...original.frontmatter, title: '新标题' }, original.body, source);
    expect(parsePost(output).body).toBe(original.body);
    expect(output).toContain('# 保留这个注释');
    expect(output).toContain('\r\n');
    expect(parsePost(output).frontmatter.custom).toEqual({ nested: ['one', 'two'] });
    expect(parsePost(output).frontmatter.comment).toBe(false);
    expect(output.endsWith('<iframe src="https://example.com" />')).toBe(true);
  });
  it('未编辑时整个文件逐字一致，包括 BOM', () => {
    for (const original of [source, '\uFEFF' + source]) {
      const parsed = parsePost(original);
      expect(serializePost(parsed.frontmatter, parsed.body, original)).toBe(original);
    }
  });
  it('创建不注入 updated，日期写为 YAML timestamp', () => {
    const output = serializePost({ title: '新文章', published: '2026-09-09', slug: 'new-post', draft: true }, '\n# 正文');
    expect(output).not.toContain('updated');
    const yaml = parsePost(output);
    expect(yaml.frontmatter.published).toBe('2026-09-09T00:00:00.000Z');
    expect(parse(output.split('---')[1], { customTags: ['timestamp'] }).published).toBeInstanceOf(Date);
  });
  it.each(['# no yaml', '---\ntitle: foo\n', '---\ntitle: a\ntitle: b\n---\n', '---\n[x, y]\n---\n', '---\nx: [broken\n---\n'])('拒绝不安全或损坏的头部 %s', value => expect(() => parsePost(value)).toThrow());
  it('正文中的分隔符不是 frontmatter', () => expect(() => parsePost('正文\n---\ntitle: fake\n---\n')).toThrow());
});

describe('文章模型与内容树', () => {
  it.each(['guide/a.md', '你好/index.mdx', 'resume-agent/index.md'])('支持有效嵌套路径 %s', path => expect(() => validatePostPath(path)).not.toThrow());
  it.each(['../x.md', '/x.md', 'a/../x.md', 'a//x.md', 'a\\x.md', 'a/%2e%2e/x.md', 'a.md?x', 'a/./x.md', 'a.md/', 'a.png', 'a.MDX', 'a\u0000.md', ' a.md'])('拒绝无效路径 %s', path => expect(() => validatePostPath(path)).toThrow());
  it('Bundle 保留图片关系，双 index 标记冲突，符号链接只读', () => {
    const tree = classifyTree([entry('bundle', 'tree', '040000'), entry('bundle/index.md'), entry('bundle/index.mdx'), entry('bundle/cover.png'), entry('link.md', 'blob', '120000')]);
    expect(tree[0]).toMatchObject({ kind: 'bundle', conflict: true });
    expect(tree[0].entryPath).toBeUndefined();
    expect(tree[3].kind).toBe('asset'); expect(tree[4].kind).toBe('unsupported');
  });
  it('缺省字段保留差异；未知字段不能由请求覆盖；false/0 不丢失', () => {
    const old = { title: 'Old', published: '2026-09-09', custom: { a: 1 }, updated: '2026-09-08' };
    const value = validateFrontmatter({ ...old, title: 'New', updated: '', author: '', custom: null, comment: false, seriesOrder: 0 }, old);
    expect(value.custom).toEqual({ a: 1 }); expect(value).not.toHaveProperty('updated'); expect(value).not.toHaveProperty('author');
    expect(value.comment).toBe(false); expect(value.seriesOrder).toBe(0);
  });
  it('全局 ID 包含旧文章推导路径和显式 slug', () => {
    const fm = { title: 'test', published: '2026-09-09' };
    expect(effectiveSlug('Guide/Hello World/index.mdx', fm)).toBe('guide/hello-world');
    expect(effectiveSlug('Guide/Hello World/index.mdx', { ...fm, slug: 'custom' })).toBe('custom');
  });
  it('新建必须有 slug，旧文章缺省时可继续保留', () => {
    const fm = { title: 'title', published: '2026-09-09' };
    expect(() => validateFrontmatter(fm)).toThrow('slug');
    expect(validateFrontmatter(fm, fm)).not.toHaveProperty('slug');
  });
  it.each(['2026-02-30', '', 'invalid', '2026-13-09'])('拒绝非法日期 %s', published => expect(() => validateFrontmatter({ title: 'x', published, slug: 'x' })).toThrow());
  it('本地资源相对引用不逃出内容根目录', () => {
    expect(resolvePostAsset('guide/index.md', './cover.png')).toBe('guide/cover.png');
    expect(resolvePostAsset('guide/index.md', '../shared/cover.png')).toBe('shared/cover.png');
    expect(resolvePostAsset('guide/index.md', '../../secret.png')).toBeNull();
    expect(resolvePostAsset('guide/index.md', 'https://evil.test/a.png')).toBeNull();
    expect(relativeAssetPath('guide/index.md', 'other/封面.png')).toBe('../other/%E5%B0%81%E9%9D%A2.png');
  });
});

describe('文章写入语义', () => {
  afterEach(() => vi.useRealTimers());
  it('已发布文章真实修改才自动 updated，更新同一路径并返回新 SHA', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T17:00:00Z'));
    const repo = repository(); const old = parsePost(source);
    const result = await new PostService(repo as unknown as PostRepository).save({ path: 'bundle/index.mdx', sha, frontmatter: { ...old.frontmatter, title: 'changed' }, body: old.body }, false);
    expect(repo.updateFile.mock.calls[0][0]).toBe('bundle/index.mdx');
    expect(parsePost(repo.updateFile.mock.calls[0][2]).body).toBe(old.body);
    expect(result.document.frontmatter.updated).toBe('2026-09-10T00:00:00.000Z');
    expect(result.document.sha).toBe(nextSha);
  });
  it('无变更不提交，不补 updated', async () => {
    const repo = repository(), old = parsePost(source);
    const result = await new PostService(repo as unknown as PostRepository).save({ path: 'bundle/index.mdx', sha, frontmatter: old.frontmatter, body: old.body }, false);
    expect(result.commitSha).toBeNull(); expect(repo.updateFile).not.toHaveBeenCalled();
  });
  it('首次发布草稿不补 updated，手动关闭自动日期时不补 updated', async () => {
    for (const draft of [true, false]) {
      const text = source.replace('comment: false', `comment: false\r\ndraft: ${draft}`);
      const repo = repository(text), old = parsePost(text);
      const result = await new PostService(repo as unknown as PostRepository).save({ path: 'bundle/index.mdx', sha, frontmatter: { ...old.frontmatter, draft: false, title: 'changed' }, body: old.body, autoUpdated: draft }, false);
      expect(result.document.frontmatter).not.toHaveProperty('updated');
    }
  });
  it('旧 SHA 拒绝更新与删除，不能自动替换成最新 SHA', async () => {
    const repo = repository(), service = new PostService(repo as unknown as PostRepository), old = parsePost(source);
    await expect(service.save({ path: 'bundle/index.mdx', sha: nextSha, frontmatter: old.frontmatter, body: old.body }, false)).rejects.toMatchObject({ status: 409 });
    await expect(service.delete({ path: 'bundle/index.mdx', sha: nextSha })).rejects.toMatchObject({ status: 409 });
    expect(repo.updateFile).not.toHaveBeenCalled(); expect(repo.deleteFile).not.toHaveBeenCalled();
  });
  it('跨目录、mdx 和缺省 slug 都参与唯一性检查', async () => {
    const repo = repository(); repo.getTree.mockResolvedValue({ entries: [entry('guide/index.mdx')], revision });
    const service = new PostService(repo as unknown as PostRepository);
    await expect(service.save({ path: 'new.md', frontmatter: { title: 'new', published: '2026-09-09', slug: 'guide', draft: true }, body: '' }, true)).rejects.toMatchObject({ status: 409 });
    expect(repo.createFile).not.toHaveBeenCalled();
  });
  it('校验期间分支改变，停止写入', async () => {
    const repo = repository(); repo.getTree.mockResolvedValue({ entries: [], revision }); repo.head.mockResolvedValue(nextSha);
    await expect(new PostService(repo as unknown as PostRepository).save({ path: 'new.md', frontmatter: { title: 'new', published: '2026-09-09', slug: 'new', draft: true }, body: '' }, true)).rejects.toMatchObject({ status: 409 });
    expect(repo.createFile).not.toHaveBeenCalled();
  });
});

describe('GitHub 适配与 API 边界', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const env = { APP_ENV: 'development', GITHUB_OWNER: 'March7th-OvO', GITHUB_REPO: 'Firefly', GITHUB_BRANCH: 'master', GITHUB_POSTS_PATH: 'src/content/posts' } as Env;
  it('recursive 截断时重新逐层遍历，不信任不完整数据', async () => {
    const repo = new PostRepository(env);
    vi.spyOn(repo, 'head').mockResolvedValue(revision);
    const request = vi.spyOn(repo, 'request').mockResolvedValueOnce({ tree: [entry('src', 'tree')], truncated: false })
      .mockResolvedValueOnce({ tree: [entry('content', 'tree')], truncated: false })
      .mockResolvedValueOnce({ tree: [entry('posts', 'tree')], truncated: false })
      .mockResolvedValueOnce({ tree: [entry('incomplete.md')], truncated: true })
      .mockResolvedValueOnce({ tree: [entry('folder', 'tree'), entry('root.md')], truncated: false })
      .mockResolvedValueOnce({ tree: [entry('index.mdx'), entry('cover.png')], truncated: false });
    const tree = await repo.getTree();
    expect(tree.entries.map(e => e.path)).toEqual(['folder', 'root.md', 'folder/index.mdx', 'folder/cover.png']);
    expect(request).toHaveBeenCalledTimes(6);
  });
  it('开发默认只读且没有 token 不写 GitHub', () => {
    expect(() => new PostRepository(env).assertWritable()).toThrow('GITHUB_TOKEN');
    expect(() => new PostRepository({ ...env, GITHUB_TOKEN: 'test' }).assertWritable()).toThrow('默认关闭');
  });
  it('UTF-8 Base64 正确往返且提交带 branch / SHA', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: { sha: nextSha }, commit: { sha: revision, html_url: 'https://example.com' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await new PostRepository({ ...env, GITHUB_TOKEN: 'test', GITHUB_ALLOW_WRITES: 'true' }).updateFile('目录/index.mdx', sha, '正文 🍰');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(new TextDecoder().decode(Uint8Array.from(atob(body.content), c => c.charCodeAt(0)))).toBe('正文 🍰');
    expect(body.sha).toBe(sha); expect(body.branch).toBe('master');
    expect(fetcher.mock.calls[0][0]).toContain('%E7%9B%AE%E5%BD%95/index.mdx');
  });
  it('大于 1 MB 的图片使用同一 commit 的 raw 数据，仍限制大小', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 1);
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ type: 'file', sha, encoding: 'none', content: '', size: bytes.length })))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', fetcher);
    const result = await new PostRepository(env).getBytes('cover.png', revision, 10 * 1024 * 1024);
    expect(result.bytes.length).toBe(bytes.length);
    expect(fetcher.mock.calls[1][0]).toContain(`ref=${revision}`);
    expect(fetcher.mock.calls[1][1].headers.Accept).toBe('application/vnd.github.raw+json');
  });
  it('新建 API 不提供 draft 时默认草稿', () => {
    expect(validateFrontmatter({ title: 'new', published: '2026-09-09', slug: 'new' }).draft).toBe(true);
  });
  it('新 API 沿用 Access，未配置生产鉴权不得读取', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await app.request('https://odette.moe/api/posts/tree', {}, { ...env, APP_ENV: 'production' });
    expect(response.status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it('JSON 与路径错误返回统一错误，不访问 GitHub', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const body of ['null', '{broken', '[]']) {
      const response = await app.request('http://localhost/api/posts', { method: 'POST', body }, env);
      expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 400, data: null });
    }
    const response = await app.request('http://localhost/api/posts?path=../secret.md', {}, env);
    expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  });
  it('跨域写入被现有中间件拦截', async () => {
    const response = await app.request('http://localhost/api/posts', { method: 'POST', headers: { Origin: 'https://other.test' }, body: '{}' }, env);
    expect(response.status).toBe(403);
  });
});
