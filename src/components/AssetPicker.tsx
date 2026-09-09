import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { listImages, uploadImage } from '../api/image';
import { repositoryAssetUrl } from '../api/post';
import { FolderGrid } from './FolderGrid';
import { UploadArea } from './UploadArea';
import type { ImageItem } from '../../shared/image';
import { relativeAssetPath, type ContentEntry } from '../../shared/post';

/** 封面与正文共享选择流程；R2 上传仍通过现有图片客户端完成。 */
export function AssetPicker({ entries, documentPath, initialSource = 'r2', onSelect, onClose }: {
  entries: ContentEntry[]; documentPath: string; initialSource?: 'r2' | 'repository';
  onSelect: (url: string, alt: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState(initialSource);
  const [prefix, setPrefix] = useState('image/');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<{ url: string; preview: string }>();
  const [alt, setAlt] = useState('');
  const [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (source !== 'r2') return;
    const controller = new AbortController();
    setBusy(true); setError(''); setImages([]); setFolders([]); setCursor(null);
    listImages(prefix, undefined, controller.signal).then(page => { setImages(page.items); setFolders(page.folders); setCursor(page.cursor); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [source, prefix, revision]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true); setError('');
    try { const page = await listImages(prefix, cursor); setImages(old => [...old, ...page.items]); setFolders(old => [...new Set([...old, ...page.folders])]); setCursor(page.cursor); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function upload(files: File[]) {
    setBusy(true); setError('');
    const failures: string[] = [];
    for (const file of files) {
      try { const image = await uploadImage(file, prefix); setSelection({ url: image.url, preview: image.thumbnailUrl }); setAlt(image.originalName.replace(/\.[^.]+$/, '')); }
      catch (e) { failures.push(`${file.name}: ${(e as Error).message}`); }
    }
    // 保留逐文件结果；刷新不会抹掉上传错误。
    try { const page = await listImages(prefix); setImages(page.items); setFolders(page.folders); setCursor(page.cursor); } catch (e) { failures.push((e as Error).message); }
    setError(failures.join('；'));
    setBusy(false);
  }
  const local = entries.filter(e => e.kind === 'asset' && /\.(png|jpe?g|avif|webp|gif)$/i.test(e.path) && e.path.toLowerCase().includes(filter.toLowerCase()));
  return <dialog ref={dialog} className="asset-picker" aria-labelledby="asset-picker-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}>
    <header className="picker-heading"><div><p className="eyebrow">MEDIA LIBRARY</p><h2 id="asset-picker-title">选择图片</h2></div><button aria-label="关闭资源选择器" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <div className="article-actions"><button disabled={busy} aria-pressed={source === 'r2'} onClick={() => { setSource('r2'); setSelection(undefined); }}>Odette Media</button><button disabled={busy} aria-pressed={source === 'repository'} onClick={() => { setSource('repository'); setSelection(undefined); }}>Repository Assets</button></div>
    {error && <p role="alert" className="article-error">{error}</p>}
    {source === 'r2' ? <>
      <div className="picker-path"><button disabled={busy || prefix === 'image/'} onClick={() => setPrefix(prefix.split('/').slice(0, -2).join('/') + '/')}><ArrowLeft size={14}/>上一级</button><code>{prefix}</code><button disabled={busy} onClick={() => setRevision(v => v + 1)}>刷新</button></div>
      <UploadArea busy={busy} prefix={prefix} onFiles={files => { void upload(files); }}/>
      <div inert={busy}><FolderGrid folders={folders} onOpen={setPrefix}/></div>
      <div className="picker-grid">{images.map(item => <button key={item.key} className={selection?.url === item.url ? 'is-selected' : ''} onClick={() => { setSelection({ url: item.url, preview: item.thumbnailUrl }); setAlt(item.originalName.replace(/\.[^.]+$/, '')); }}><img src={item.thumbnailUrl} loading="lazy" alt=""/><span>{item.originalName}</span></button>)}</div>
      {cursor && <button disabled={busy} onClick={() => void more()}>加载更多</button>}
      {!busy && !images.length && !folders.length && <p>当前目录没有图片，可以先上传。</p>}
    </> : <><label className="article-field">筛选仓库图片<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="输入目录或文件名"/></label><div className="picker-grid">{local.map(item => {
      const url = relativeAssetPath(documentPath, item.path);
      return <button key={item.path} className={selection?.url === url ? 'is-selected' : ''} onClick={() => { setSelection({ url, preview: repositoryAssetUrl(item.path) }); setAlt(item.path.split('/').pop()!.replace(/\.[^.]+$/, '')); }}><img src={repositoryAssetUrl(item.path)} loading="lazy" alt=""/><span>{item.path}</span></button>;
    })}</div>{!local.length && <p>没有匹配的仓库图片。</p>}</>}
    {busy && <p role="status">正在处理资源…</p>}
    <footer className="picker-footer"><label className="article-field">图片描述<input value={alt} onChange={e => setAlt(e.target.value)}/></label>{selection && <code>{selection.url}</code>}<button className="primary" disabled={!selection || busy} onClick={() => selection && onSelect(selection.url, alt)}><Check size={16}/>使用这张图片</button></footer>
  </dialog>;
}
