import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, CheckCircle2, ChevronRight, Image, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { IMAGE_TYPES, MAX_FILE_SIZE, type ImageItem } from '../../shared/image';
import { deleteImage, listImages, uploadImage } from '../api/image';
import { UploadArea } from '../components/UploadArea';
import { ImageGrid } from '../components/ImageGrid';
import { CopyButton } from '../components/CopyButton';
import { formatSize } from '../components/ImageCard';

export function Dashboard() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [prefix, setPrefix] = useState('images/');
  const [filter, setFilter] = useState('images/');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState<ImageItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [uploadResults, setUploadResults] = useState<string[]>([]);
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const message = (e: unknown) => e instanceof Error ? e.message : '操作失败，请重试';

  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    setLoading(true); setError(''); setImages([]); setCursor(null);
    listImages(filter, undefined, controller.signal).then(page => { setImages(page.items); setCursor(page.cursor); }).catch(e => { if (!controller.signal.aborted) setError(message(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, revision]);
  useEffect(() => { if (preview || deleting) dialog.current?.showModal(); else dialog.current?.close(); }, [preview, deleting]);

  async function loadMore() {
    if (!cursor || loading) return;
    const current = generation.current;
    setLoading(true); setError('');
    try { const page = await listImages(filter, cursor); if (current !== generation.current) return;
      setImages(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.key === item.key))]); setCursor(page.cursor);
    } catch (e) { if (current === generation.current) setError(message(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function upload(files: File[]) {
    if (!files.length || uploading) return;
    setUploading(true); setNotice(''); setUploadResults([]);
    let count = 0;
    // Serial uploads bound memory and preserve a clear result for every selected file.
    for (const file of files) {
      try {
        if (!(file.type in IMAGE_TYPES) || !file.size || file.size > MAX_FILE_SIZE) throw new Error('仅支持不超过 10 MB 的 JPG、PNG、WebP、AVIF、GIF');
        await uploadImage(file); count++;
        setUploadResults(previous => [...previous, `✓ ${file.name} · 上传成功`]);
      } catch (e) { setUploadResults(previous => [...previous, `✕ ${file.name} · ${message(e)}`]); }
    }
    setNotice(`上传完成：${count} / ${files.length} 张成功`); setUploading(false);
    if (count) setRevision(value => value + 1);
  }
  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await deleteImage(deleting.key); setNotice(`已删除 ${deleting.originalName}`); setDeleting(null); setRevision(value => value + 1); }
    catch (e) { setError(message(e)); setDeleting(null); }
    finally { setDeleteBusy(false); }
  }
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Odette 首页"><span className="brand-mark">o</span>odette<span className="brand-label">私人图床</span></a><div className="private-badge"><span/> 个人图片空间</div></header>
    <main><div className="breadcrumb">工作空间<ChevronRight size={13}/><span>图片库</span></div>
      <div className="page-heading"><div><p className="eyebrow">YOUR PERSONAL IMAGE LIBRARY</p><h1>图片库<span>.</span></h1><p>收藏灵感，分享画面。你的图片，随时可用。</p></div><span className="heading-aside">Less clutter.<br/><em>More clarity.</em></span></div>
      <UploadArea busy={uploading} onFiles={files => { void upload(files); }}/>
      {notice && <div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><X size={15}/></button></div>}
      {uploadResults.length > 0 && <details className="upload-results"><summary>{uploading ? '上传进行中' : '查看上传结果'} · {uploadResults.length} 个文件</summary><ul>{uploadResults.map((result, index) => <li key={index}>{result}</li>)}</ul></details>}
      <section className="library"><div className="library-toolbar"><h2>所有图片 <span>{images.length}{cursor ? '+' : ''}</span></h2><form className="search" onSubmit={event => { event.preventDefault(); setFilter(prefix.trim() || 'images/'); setRevision(value => value + 1); }}><Search size={16}/><input aria-label="按对象路径前缀筛选" value={prefix} onChange={event => setPrefix(event.target.value)} placeholder="按路径前缀筛选"/><button type="submit">筛选</button></form><button className="refresh-button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''}/>刷新</button></div>
        <div className="library-caption"><span>按对象路径排列 · 已加载 {images.length} 张</span><span>原图保存，无损分享 <ArrowUpRight size={12}/></span></div>
        {error && <div className="error" role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>重试</button></div>}
        {!images.length && loading ? <div className="empty"><Loader2 className="spin"/><h3>正在打开图片库…</h3></div> : !images.length && !error ? <div className="empty"><div className="empty-icon"><Image size={32} strokeWidth={1}/></div><p className="eyebrow">ROOM FOR SOMETHING BEAUTIFUL</p><h3>{filter === 'images/' ? '第一张图片，从这里开始' : '这个路径下还没有图片'}</h3><p>{filter === 'images/' ? '上传一张喜欢的图片，即可获得随处使用的链接。' : '试试其他路径前缀，或清空筛选查看所有图片。'}</p></div> : <ImageGrid images={images} onPreview={setPreview} onDelete={setDeleting}/>}
        {cursor && <div className="pagination"><button disabled={loading} onClick={() => { void loadMore(); }}>{loading ? <Loader2 className="spin" size={16}/> : <ArrowDown size={16}/>}加载更多</button></div>}
      </section>
      <footer><span><span className="footer-dot"/> ODETTE · 留住每一帧灵感</span><span>你的图片，你的空间。</span></footer>
    </main>
    <dialog ref={dialog} onCancel={() => { setPreview(null); setDeleting(null); }} onClick={event => { if (event.target === event.currentTarget && !deleteBusy) { setPreview(null); setDeleting(null); } }}>
      <button className="dialog-close icon-button" disabled={deleteBusy} aria-label="关闭弹窗" onClick={() => { setPreview(null); setDeleting(null); }}><X size={21}/></button>
      {preview && <div className="preview"><img src={preview.url} alt={preview.originalName}/><h3>{preview.originalName}</h3><p>{formatSize(preview.size)} · {preview.contentType}</p><input aria-label="图片公开链接" value={preview.url} readOnly onFocus={event => event.target.select()}/><div className="preview-actions"><CopyButton value={preview.url}/><CopyButton value={`![](${preview.url})`} markdown/></div></div>}
      {deleting && <div className="confirm"><p className="eyebrow">DELETE IMAGE</p><h2>删除这张图片？</h2><p className="delete-name">{deleting.originalName}</p><p>删除后无法恢复，使用该图片的链接将失效。已缓存的副本可能暂时仍可访问。</p><div className="confirm-actions"><button disabled={deleteBusy} onClick={() => setDeleting(null)}>保留图片</button><button className="danger" disabled={deleteBusy} onClick={() => { void remove(); }}>{deleteBusy ? '正在删除…' : '确认删除'}</button></div></div>}
    </dialog>
  </div>;
}
