import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types/env';

export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const hostname = new URL(c.req.url).hostname;
  if (c.env.APP_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return next();
  if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) throw new HTTPException(503, { message: '请先配置 Cloudflare Access' });
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) throw new HTTPException(401, { message: '请通过 Cloudflare Access 登录后重试' });
  try {
    // Validate the Access-issued assertion; this application never issues login tokens.
    const issuer = `https://${c.env.ACCESS_TEAM_DOMAIN}`;
    await jwtVerify(token, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)), {
      issuer, audience: c.env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'sub'],
    });
  } catch { throw new HTTPException(401, { message: '登录已过期或无权访问，请重新登录' }); }
  await next();
});
