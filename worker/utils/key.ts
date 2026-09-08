import { IMAGE_PREFIX } from '../../shared/image';

export function validKey(key: string) {
  // 旧图片可以使用任意文件名和子目录；仅限制命名空间与不安全路径。
  // R2 Key 按原值处理，不做 URL 解码，避免删除另一个同名编码对象。
  return key.startsWith(IMAGE_PREFIX)
    && new TextEncoder().encode(key).length <= 1024
    && !/[\\\u0000-\u001f\u007f]/.test(key)
    && key.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}
export function createKey(ext: string) {
  const now = new Date();
  // UTC keeps object paths consistent across clients and Worker locations.
  return `${IMAGE_PREFIX}${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
}
