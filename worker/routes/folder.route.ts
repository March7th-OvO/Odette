import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { CreateFolderRequest } from '../../shared/folder';
import { FolderService } from '../services/folder.service';
import type { AppEnv } from '../types/env';
import { badRequest, success } from '../utils/response';

export const folderRoutes = new Hono<AppEnv>();

folderRoutes.post('/', bodyLimit({ maxSize: 4096 }), async c => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('请求体必须为 JSON');
  }

  if (!body || typeof body !== 'object') return badRequest('请提供父目录和文件夹名称');
  const { parentPrefix, name } = body as Partial<CreateFolderRequest>;
  if (typeof parentPrefix !== 'string') return badRequest('parentPrefix 必须是目录路径');

  return c.json(success(await new FolderService(c.env).create(parentPrefix, name)));
});

