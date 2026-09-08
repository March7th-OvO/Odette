import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types/env';
export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof HTTPException) return c.json({ code: error.status, data: null, message: error.message }, error.status);
  console.error(JSON.stringify({ event: 'request_failed', path: c.req.path, message: error.message }));
  return c.json({ code: 500, data: null, message: '服务暂时不可用，请稍后重试' }, 500);
};
