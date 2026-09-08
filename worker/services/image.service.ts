import { HTTPException } from 'hono/http-exception';
import { IMAGE_PREFIX, IMAGE_TYPES, MAX_FILE_SIZE, type ImageItem } from '../../shared/image';
import { ImageRepository } from '../repositories/image.repository';
import { createKey, validKey } from '../utils/key';
import { badRequest } from '../utils/response';

export async function validateImage(file: File) {
  if (!(file.type in IMAGE_TYPES)) badRequest('仅支持 JPEG、PNG、WebP、AVIF 和 GIF');
  if (!file.size || file.size > MAX_FILE_SIZE) badRequest('文件不能为空且不能超过 10 MB');
  if (new TextEncoder().encode(file.name).length > 512) badRequest('文件名过长');
  // Check the signature as well as the client-provided MIME to reject obvious disguises.
  const bytes = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  const matches = {
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value),
    'image/gif': ['GIF87a', 'GIF89a'].includes(ascii(0,6)),
    'image/webp': ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP',
    'image/avif': ascii(4,8) === 'ftyp' && Array.from({length: Math.floor((bytes.length - 8) / 4)}, (_, i) => ascii(8 + i * 4, 12 + i * 4)).some(brand => brand === 'avif' || brand === 'avis'),
  };
  if (!matches[file.type as keyof typeof matches]) badRequest('图片内容与文件类型不匹配');
}

export class ImageService {
  private repository: ImageRepository;
  constructor(private env: Env) { this.repository = new ImageRepository(env.IMAGE_BUCKET); }
  private serialize(object: R2Object): ImageItem {
    const baseUrl = this.env.PUBLIC_IMAGE_URL.replace(/\/$/, '');
    const imagePath = object.key.split('/').map(encodeURIComponent).join('/');
    const url = `${baseUrl}/${imagePath}`;
    // Cloudflare 在边缘按需生成并缓存缩略图，R2 中仍只保存一份原图。
    const thumbnailUrl = `${baseUrl}/cdn-cgi/image/width=400,fit=scale-down,format=auto,quality=75/${imagePath}`;
    return { key: object.key, url, thumbnailUrl,
      originalName: object.customMetadata?.originalName || object.key.split('/').pop()!,
      size: object.size, contentType: object.httpMetadata?.contentType || 'application/octet-stream', uploaded: object.uploaded.toISOString() };
  }
  async list(prefix: string, limit: number, cursor?: string) {
    if (!prefix.startsWith(IMAGE_PREFIX) || new TextEncoder().encode(prefix).length > 1024) badRequest(`Prefix 必须以 ${IMAGE_PREFIX} 开头且不超过 1024 字节`);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) badRequest('limit 必须为 1–100 的整数');
    if (cursor && cursor.length > 4096) badRequest('分页游标无效');
    const result = await this.repository.list(prefix, limit, cursor);
    // 目录占位对象不作为图片展示；保留 R2 原始游标，即使本页全是占位对象也能继续翻页。
    const images = result.objects.filter(item => !(item.size === 0 && item.key.endsWith('/')));
    return { items: images.map(item => this.serialize(item)), cursor: result.truncated ? result.cursor : null };
  }
  async upload(file: File) {
    await validateImage(file);
    const key = createKey(IMAGE_TYPES[file.type as keyof typeof IMAGE_TYPES]);
    const object = await this.repository.put(key, file);
    if (!object) throw new HTTPException(409, { message: '图片命名冲突，请重试' });
    return this.serialize(object);
  }
  async delete(key: string) {
    if (!validKey(key)) badRequest('图片 Key 无效');
    await this.repository.delete(key);
    return { key };
  }
}
