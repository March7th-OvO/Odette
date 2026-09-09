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

/** 将原文件名转换为适合长期公开 URL 的可读名称，同时保留各语言的字母和数字。 */
export function normalizeFileName(fileName: string, ext: string) {
  const leafName = fileName.split(/[\\/]/).pop() || '';
  const extensionIndex = leafName.lastIndexOf('.');
  const rawStem = extensionIndex > 0 ? leafName.slice(0, extensionIndex) : leafName;
  const stem = rawStem.normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  return `${stem}.${ext}`;
}

function truncateUtf8(value: string, maxBytes: number) {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = new TextEncoder().encode(character).length;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result.replace(/-+$/g, '');
}

/** 根据目录的剩余 Key 空间裁剪文件名，避免多字节字符导致 R2 Key 超限。 */
export function createKey(fileName: string, ext: string, prefix = IMAGE_PREFIX, suffix = '') {
  const normalized = normalizeFileName(fileName, ext);
  const stem = normalized.slice(0, -(ext.length + 1));
  const fixedBytes = new TextEncoder().encode(`${prefix}${suffix}.${ext}`).length;
  const safeStem = truncateUtf8(stem, 1024 - fixedBytes) || 'image';
  return `${prefix}${safeStem}${suffix}.${ext}`;
}
