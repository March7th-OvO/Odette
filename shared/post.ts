/** GitHub 内容根目录内的相对路径；与公开 URL 的 slug 独立。 */
export interface PostFrontmatter {
  title: string;
  published: string;
  updated?: string;
  slug?: string;
  description?: string;
  image?: string;
  tags?: string[];
  category?: string | null;
  lang?: string;
  draft?: boolean;
  pinned?: boolean;
  comment?: boolean;
  author?: string;
  sourceLink?: string;
  licenseName?: string;
  licenseUrl?: string;
  password?: string;
  passwordHint?: string;
  series?: string;
  seriesOrder?: number;
  [key: string]: unknown;
}
export interface PostDocument {
  path: string;
  sha: string;
  extension: '.md' | '.mdx';
  frontmatter: PostFrontmatter;
  body: string;
}
export interface ContentEntry {
  path: string;
  sha: string;
  kind: 'article' | 'folder' | 'bundle' | 'asset' | 'unsupported';
  entryPath?: string;
  conflict?: boolean;
}
export interface ContentTree { entries: ContentEntry[]; revision: string; mediaBaseUrl?: string }
export interface SavePostRequest {
  path: string;
  sha?: string;
  frontmatter: PostFrontmatter;
  body: string;
  autoUpdated?: boolean;
}
export interface PostWriteResult { document: PostDocument; commitSha: string | null; commitUrl: string | null }
export const POST_MAX_BYTES = 1024 * 1024;
export const postExtension = (path: string): '.md' | '.mdx' => path.endsWith('.mdx') ? '.mdx' : '.md';

/** 本地图片相对于文档目录解析，只允许解析到内容根目录内部。 */
export function resolvePostAsset(documentPath: string, reference: string): string | null {
  if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(reference) || reference === 'api') return null;
  let decoded: string;
  try { decoded = decodeURIComponent(reference.split(/[?#]/)[0]); } catch { return null; }
  if (/[\\\x00-\x1f\x7f]/.test(decoded)) return null;
  const segments = documentPath.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '.' || !part) continue;
    if (part === '..') { if (!segments.length) return null; segments.pop(); }
    else segments.push(part);
  }
  return segments.join('/') || null;
}
export function relativeAssetPath(documentPath: string, assetPath: string): string {
  const from = documentPath.split('/').slice(0, -1), to = assetPath.split('/');
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  return `${from.length ? '../'.repeat(from.length) : './'}${to.map(encodeURIComponent).join('/')}`;
}
