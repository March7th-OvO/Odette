import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { SavePostRequest } from '../../shared/post';
import { PostRepository } from '../repositories/post.repository';
import { PostService, validatePostPath } from '../services/post.service';
import type { AppEnv } from '../types/env';
import { success } from '../utils/response';

export const postRoutes = new Hono<AppEnv>();
postRoutes.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({ code: 413, data: null, message: '请求不能超过 2 MiB' }, 413) }));
postRoutes.get('/tree', async c => c.json(success({ ...await new PostService(new PostRepository(c.env)).tree(), mediaBaseUrl: c.env.PUBLIC_IMAGE_URL })));
// 本地图片由鉴权接口读取；只开放安全栅格格式，不返回可执行 HTML/SVG。
postRoutes.get('/asset', async c => {
  const path = c.req.query('path'); validatePostPath(path, false);
  const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
  const type = mime[path.split('.').pop()!.toLowerCase()];
  if (!type) throw new HTTPException(422, { message: '此仓库资源暂不支持预览' });
  const repository = new PostRepository(c.env);
  const tree = await repository.getTree();
  const entry = tree.entries.find(e => e.path === path);
  if (!entry || entry.type !== 'blob' || entry.mode === '120000') throw new HTTPException(404, { message: '图片不存在' });
  const file = await repository.getBytes(path, tree.revision, 10 * 1024 * 1024);
  return new Response(file.bytes as BodyInit, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
postRoutes.get('/', async c => c.json(success(await new PostService(new PostRepository(c.env)).get(c.req.query('path')))));
for (const method of ['post', 'put', 'delete'] as const) {
  postRoutes[method]('/', async c => {
    let body: unknown;
    try { body = await c.req.json(); } catch { throw new HTTPException(400, { message: '请求体必须为 JSON' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HTTPException(400, { message: '请求体必须是对象' });
    const service = new PostService(new PostRepository(c.env));
    const result = method === 'delete' ? await service.delete(body as { path: unknown; sha: unknown }) : await service.save(body as SavePostRequest, method === 'post');
    return c.json(success(result), method === 'post' ? 201 : 200);
  });
}
