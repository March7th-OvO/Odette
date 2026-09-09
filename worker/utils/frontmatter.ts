import { isMap, parseDocument } from 'yaml';
import { HTTPException } from 'hono/http-exception';
import type { PostFrontmatter } from '../../shared/post';

/** 仅解析文件开头的 YAML；闭合分隔符后的所有字节不经 Markdown AST。 */
export function parsePost(source: string) {
  const match = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(source);
  if (!match || match.index !== 0) throw new HTTPException(422, { message: '文章缺少完整的 YAML Frontmatter，已阻止保存' });
  const yaml = parseDocument(match[2], { uniqueKeys: true, customTags: ['timestamp'] });
  if (yaml.errors.length || yaml.warnings.length || !isMap(yaml.contents)) throw new HTTPException(422, { message: 'Frontmatter 无法安全解析，请先修复 YAML' });
  let value: unknown;
  try { value = yaml.toJS({ maxAliasCount: 50 }); } catch { throw new HTTPException(422, { message: 'Frontmatter 引用过于复杂' }); }
  // JSON 传输日期使用字符串；序列化时恢复 YAML timestamp，兼容 Firefly z.date()。
  const frontmatter = JSON.parse(JSON.stringify(value)) as PostFrontmatter;
  return { yaml, frontmatter, body: source.slice(match[0].length), opening: match[1], closing: match[3], raw: match[0], newline: match[1].includes('\r\n') ? '\r\n' : '\n' };
}

export function serializePost(frontmatter: PostFrontmatter, body: string, original?: string): string {
  const parsed = parsePost(original ?? '---\n{}\n---\n');
  let changed = false;
  // 在原 YAML 节点上做字段级变更，保留未修改字段、注释和未知扩展。
  for (const key of new Set([...Object.keys(parsed.frontmatter), ...Object.keys(frontmatter)])) {
    if (JSON.stringify(parsed.frontmatter[key]) === JSON.stringify(frontmatter[key])) continue;
    changed = true;
    if (!(key in frontmatter)) parsed.yaml.delete(key);
    else {
      const value = frontmatter[key];
      parsed.yaml.set(key, (key === 'published' || key === 'updated') && typeof value === 'string' ? new Date(value) : value);
    }
  }
  if (!changed && original !== undefined) return parsed.raw + body;
  const yaml = parsed.yaml.toString({ lineWidth: 0 }).replace(/\r?\n/g, parsed.newline);
  return parsed.opening + yaml + (parsed.closing.endsWith('\n') ? parsed.closing : parsed.closing + parsed.newline) + body;
}
