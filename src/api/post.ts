import type { ContentTree, PostDocument, PostWriteResult, SavePostRequest } from '../../shared/post';
export class PostApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new PostApiError('登录可能已过期，请重新登录后再试', response.status);
  const result = await response.json();
  if (!response.ok) throw new PostApiError(result.message || '文章请求失败', response.status);
  return result.data as T;
}
export const getPostTree = (signal?: AbortSignal) => request<ContentTree>('/api/posts/tree', { signal });
export const getPost = (path: string, signal?: AbortSignal) => request<PostDocument>(`/api/posts?${new URLSearchParams({ path })}`, { signal });
export const savePost = (body: SavePostRequest, create: boolean) => request<PostWriteResult>('/api/posts', { method: create ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const deletePost = (path: string, sha: string) => request<{ commitSha: string; commitUrl: string }>('/api/posts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, sha }) });
export const repositoryAssetUrl = (path: string) => `/api/posts/asset?${new URLSearchParams({ path })}`;
