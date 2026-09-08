import { Hono } from 'hono';
import type { AppEnv } from './types/env';
import { auth } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import { imageRoutes } from './routes/image.route';
import { success } from './utils/response';

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  // Same-origin mutations complement Access authentication against cross-site form submissions.
  const origin = c.req.header('Origin');
  const requestUrl = new URL(c.req.url);
  // Wrangler normalizes the proxy target's Host; allow the two explicit local Vite origins only in development.
  const localOrigin = c.env.APP_ENV === 'development' && ['127.0.0.1', 'localhost'].includes(requestUrl.hostname)
    && ['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin || '');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && origin && origin !== requestUrl.origin && !localOrigin) {
    return c.json({ code: 403, data: null, message: '不允许跨域操作' }, 403);
  }
  await next();
});
app.get('/api/health', c => c.json(success({ status: 'ok' })));
app.use('/api/*', auth);
app.route('/api/images', imageRoutes);
// Only the local emulator serves image bytes. Production delivery belongs to R2's custom domain.
app.get('/api/local-images/*', async c => {
  if (c.env.APP_ENV !== 'development') return c.notFound();
  const object = await c.env.IMAGE_BUCKET.get(c.req.path.slice('/api/local-images/'.length));
  if (!object) return c.notFound();
  c.header('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  return c.body(object.body);
});
app.all('/api/*', c => c.json({ code: 404, data: null, message: '接口不存在' }, 404));
app.get('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
