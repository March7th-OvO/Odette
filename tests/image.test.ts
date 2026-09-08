import { describe, it, expect } from 'vitest';
import app from '../worker/index';
import { validateImage } from '../worker/services/image.service';
import { createKey, validKey } from '../worker/utils/key';
import { MAX_FILE_SIZE } from '../shared/image';

describe('image upload validation', () => {
  it('accepts PNG and rejects a disguised SVG', async () => {
    await expect(validateImage(new File([new Uint8Array([137,80,78,71,13,10,26,10])], '图片.png', {type:'image/png'}))).resolves.toBeUndefined();
    await expect(validateImage(new File(['<svg/>'], 'fake.png', {type:'image/png'}))).rejects.toThrow('图片内容与文件类型不匹配');
    await expect(validateImage(new File(['<svg/>'], 'x.svg', {type:'image/svg+xml'}))).rejects.toThrow('仅支持');
  });
  it('rejects empty and oversized files', async () => {
    await expect(validateImage(new File([], 'empty.jpg', {type:'image/jpeg'}))).rejects.toThrow('不能为空');
    await expect(validateImage(new File([new Uint8Array(MAX_FILE_SIZE + 1)], 'large.jpg', {type:'image/jpeg'}))).rejects.toThrow('10 MB');
  });
  it('uses unique nested keys and rejects arbitrary deletion paths', () => {
    const a = createKey('png'); const b = createKey('png');
    expect(validKey(a)).toBe(true); expect(a).not.toBe(b);
    expect(validKey('images/../../secret')).toBe(false);
  });
});

describe('API boundary', () => {
  const env = { APP_ENV: 'development' } as Env;
  it('keeps health available but fails closed when Access is unconfigured', async () => {
    expect((await app.request('https://admin.example.com/api/health', {}, env)).status).toBe(200);
    expect((await app.request('https://admin.example.com/api/images', {}, {APP_ENV:'production'} as Env)).status).toBe(503);
  });
  it('rejects missing and forged Access credentials', async () => {
    const production = {APP_ENV:'production', ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com', ACCESS_AUD:'test'} as unknown as Env;
    expect((await app.request('https://admin.example.com/api/images', {}, production)).status).toBe(401);
    expect((await app.request('https://admin.example.com/api/images', {headers:{'Cf-Access-Jwt-Assertion':'forged'}}, production)).status).toBe(401);
  });
  it('denies cross-origin mutations', async () => {
    expect((await app.request('http://localhost/api/images', {method:'POST', headers:{Origin:'https://other.example'}}, env)).status).toBe(403);
  });
  it('allows the fixed local Vite origin but never adds that exception in production', async () => {
    const options = {method:'DELETE', headers:{Origin:'http://127.0.0.1:5173'}, body:'{'};
    expect((await app.request('http://127.0.0.1:8787/api/images',options,env)).status).toBe(400);
    expect((await app.request('https://admin.example.com/api/images',options,{APP_ENV:'production'} as Env)).status).toBe(403);
  });
  it('validates list arguments and JSON before touching storage', async () => {
    for (const query of ['limit=0','limit=101','limit=1.5','limit=abc','prefix=private/']) {
      expect((await app.request(`http://localhost/api/images?${query}`, {}, env)).status).toBe(400);
    }
    expect((await app.request('http://localhost/api/images', {method:'DELETE',body:'{'}, env)).status).toBe(400);
    expect((await app.request('http://localhost/api/images', {method:'DELETE',body:JSON.stringify({key:'other/key'})}, env)).status).toBe(400);
  });
  it('returns JSON for unknown API paths', async () => {
    const result = await app.request('http://localhost/api/missing', {}, env);
    expect(result.status).toBe(404); expect(result.headers.get('content-type')).toContain('application/json');
  });
});
