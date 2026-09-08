import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { IMAGE_PREFIX, MAX_FILE_SIZE } from '../../shared/image';
import { ImageService } from '../services/image.service';
import type { AppEnv } from '../types/env';
import { badRequest, success } from '../utils/response';

export const imageRoutes = new Hono<AppEnv>();
imageRoutes.get('/', async c => c.json(success(await new ImageService(c.env).list(
  c.req.query('prefix') || IMAGE_PREFIX, Number(c.req.query('limit') ?? 24), c.req.query('cursor') || undefined,
))));
imageRoutes.post('/', bodyLimit({ maxSize: MAX_FILE_SIZE + 64 * 1024, onError: c => c.json({ code: 413, data: null, message: '上传请求过大，单文件上限 10 MB' }, 413) }), async c => {
  let form: FormData;
  try { form = await c.req.formData(); } catch { return badRequest('请使用 multipart/form-data 上传图片'); }
  const files = form.getAll('file');
  if (files.length !== 1 || !(files[0] instanceof File)) return badRequest('每次请求请提供一个 file 文件字段');
  const prefix = form.get('prefix');
  if (prefix !== null && typeof prefix !== 'string') return badRequest('prefix 必须是目录路径');
  return c.json(success(await new ImageService(c.env).upload(files[0], prefix || IMAGE_PREFIX)));
});
imageRoutes.delete('/', bodyLimit({ maxSize: 4096 }), async c => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest('请求体必须为 JSON'); }
  if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string') return badRequest('请提供图片 key');
  return c.json(success(await new ImageService(c.env).delete(body.key)));
});
