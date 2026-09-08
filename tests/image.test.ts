import { afterEach, describe, it, expect, vi } from 'vitest';
import { ImageRepository } from '../worker/repositories/image.repository';
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
    expect(a).toMatch(/^image\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.png$/);
    expect(validKey('images/../../secret')).toBe(false);
  });
});

describe('legacy image namespace', () => {
  afterEach(() => vi.restoreAllMocks());
  const env = { APP_ENV: 'development', PUBLIC_IMAGE_URL: 'https://img.odette.moe' } as Env;
  it.each(['image/banner.webp', 'image/march7th/avatar.png', 'image/home/背景 图.jpg'])('deletes the exact legacy key %s', async key => {
    const remove = vi.spyOn(ImageRepository.prototype, 'delete').mockResolvedValue();
    const response = await app.request('http://localhost/api/images', {
      method: 'DELETE', body: JSON.stringify({ key }), headers: { 'Content-Type': 'application/json' },
    }, env);
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledExactlyOnceWith(key);
  });
  it.each(['image/', '/image/a.png', 'images/a.png', 'video/a.png', 'image/../secret', 'image/./a.png', 'image//a.png', 'image/a\\b.png', 'image/a\u0000.png', `image/${'中'.repeat(340)}.png`])('rejects unsafe or out-of-scope key %s', async key => {
    const remove = vi.spyOn(ImageRepository.prototype, 'delete').mockResolvedValue();
    const response = await app.request('http://localhost/api/images', { method: 'DELETE', body: JSON.stringify({ key }) }, env);
    expect(response.status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
  });
  it('lists legacy objects by default and keeps their original paths in public URLs', async () => {
    const list = vi.spyOn(ImageRepository.prototype, 'list').mockResolvedValue({
      objects: [{ key: 'image/home/背景 图.jpg', size: 100, uploaded: new Date('2026-09-08'), etag: 'test', httpEtag: '"test"', version: 'test', checksums: {}, storageClass: 'Standard' }],
      truncated: false, delimitedPrefixes: [],
    });
    const response = await app.request('http://localhost/api/images', {}, env);
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith('image/', 24, undefined);
    expect((await response.json()).data.items[0]).toMatchObject({
      key: 'image/home/背景 图.jpg', originalName: '背景 图.jpg',
      url: `https://img.odette.moe/image/home/${encodeURIComponent('背景 图.jpg')}`,
      thumbnailUrl: `https://img.odette.moe/cdn-cgi/image/width=400,fit=scale-down,format=auto,quality=75/image/home/${encodeURIComponent('背景 图.jpg')}`,
    });
    await app.request('http://localhost/api/images?prefix=image/home/', {}, env);
    expect(list).toHaveBeenLastCalledWith('image/home/', 24, undefined);
    expect((await app.request('http://localhost/api/images?prefix=images/', {}, env)).status).toBe(400);
  });
});

describe('folder markers', () => {
  afterEach(() => vi.restoreAllMocks());
  const env = { APP_ENV: 'development', PUBLIC_IMAGE_URL: 'https://img.odette.moe' } as Env;
  const object = (key: string, size: number) => ({
    key, size, uploaded: new Date('2026-09-08'), etag: 'test', httpEtag: '"test"',
    version: 'test', checksums: {}, storageClass: 'Standard' as const,
  });
  it('hides only zero-byte objects whose keys end with a slash', async () => {
    vi.spyOn(ImageRepository.prototype, 'list').mockResolvedValue({
      objects: [object('image/', 0), object('image/PhotoWall/', 0), object('image/PhotoWall/photo.jpg', 100), object('image/empty.png', 0), object('image/nonempty/', 100)],
      truncated: false, delimitedPrefixes: [],
    });
    const response = await app.request('http://localhost/api/images', {}, env);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.items.map((item: { key: string }) => item.key)).toEqual(['image/PhotoWall/photo.jpg', 'image/empty.png', 'image/nonempty/']);
    expect(data.cursor).toBeNull();
  });
  it('retains the cursor on a marker-only page so the next image remains reachable', async () => {
    const list = vi.spyOn(ImageRepository.prototype, 'list')
      .mockResolvedValueOnce({ objects: [object('image/PhotoWall/', 0)], truncated: true, cursor: 'next-page', delimitedPrefixes: [] })
      .mockResolvedValueOnce({ objects: [object('image/PhotoWall/photo.jpg', 100)], truncated: false, delimitedPrefixes: [] });
    const first = await app.request('http://localhost/api/images?limit=1', {}, env);
    expect((await first.json()).data).toEqual({ items: [], cursor: 'next-page' });
    const next = await app.request('http://localhost/api/images?limit=1&cursor=next-page', {}, env);
    expect(list).toHaveBeenLastCalledWith('image/', 1, 'next-page');
    const { data } = await next.json();
    expect(data.items[0].key).toBe('image/PhotoWall/photo.jpg');
    expect(data.cursor).toBeNull();
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
