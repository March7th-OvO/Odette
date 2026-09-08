// 前后端共用同一对象命名空间，兼容桶中已有的 image/ 资源。
export const IMAGE_PREFIX = 'image/';
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' } as const;
export interface ImageItem { key: string; url: string; thumbnailUrl: string; originalName: string; size: number; contentType: string; uploaded: string }
export interface ImagePage { prefix: string; folders: string[]; items: ImageItem[]; cursor: string | null }
export type ApiResponse<T> = { code: number; data: T; message?: string };
