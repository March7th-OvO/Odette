import { afterEach, describe, it, expect, vi } from 'vitest';
import { ImageRepository } from '../worker/repositories/image.repository';
import { FolderRepository } from '../worker/repositories/folder.repository';
import app from '../worker/index';
import { validateImage } from '../worker/services/image.service';
import { normalizeFolderName } from '../worker/services/folder.service';
import { createKey, validKey, validPrefix } from '../worker/utils/key';
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
  it('uses unique keys in the requested directory and rejects arbitrary deletion paths', () => {
    const a = createKey('png'); const b = createKey('png');
    expect(validKey(a)).toBe(true); expect(a).not.toBe(b);
    expect(a).toMatch(/^image\/[a-f0-9-]{36}\.png$/);
    expect(createKey('webp', 'image/PhotoWall/')).toMatch(/^image\/PhotoWall\/[a-f0-9-]{36}\.webp$/);
    expect(validPrefix('image/')).toBe(true);
    expect(validPrefix('image/PhotoWall/')).toBe(true);
    expect(validPrefix('image/PhotoWall')).toBe(false);
    expect(validKey('images/../../secret')).toBe(false);
  });
});

describe('hierarchical R2 listing', () => {
  it('groups the next key segment with delimiter', async () => {
    const list = vi.fn().mockResolvedValue({ objects: [], delimitedPrefixes: [], truncated: false });
    const repository = new ImageRepository({ list } as unknown as R2Bucket);
    await repository.list('image/PhotoWall/', 24, 'next');
    expect(list).toHaveBeenCalledExactlyOnceWith({
      prefix: 'image/PhotoWall/', delimiter: '/', limit: 24, cursor: 'next', include: ['httpMetadata', 'customMetadata'],
    });
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
  it('returns the current prefix, child folders and direct images', async () => {
    const list = vi.spyOn(ImageRepository.prototype, 'list').mockResolvedValue({
      objects: [{ key: 'image/home/背景 图.jpg', size: 100, uploaded: new Date('2026-09-08'), etag: 'test', httpEtag: '"test"', version: 'test', checksums: {}, storageClass: 'Standard' }],
      truncated: false, delimitedPrefixes: ['image/home/archive/'],
    });
    const response = await app.request('http://localhost/api/images?prefix=image/home/', {}, env);
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith('image/home/', 24, undefined);
    const { data } = await response.json();
    expect(data).toMatchObject({ prefix: 'image/home/', folders: ['image/home/archive/'], cursor: null });
    expect(data.items[0]).toMatchObject({
      key: 'image/home/背景 图.jpg', originalName: '背景 图.jpg',
      url: `https://img.odette.moe/image/home/${encodeURIComponent('背景 图.jpg')}`,
      thumbnailUrl: `https://img.odette.moe/cdn-cgi/image/width=400,fit=scale-down,format=auto,quality=75/image/home/${encodeURIComponent('背景 图.jpg')}`,
    });
    expect((await app.request('http://localhost/api/images?prefix=images/', {}, env)).status).toBe(400);
  });
  it('uploads into the selected directory', async () => {
    const put = vi.spyOn(ImageRepository.prototype, 'put').mockImplementation(async key => ({
      key, size: 67, uploaded: new Date('2026-09-08'), etag: 'test', httpEtag: '"test"', version: 'test', checksums: {}, storageClass: 'Standard',
      httpMetadata: { contentType: 'image/png' }, customMetadata: { originalName: 'new.png' },
    }));
    const body = new FormData();
    body.append('file', new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'new.png', { type: 'image/png' }));
    body.append('prefix', 'image/PhotoWall/');
    const response = await app.request('http://localhost/api/images', { method: 'POST', body }, env);
    expect(response.status).toBe(200);
    expect(put.mock.calls[0][0]).toMatch(/^image\/PhotoWall\/[a-f0-9-]{36}\.png$/);
    expect((await response.json()).data.key).toBe(put.mock.calls[0][0]);
  });
  it('rejects an unsafe upload directory before writing to R2', async () => {
    const put = vi.spyOn(ImageRepository.prototype, 'put').mockResolvedValue(null);
    const body = new FormData();
    body.append('file', new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'new.png', { type: 'image/png' }));
    body.append('prefix', 'image/../');
    const response = await app.request('http://localhost/api/images', { method: 'POST', body }, env);
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
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
      objects: [object('image/PhotoWall/', 0), object('image/PhotoWall/photo.jpg', 100), object('image/PhotoWall/empty.png', 0), object('image/PhotoWall/nonempty/', 100)],
      truncated: false, delimitedPrefixes: [],
    });
    const response = await app.request('http://localhost/api/images?prefix=image/PhotoWall/', {}, env);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.items.map((item: { key: string }) => item.key)).toEqual(['image/PhotoWall/photo.jpg', 'image/PhotoWall/empty.png', 'image/PhotoWall/nonempty/']);
    expect(data.cursor).toBeNull();
  });
  it('retains the cursor on a marker-only page so the next image remains reachable', async () => {
    const list = vi.spyOn(ImageRepository.prototype, 'list')
      .mockResolvedValueOnce({ objects: [object('image/', 0)], truncated: true, cursor: 'next-page', delimitedPrefixes: [] })
      .mockResolvedValueOnce({ objects: [object('image/photo.jpg', 100)], truncated: false, delimitedPrefixes: [] });
    const first = await app.request('http://localhost/api/images?limit=1', {}, env);
    expect((await first.json()).data).toEqual({ prefix: 'image/', folders: [], items: [], cursor: 'next-page' });
    const next = await app.request('http://localhost/api/images?limit=1&cursor=next-page', {}, env);
    expect(list).toHaveBeenLastCalledWith('image/', 1, 'next-page');
    const { data } = await next.json();
    expect(data.items[0].key).toBe('image/photo.jpg');
    expect(data.cursor).toBeNull();
  });
});

describe('folder creation', () => {
  afterEach(() => vi.restoreAllMocks());
  const env = { APP_ENV: 'development', PUBLIC_IMAGE_URL: 'https://img.odette.moe' } as Env;
  const marker = (key: string) => ({
    key, size: 0, uploaded: new Date('2026-09-08'), etag: 'test', httpEtag: '"test"',
    version: 'test', checksums: {}, storageClass: 'Standard' as const,
    customMetadata: { type: 'folder' },
  });

  it('normalizes safe names and rejects anything other than one path segment', () => {
    expect(normalizeFolderName(' 角色立绘 ')).toBe('角色立绘');
    expect(normalizeFolderName('background images')).toBe('background images');
    for (const name of ['', ' ', '.', '..', 'abc/def', 'abc\\def', 'line\nbreak']) {
      expect(() => normalizeFolderName(name)).toThrow('文件夹名称无效');
    }
  });

  it('creates an empty marker in the image root', async () => {
    const exists = vi.spyOn(FolderRepository.prototype, 'folderExists').mockResolvedValue(false);
    const create = vi.spyOn(FolderRepository.prototype, 'createFolder').mockResolvedValue(marker('image/2026/'));
    const response = await app.request('http://localhost/api/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPrefix: 'image/', name: ' 2026 ' }),
    }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 200, data: { name: '2026', prefix: 'image/2026/' } });
    expect(exists).toHaveBeenCalledExactlyOnceWith('image/2026/');
    expect(create).toHaveBeenCalledExactlyOnceWith('image/2026/');
  });

  it('requires a logical parent outside the image root', async () => {
    const exists = vi.spyOn(FolderRepository.prototype, 'folderExists').mockResolvedValue(false);
    const create = vi.spyOn(FolderRepository.prototype, 'createFolder').mockResolvedValue(null);
    const response = await app.request('http://localhost/api/folders', {
      method: 'POST', body: JSON.stringify({ parentPrefix: 'image/missing/', name: 'child' }),
    }, env);
    expect(response.status).toBe(404);
    expect(exists).toHaveBeenCalledExactlyOnceWith('image/missing/');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a folder when its marker or any child object already exists', async () => {
    const exists = vi.spyOn(FolderRepository.prototype, 'folderExists').mockResolvedValue(true);
    const create = vi.spyOn(FolderRepository.prototype, 'createFolder').mockResolvedValue(null);
    const response = await app.request('http://localhost/api/folders', {
      method: 'POST', body: JSON.stringify({ parentPrefix: 'image/', name: 'PhotoWall' }),
    }, env);
    expect(response.status).toBe(409);
    expect(exists).toHaveBeenCalledWith('image/PhotoWall/');
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a failed conditional write to a conflict', async () => {
    vi.spyOn(FolderRepository.prototype, 'folderExists').mockResolvedValue(false);
    vi.spyOn(FolderRepository.prototype, 'createFolder').mockResolvedValue(null);
    const response = await app.request('http://localhost/api/folders', {
      method: 'POST', body: JSON.stringify({ parentPrefix: 'image/', name: 'racing' }),
    }, env);
    expect(response.status).toBe(409);
  });

  it('validates the request before accessing R2', async () => {
    const exists = vi.spyOn(FolderRepository.prototype, 'folderExists').mockResolvedValue(false);
    for (const body of [
      '{',
      JSON.stringify({ name: '2026' }),
      JSON.stringify({ parentPrefix: 'private/', name: '2026' }),
      JSON.stringify({ parentPrefix: 'image/', name: '../2026' }),
    ]) {
      expect((await app.request('http://localhost/api/folders', { method: 'POST', body }, env)).status).toBe(400);
    }
    expect(exists).not.toHaveBeenCalled();
  });

  it('uses prefix lookup and a conditional zero-byte marker write', async () => {
    const list = vi.fn().mockResolvedValue({ objects: [{ key: 'image/foo/a.png' }] });
    const put = vi.fn().mockResolvedValue(marker('image/foo/'));
    const repository = new FolderRepository({ list, put } as unknown as R2Bucket);
    await expect(repository.folderExists('image/foo/')).resolves.toBe(true);
    await repository.createFolder('image/foo/');
    expect(list).toHaveBeenCalledWith({ prefix: 'image/foo/', limit: 1 });
    expect(put).toHaveBeenCalledWith('image/foo/', new Uint8Array(0), {
      onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { type: 'folder' },
    });
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
    for (const query of ['limit=0','limit=101','limit=1.5','limit=abc','prefix=private/','prefix=image/no-slash','prefix=image/../','prefix=image//nested/']) {
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
