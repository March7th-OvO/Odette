import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, CheckCircle2, ChevronRight, Folder, FolderPlus, Image, Images, Loader2, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import { IMAGE_PREFIX, IMAGE_TYPES, MAX_FILE_SIZE, type ImageItem } from '../../shared/image';
import { createFolder, deleteImage, listImages, uploadImage } from '../api/image';
import { UploadArea } from '../components/UploadArea';
import { ImageGrid } from '../components/ImageGrid';
import { CopyButton } from '../components/CopyButton';
import { formatSize } from '../components/ImageCard';
import { Sidebar } from '../components/Sidebar';
import { ImageGridSkeleton } from '../components/ImageGridSkeleton';
import { FolderGrid } from '../components/FolderGrid';

const parentPrefix = (prefix: string) => {
  if (prefix === IMAGE_PREFIX) return IMAGE_PREFIX;
  const parts = prefix.slice(0, -1).split('/');
  parts.pop();
  return `${parts.join('/')}/`;
};

const breadcrumbs = (prefix: string) => {
  const parts = prefix.slice(0, -1).split('/');
  return parts.map((label, index) => ({ label, prefix: `${parts.slice(0, index + 1).join('/')}/` }));
};

export function Dashboard() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState(IMAGE_PREFIX);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState<ImageItem[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const selectedImages = images.filter(image => selectedKeys.has(image.key));
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [uploadResults, setUploadResults] = useState<string[]>([]);
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const message = (e: unknown) => e instanceof Error ? e.message : '操作失败，请重试';

  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    setLoading(true); setError(''); setImages([]); setFolders([]); setCursor(null);
    // A refreshed or different directory starts a new selection; pagination preserves it.
    setSelectedKeys(new Set());
    listImages(currentPrefix, undefined, controller.signal).then(page => { setImages(page.items); setFolders(page.folders); setCursor(page.cursor); }).catch(e => { if (!controller.signal.aborted) setError(message(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentPrefix, revision]);
  useEffect(() => {
    if (preview || deleting || creatingFolder) {
      dialog.current?.showModal();
      if (creatingFolder) requestAnimationFrame(() => folderInput.current?.focus());
    } else dialog.current?.close();
  }, [preview, deleting, creatingFolder]);

  function closeDialog() {
    if (deleteBusy || folderBusy) return;
    setPreview(null); setDeleting(null); setCreatingFolder(false); setFolderError('');
  }

  function openCreateFolder() {
    setFolderName(''); setFolderError(''); setCreatingFolder(true);
  }

  async function submitFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folderBusy) return;
    setFolderBusy(true); setFolderError(''); setNotice('');
    try {
      const folder = await createFolder(currentPrefix, folderName);
      setNotice(`已创建文件夹 ${folder.name}`);
      setCreatingFolder(false); setFolderName('');
      setRevision(value => value + 1);
    } catch (e) {
      setFolderError(message(e));
    } finally {
      setFolderBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    const current = generation.current;
    setLoading(true); setError('');
    try { const page = await listImages(currentPrefix, cursor); if (current !== generation.current) return;
      setFolders(previous => [...previous, ...page.folders.filter(folder => !previous.includes(folder))]);
      setImages(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.key === item.key))]); setCursor(page.cursor);
    } catch (e) { if (current === generation.current) setError(message(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function upload(files: File[]) {
    if (!files.length || uploading) return;
    const uploadPrefix = currentPrefix;
    setUploading(true); setNotice(''); setUploadResults([]);
    let count = 0;
    // Serial uploads bound memory and preserve a clear result for every selected file.
    for (const file of files) {
      try {
        if (!(file.type in IMAGE_TYPES) || !file.size || file.size > MAX_FILE_SIZE) throw new Error('仅支持不超过 10 MB 的 JPG、PNG、WebP、AVIF、GIF');
        await uploadImage(file, uploadPrefix); count++;
        setUploadResults(previous => [...previous, `✓ ${file.name} · 上传成功`]);
      } catch (e) { setUploadResults(previous => [...previous, `✕ ${file.name} · ${message(e)}`]); }
    }
    setNotice(`上传完成：${count} / ${files.length} 张成功 · ${uploadPrefix}`); setUploading(false);
    if (count) setRevision(value => value + 1);
  }
  async function remove() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true); setError(''); setNotice('');
    const removed = new Set<string>();
    const failures: string[] = [];
    // Bound requests and retain failed selections instead of clearing the entire batch.
    for (const image of deleting) {
      try { await deleteImage(image.key); removed.add(image.key); }
      catch (e) { failures.push(`${image.originalName}：${message(e)}`); }
    }
    setImages(previous => previous.filter(image => !removed.has(image.key)));
    setSelectedKeys(previous => new Set([...previous].filter(key => !removed.has(key))));
    if (removed.size) setNotice(`已删除 ${removed.size} 张图片`);
    if (failures.length) setError(`${failures.length} 张图片删除失败：${failures.join('；')}`);
    setDeleting(null); setDeleteBusy(false);
  }
  function toggleSelection(key: string) {
    setSelectedKeys(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳转到主要内容</a>
    <Sidebar/>
    <div className="workspace">
    <header className="topbar"><div className="workspace-label"><Images size={17}/><span>工作空间</span><ChevronRight size={13}/><strong>图片库</strong></div><div className="private-badge"><ShieldCheck size={15}/> 个人图片空间</div></header>
    <main id="main-content">
      <div className="page-heading"><div><p className="eyebrow">MEDIA LIBRARY</p><h1>图片库</h1><p>管理、浏览和分享你的图片资源。</p></div><span className="heading-aside"><span>清晰保存，自由分享</span></span></div>
      <UploadArea busy={uploading} prefix={currentPrefix} onFiles={files => { void upload(files); }}/>
      {notice && <div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><X size={15}/></button></div>}
      {uploadResults.length > 0 && <details className="upload-results"><summary>{uploading ? '上传进行中' : '查看上传结果'} · {uploadResults.length} 个文件</summary><ul>{uploadResults.map((result, index) => <li key={index}>{result}</li>)}</ul></details>}
      <section className="library" id="library" aria-labelledby="library-title">
        <div className="library-header"><h2 id="library-title"><Images size={18}/>当前目录 <span className="count-badge">{folders.length + images.length}{cursor ? '+' : ''}</span></h2><span className="view-label">层级视图</span></div>
        <div className="library-toolbar">
          <nav className="breadcrumb" aria-label="当前目录">
            <Folder size={16}/>
            {breadcrumbs(currentPrefix).map((crumb, index, all) => <span className="breadcrumb-part" key={crumb.prefix}>
              {index > 0 && <ChevronRight size={13}/>} {index === all.length - 1 ? <strong>{crumb.label}</strong> : <button className="breadcrumb-button" onClick={() => setCurrentPrefix(crumb.prefix)}>{crumb.label}</button>}
            </span>)}
            <span aria-hidden="true">/</span>
          </nav>
          <div className="directory-actions">
            <button disabled={currentPrefix === IMAGE_PREFIX || loading} onClick={() => setCurrentPrefix(parentPrefix(currentPrefix))}><ArrowLeft size={15}/>返回</button>
            <button disabled={loading} onClick={openCreateFolder}><FolderPlus size={15}/>新建文件夹</button>
            <button className="refresh-button" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''}/>刷新</button>
            <a className="primary upload-shortcut" href="#upload"><Upload size={15}/>上传图片</a>
          </div>
        </div>
        <div className="library-body"><div className="library-caption"><span title={currentPrefix}>{currentPrefix}</span><span>已加载 {folders.length} 个文件夹 · {images.length} 张图片</span></div>
        {error && <div className="error" role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>重试</button></div>}
        {!images.length && !folders.length && loading ? <ImageGridSkeleton/> : !images.length && !folders.length && !error ? <div className="empty"><div className="empty-icon"><Image size={30} strokeWidth={1.5}/></div><h3>当前目录还没有图片</h3><p>上传的图片会直接保存到 {currentPrefix}</p><a className="empty-upload" href="#upload"><Upload size={15}/>上传到当前目录</a></div> : <>
          <FolderGrid folders={folders} onOpen={setCurrentPrefix}/>
          {images.length > 0 && <section className="image-section" aria-labelledby="image-section-title"><h3 id="image-section-title">图片</h3>
            <div className="batch-toolbar" aria-label="图片批量操作">
              <span role="status">已选择 {selectedImages.length} 张</span>
              <button onClick={() => setSelectedKeys(new Set(images.map(image => image.key)))} disabled={selectedImages.length === images.length}>全选已加载图片</button>
              <button onClick={() => setSelectedKeys(new Set())} disabled={!selectedImages.length}>取消选择</button>
              {/* Preserve grid order and place each original URL or Markdown image on its own line. */}
              <CopyButton value={selectedImages.map(image => image.url).join('\n')} disabled={!selectedImages.length} label="复制 URL"/>
              <CopyButton value={selectedImages.map(image => `![](${image.url})`).join('\n')} markdown disabled={!selectedImages.length} label="复制 Markdown"/>
              <button className="danger" disabled={!selectedImages.length} onClick={() => setDeleting(selectedImages)}>批量删除</button>
            </div>
            <ImageGrid images={images} onPreview={setPreview} onDelete={image => setDeleting([image])} selectedKeys={selectedKeys} onToggle={toggleSelection}/>
          </section>}
        </>}
        {cursor && <div className="pagination"><button disabled={loading} onClick={() => { void loadMore(); }}>{loading ? <Loader2 className="spin" size={16}/> : <ArrowDown size={16}/>}加载更多</button></div>}
        </div>
      </section>
      <footer><span>Odette <span className="footer-separator">/</span> 你的图片，你的空间。</span><span>原图保存 · 链接分享</span></footer>
    </main>
    </div>
    <dialog ref={dialog} aria-label={preview ? '图片预览' : deleting ? '删除图片确认' : '新建文件夹'} onCancel={event => { if (deleteBusy || folderBusy) event.preventDefault(); else closeDialog(); }} onClick={event => { if (event.target === event.currentTarget) closeDialog(); }}>
      <button className="dialog-close icon-button" disabled={deleteBusy || folderBusy} aria-label="关闭弹窗" onClick={closeDialog}><X size={21}/></button>
      {preview && <div className="preview"><img src={preview.url} alt={preview.originalName}/><h3>{preview.originalName}</h3><p>{formatSize(preview.size)} · {preview.contentType}</p><input aria-label="图片公开链接" value={preview.url} readOnly onFocus={event => event.target.select()}/><div className="preview-actions"><CopyButton value={preview.url}/><CopyButton value={`![](${preview.url})`} markdown/></div></div>}
      {deleting && <div className="confirm"><p className="eyebrow">DELETE IMAGE</p><h2>{deleting.length === 1 ? '删除这张图片？' : `删除选中的 ${deleting.length} 张图片？`}</h2><ul className="delete-name delete-list">{deleting.map(image => <li key={image.key}>{image.originalName}</li>)}</ul><p>删除后无法恢复，使用该图片的链接将失效。已缓存的副本可能暂时仍可访问。</p><div className="confirm-actions"><button disabled={deleteBusy} onClick={() => setDeleting(null)}>保留图片</button><button className="danger" disabled={deleteBusy} onClick={() => { void remove(); }}>{deleteBusy ? '正在删除…' : '确认删除'}</button></div></div>}
      {creatingFolder && <form className="create-folder" onSubmit={event => { void submitFolder(event); }}>
        <p className="eyebrow">NEW FOLDER</p>
        <h2>新建文件夹</h2>
        <label>当前目录<span className="current-directory" title={currentPrefix}>{currentPrefix}</span></label>
        <label htmlFor="folder-name">文件夹名称</label>
        <input ref={folderInput} id="folder-name" value={folderName} onChange={event => { setFolderName(event.target.value); setFolderError(''); }} placeholder="例如：2026" maxLength={255} autoComplete="off" aria-invalid={Boolean(folderError)} aria-describedby={folderError ? 'folder-error' : undefined}/>
        <p className="field-hint">名称只能表示一级目录，不能包含 / 或 \\。</p>
        {folderError && <p className="field-error" id="folder-error" role="alert">{folderError}</p>}
        <div className="confirm-actions"><button type="button" disabled={folderBusy} onClick={closeDialog}>取消</button><button className="primary" type="submit" disabled={folderBusy || !folderName.trim()}>{folderBusy ? <><Loader2 className="spin" size={15}/>正在创建…</> : '创建'}</button></div>
      </form>}
    </dialog>
  </div>;
}
