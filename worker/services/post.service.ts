import { HTTPException } from 'hono/http-exception';
import { slug as githubSlug } from 'github-slugger';
import { postExtension, type ContentEntry, type PostDocument, type PostFrontmatter, type SavePostRequest } from '../../shared/post';
import { PostRepository, type GitEntry } from '../repositories/post.repository';
import { parsePost, serializePost } from '../utils/frontmatter';

const strings = ['title', 'published', 'updated', 'slug', 'description', 'image', 'lang', 'author', 'sourceLink', 'licenseName', 'licenseUrl', 'password', 'passwordHint', 'series'];
const booleans = ['draft', 'pinned', 'comment'];
const editable = new Set([...strings, ...booleans, 'tags', 'category', 'seriesOrder']);
const bad = (message: string): never => { throw new HTTPException(422, { message }); };

export function validatePostPath(value: unknown, article = true): asserts value is string {
  if (typeof value !== 'string' || !value || new TextEncoder().encode(value).length > 1024 || /[\\%?#:\x00-\x1f\x7f]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..' || p.trim() !== p) || (article && !/\.(md|mdx)$/.test(value))) {
    throw new HTTPException(400, { message: 'path 必须是内容根目录内的有效相对路径；文章仅支持 .md / .mdx' });
  }
}
function requireSha(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new HTTPException(400, { message: '请提供文件当前 SHA' });
}
export function effectiveSlug(path: string, fm: PostFrontmatter): string {
  // 与 Astro glob 默认 ID 规则一致，显式 slug 优先；兼容已有嵌套 index。
  return fm.slug || path.replace(/\.(md|mdx)$/, '').split('/').map(segment => githubSlug(segment)).join('/').replace(/\/index$/, '');
}
export function classifyTree(entries: GitEntry[]): ContentEntry[] {
  const files = new Set(entries.filter(e => e.type === 'blob' && e.mode !== '120000').map(e => e.path));
  return entries.map(e => {
    if (e.type === 'tree') {
      const indexes = [`${e.path}/index.md`, `${e.path}/index.mdx`].filter(path => files.has(path));
      return { path: e.path, sha: e.sha, kind: indexes.length ? 'bundle' : 'folder', ...(indexes.length === 1 ? { entryPath: indexes[0] } : {}), ...(indexes.length > 1 ? { conflict: true } : {}) };
    }
    return { path: e.path, sha: e.sha, kind: e.type !== 'blob' || e.mode === '120000' ? 'unsupported' : /\.(md|mdx)$/.test(e.path) ? 'article' : 'asset' };
  });
}
export function validateFrontmatter(input: unknown, previous?: PostFrontmatter): PostFrontmatter {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('frontmatter 必须是对象');
  const source = input as Record<string, unknown>;
  // 仅更新受支持的字段，未知字段从原文件保留；不信任客户端重写内部字段。
  const fm: Record<string, unknown> = previous ? { ...previous } : { draft: true };
  for (const key of editable) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === '' && !['title', 'published'].includes(key) && previous?.[key] !== '') delete fm[key];
    else fm[key] = value;
  }
  if (typeof fm.title !== 'string' || !fm.title.trim()) bad('标题不能为空');
  for (const key of strings) if (key in fm && typeof fm[key] !== 'string') bad(`${key} 必须是文本`);
  for (const key of booleans) if (key in fm && typeof fm[key] !== 'boolean') bad(`${key} 必须是布尔值`);
  for (const key of ['published', 'updated']) {
    if (key === 'updated' && !('updated' in fm)) continue;
    const date = fm[key];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date.slice(0, 10)).toISOString().slice(0, 10) !== date.slice(0, 10)) bad(`${key} 必须是有效日期`);
  }
  if ('tags' in fm && (!Array.isArray(fm.tags) || fm.tags.some(t => typeof t !== 'string'))) bad('tags 必须是文本数组');
  if (Array.isArray(fm.tags)) fm.tags = [...new Set(fm.tags.map(t => t.trim()).filter(Boolean))];
  if ('category' in fm && fm.category !== null && typeof fm.category !== 'string') bad('category 必须是文本或 null');
  if ('seriesOrder' in fm && (typeof fm.seriesOrder !== 'number' || !Number.isFinite(fm.seriesOrder))) bad('seriesOrder 必须是数字');
  if ((!previous || fm.slug !== previous.slug) && (typeof fm.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.slug))) bad('新建或修改 slug 时，只允许小写字母、数字和连字符');
  return fm as PostFrontmatter;
}

export class PostService {
  constructor(private readonly repository: PostRepository) {}
  async tree() {
    const tree = await this.repository.getTree();
    return { entries: classifyTree(tree.entries), revision: tree.revision };
  }
  async get(path: unknown): Promise<PostDocument> {
    validatePostPath(path);
    const tree = await this.repository.getTree();
    this.assertArticle(tree.entries, path);
    const file = await this.repository.getFile(path, tree.revision);
    const parsed = parsePost(file.content);
    // 无效的已知字段不能进入表单，避免编辑时把损坏数据默认为空值覆盖。
    validateFrontmatter(parsed.frontmatter, parsed.frontmatter);
    return { path, sha: file.sha, extension: postExtension(path), frontmatter: parsed.frontmatter, body: parsed.body };
  }
  private assertArticle(entries: GitEntry[], path: string) {
    const found = entries.find(e => e.path === path);
    if (!found) throw new HTTPException(404, { message: '文章不存在' });
    if (found.type !== 'blob' || found.mode === '120000') bad('不支持编辑符号链接或目录');
  }
  async save(input: SavePostRequest, create: boolean) {
    validatePostPath(input.path);
    if (typeof input.body !== 'string') bad('body 必须是原始文本');
    if (input.autoUpdated !== undefined && typeof input.autoUpdated !== 'boolean') bad('autoUpdated 必须是布尔值');
    if (!create) requireSha(input.sha);
    this.repository.assertWritable();
    const tree = await this.repository.getTree();
    let original: string | undefined;
    let previous: PostFrontmatter | undefined;
    let previousBody: string | undefined;
    if (create) {
      if (tree.entries.some(e => e.path === input.path)) throw new HTTPException(409, { message: '该路径已存在，请更换文件路径' });
      const parents = input.path.split('/').slice(0, -1);
      for (let n = 1; n <= parents.length; n++) {
        const entry = tree.entries.find(e => e.path === parents.slice(0, n).join('/'));
        if (entry && entry.type !== 'tree') bad('父路径不是目录');
      }
    } else {
      this.assertArticle(tree.entries, input.path);
      const file = await this.repository.getFile(input.path, tree.revision);
      if (file.sha !== input.sha) throw new HTTPException(409, { message: '文章已被其他地方修改，请保留本地编辑并比较最新版本' });
      original = file.content;
      const parsed = parsePost(original);
      previous = parsed.frontmatter; previousBody = parsed.body;
    }
    const frontmatter = validateFrontmatter(input.frontmatter, previous);
    const changed = previousBody !== input.body || JSON.stringify(previous) !== JSON.stringify(frontmatter);
    if (previous && !previous.draft && changed && input.autoUpdated !== false) {
      // CMS 统一使用香港日期，避免 UTC 跨日使修改日期偏移。
      frontmatter.updated = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    }
    const content = serializePost(frontmatter, input.body, original);
    if (original === content) return { document: { path: input.path, sha: input.sha!, extension: postExtension(input.path), frontmatter: previous!, body: input.body }, commitSha: null, commitUrl: null };
    const slug = effectiveSlug(input.path, frontmatter);
    // 从同一 commit 快照逐篇读取，不能拿文件树的 SHA 代替 frontmatter 索引。
    const articles = tree.entries.filter(e => e.type === 'blob' && e.mode !== '120000' && /\.(md|mdx)$/.test(e.path) && e.path !== input.path);
    for (let offset = 0; offset < articles.length; offset += 6) {
      const group = await Promise.all(articles.slice(offset, offset + 6).map(async entry => {
        const file = await this.repository.getFile(entry.path, tree.revision);
        return { path: entry.path, slug: effectiveSlug(entry.path, parsePost(file.content).frontmatter) };
      }));
      const collision = group.find(entry => entry.slug === slug);
      if (collision) throw new HTTPException(409, { message: `slug 已被 ${collision.path} 使用` });
    }
    // 捕获校验期间的分支变化；Contents API 仍只提供文件级乐观锁。
    if (await this.repository.head() !== tree.revision) throw new HTTPException(409, { message: '仓库在校验期间发生变化，请重试保存' });
    const result = create ? await this.repository.createFile(input.path, content) : await this.repository.updateFile(input.path, input.sha!, content);
    const persisted = parsePost(content);
    return { document: { path: input.path, sha: result.sha, extension: postExtension(input.path), frontmatter: persisted.frontmatter, body: persisted.body }, commitSha: result.commitSha, commitUrl: result.commitUrl };
  }
  async delete(input: { path: unknown; sha: unknown }) {
    validatePostPath(input.path); requireSha(input.sha);
    this.repository.assertWritable();
    const tree = await this.repository.getTree();
    this.assertArticle(tree.entries, input.path);
    if (tree.entries.find(e => e.path === input.path)!.sha !== input.sha) throw new HTTPException(409, { message: '文件版本已变化，不能删除' });
    return this.repository.deleteFile(input.path, input.sha);
  }
}
