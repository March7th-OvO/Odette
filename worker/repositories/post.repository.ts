import { HTTPException } from 'hono/http-exception';
import { POST_MAX_BYTES } from '../../shared/post';
import type { PostBindings } from '../types/env';

export interface GitEntry { path: string; sha: string; type: string; mode: string; size?: number }
export interface RepositoryFile { path: string; sha: string; content: string }
export interface GitTree { tree: GitEntry[]; sha: string; truncated: boolean }
interface GitFile { type: string; sha: string; content: string; encoding: string; size: number }
interface GitWrite { content: { sha: string }; commit: { sha: string; html_url: string } }
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
// 只缓存按不可变 commit 定位的树，head 仍每次读取，避免缓存掩盖写入冲突。
const treeSnapshots = new Map<string, { entries: GitEntry[]; revision: string }>();

/** GitHub 适配层只处理文件和版本；不理解 frontmatter 或文章字段。 */
export class PostRepository {
  readonly branch: string;
  readonly root: string;
  private readonly api: string;
  constructor(private readonly env: PostBindings) {
    const owner = env.GITHUB_OWNER, repo = env.GITHUB_REPO;
    this.branch = env.GITHUB_BRANCH || 'master';
    this.root = env.GITHUB_POSTS_PATH || 'src/content/posts';
    if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || this.root.split('/').some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f]/.test(this.root)) {
      throw new HTTPException(503, { message: '请先配置 GitHub 仓库和文章根目录' });
    }
    this.api = `https://api.github.com/repos/${owner}/${repo}`;
  }
  private async execute(endpoint: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(this.api + endpoint, { ...init, signal: AbortSignal.timeout(20000), headers: {
        Accept: accept, 'Content-Type': 'application/json', 'User-Agent': 'Odette-CMS', 'X-GitHub-Api-Version': '2022-11-28',
        ...(this.env.GITHUB_TOKEN ? { Authorization: `Bearer ${this.env.GITHUB_TOKEN}` } : {}),
      } });
    } catch { throw new HTTPException(502, { message: 'GitHub 请求失败；若刚执行保存，请重新读取文章核对结果后再重试' }); }
    if (!response.ok) {
      if (response.status === 404) throw new HTTPException(404, { message: 'GitHub 文件、目录或分支不存在，或凭据无访问权限' });
      if (response.status === 409) throw new HTTPException(409, { message: 'GitHub 版本冲突，请保留编辑内容并重新载入比较' });
      if (response.status === 422) throw new HTTPException(422, { message: 'GitHub 拒绝写入，请检查路径、文件版本和分支规则' });
      if ([401, 403, 429].includes(response.status)) throw new HTTPException(503, { message: 'GitHub 凭据、分支权限或请求额度不可用，请检查设置后重试' });
      throw new HTTPException(502, { message: 'GitHub 服务暂时不可用' });
    }
    return response;
  }
  async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    return await (await this.execute(endpoint, init)).json() as T;
  }
  assertWritable() {
    if (!this.env.GITHUB_TOKEN) throw new HTTPException(503, { message: '尚未设置 GITHUB_TOKEN，当前只读' });
    if (this.env.APP_ENV === 'development' && this.env.GITHUB_ALLOW_WRITES !== 'true') throw new HTTPException(403, { message: '本地 GitHub 写入默认关闭；确认目标后设置 GITHUB_ALLOW_WRITES=true' });
  }
  async head(): Promise<string> {
    return (await this.request<{ sha: string }>(`/commits/${encodeURIComponent(this.branch)}`)).sha;
  }
  async getTree(revision?: string): Promise<{ entries: GitEntry[]; revision: string }> {
    const ref = revision ?? await this.head();
    const cacheKey = `${this.api}/${this.root}@${ref}`;
    const cached = treeSnapshots.get(cacheKey);
    if (cached) return cached;
    const result = await this.readTree(ref);
    if (treeSnapshots.size >= 8) treeSnapshots.delete(treeSnapshots.keys().next().value!);
    // 大树不长期驻留 isolate，避免内容规模增长时占满内存。
    if (result.entries.length <= 10000) treeSnapshots.set(cacheKey, result);
    return result;
  }
  private async readTree(ref: string): Promise<{ entries: GitEntry[]; revision: string }> {
    let sha = ref;
    // 先按层找到 posts 子树；截断回退不能依赖已被截断的结果。
    for (const segment of this.root.split('/')) {
      const tree = await this.request<GitTree>(`/git/trees/${encodeURIComponent(sha)}`);
      if (tree.truncated) throw new HTTPException(502, { message: 'GitHub 目录树不完整，已停止读取' });
      const next = tree.tree.find(e => e.path === segment && e.type === 'tree');
      if (!next) throw new HTTPException(404, { message: '文章根目录不存在' });
      sha = next.sha;
    }
    const recursive = await this.request<GitTree>(`/git/trees/${sha}?recursive=1`);
    if (!recursive.truncated) return { entries: recursive.tree, revision: ref };
    const entries: GitEntry[] = [], queue = [{ sha, prefix: '' }];
    while (queue.length) {
      const current = queue.shift()!;
      const tree = await this.request<GitTree>(`/git/trees/${current.sha}`);
      if (tree.truncated) throw new HTTPException(502, { message: 'GitHub 目录树不完整，已停止读取' });
      for (const item of tree.tree) {
        const path = current.prefix + item.path;
        entries.push({ ...item, path });
        if (item.type === 'tree') queue.push({ sha: item.sha, prefix: `${path}/` });
      }
    }
    return { entries, revision: ref };
  }
  async getBytes(path: string, ref = this.branch, maxBytes = POST_MAX_BYTES): Promise<{ bytes: Uint8Array; sha: string }> {
    const endpoint = `/contents/${encodePath(`${this.root}/${path}`)}?ref=${encodeURIComponent(ref)}`;
    const file = await this.request<GitFile>(endpoint);
    if (file.type !== 'file' || file.size > maxBytes) throw new HTTPException(422, { message: '文件类型不支持或文件超出读取限制' });
    let bytes: Uint8Array;
    if (file.encoding === 'base64') bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    else if (file.encoding === 'none') {
      // Contents 对超过 1 MB 的图片省略 Base64；同一 commit 下改用 raw 读取。
      const response = await this.execute(endpoint, {}, 'application/vnd.github.raw+json');
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const result = await reader.read(); if (result.done) break;
        length += result.value.length;
        if (length > maxBytes) { await reader.cancel(); throw new HTTPException(413, { message: '文件过大' }); }
        chunks.push(result.value);
      }
      bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } else throw new HTTPException(422, { message: '不支持此文件编码' });
    if (bytes.length > maxBytes) throw new HTTPException(413, { message: '文件过大' });
    return { bytes, sha: file.sha };
  }
  async getFile(path: string, ref = this.branch): Promise<RepositoryFile> {
    const file = await this.getBytes(path, ref);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes); }
    catch { throw new HTTPException(422, { message: '文章必须使用 UTF-8 编码' }); }
    return { path, sha: file.sha, content };
  }
  private async write(path: string, content: string, message: string, sha?: string) {
    this.assertWritable();
    const bytes = new TextEncoder().encode(content);
    if (bytes.length > POST_MAX_BYTES) throw new HTTPException(413, { message: '文章不能超过 1 MiB' });
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const result = await this.request<GitWrite>(`/contents/${encodePath(`${this.root}/${path}`)}`, { method: 'PUT', body: JSON.stringify({ message, content: btoa(binary), branch: this.branch, ...(sha ? { sha } : {}) }) });
    return { sha: result.content.sha, commitSha: result.commit.sha, commitUrl: result.commit.html_url };
  }
  createFile(path: string, content: string) { return this.write(path, content, `文章：创建 ${path}`); }
  updateFile(path: string, sha: string, content: string) { return this.write(path, content, `文章：更新 ${path}`, sha); }
  async deleteFile(path: string, sha: string) {
    this.assertWritable();
    const result = await this.request<GitWrite>(`/contents/${encodePath(`${this.root}/${path}`)}`, { method: 'DELETE', body: JSON.stringify({ message: `文章：删除 ${path}`, sha, branch: this.branch }) });
    return { commitSha: result.commit.sha, commitUrl: result.commit.html_url };
  }
}
