import type { ApiResponse, ImageItem, ImagePage } from '../../shared/image';
import type { FolderItem } from '../../shared/folder';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('登录状态可能已过期，请刷新页面后重试');
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok) throw new Error(result.message || '请求失败，请重试');
  return result.data;
}
export const listImages = (prefix: string, cursor?: string, signal?: AbortSignal) => request<ImagePage>(`/api/images?${new URLSearchParams({ prefix, limit: '24', ...(cursor ? { cursor } : {}) })}`, { signal });
export function uploadImage(file: File, prefix: string) {
  const body = new FormData(); body.append('file', file); body.append('prefix', prefix);
  return request<ImageItem>('/api/images', { method: 'POST', body });
}
export const deleteImage = (key: string) => request<{ key: string }>('/api/images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
export const createFolder = (parentPrefix: string, name: string) => request<FolderItem>('/api/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ parentPrefix, name }),
});
