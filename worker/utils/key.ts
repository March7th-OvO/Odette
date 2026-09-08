import { IMAGE_PREFIX } from '../../shared/image';

const validSegments = (path: string) => path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');

/** 目录前缀必须位于 image/ 命名空间内，并以分隔符结尾。 */
export function validPrefix(prefix: string) {
  return prefix.startsWith(IMAGE_PREFIX)
    && prefix.endsWith('/')
    && new TextEncoder().encode(prefix).length <= 1024
    && !/[\\\u0000-\u001f\u007f]/.test(prefix)
    && validSegments(prefix.slice(0, -1));
}

export function validKey(key: string) {
  // 旧图片可以使用任意文件名和子目录；仅限制命名空间与不安全路径。
  // R2 Key 按原值处理，不做 URL 解码，避免删除另一个同名编码对象。
  return key.startsWith(IMAGE_PREFIX)
    && new TextEncoder().encode(key).length <= 1024
    && !/[\\\u0000-\u001f\u007f]/.test(key)
    && validSegments(key);
}
export function createKey(ext: string, prefix = IMAGE_PREFIX) {
  return `${prefix}${crypto.randomUUID()}.${ext}`;
}
