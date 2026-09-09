import { useEffect, useRef, useState } from 'react';
import { Bold, Code, FilePlus2, ImagePlus, Italic, Link, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sidebar } from '../components/Sidebar';
import { ContentTree } from '../components/ContentTree';
import { AssetPicker } from '../components/AssetPicker';
import { deletePost, getPost, getPostTree, PostApiError, repositoryAssetUrl, savePost } from '../api/post';
import { postExtension, resolvePostAsset, type ContentEntry, type PostDocument, type PostFrontmatter, type ContentTree as Tree } from '../../shared/post';
import '../articles.css';

const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const draftKey = (path: string) => `odette:Firefly:master:draft:${path}`;
const isRaster = (path: string) => /\.(png|jpe?g|avif|webp|gif)$/i.test(path);

/** 元数据单独修改；正文仅在用户输入时更新，避免 textarea 归一化换行影响原文。 */
export function Articles() {
  const [tree, setTree] = useState<Tree>({ entries: [], revision: '' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [doc, setDoc] = useState<PostDocument>();
  const [baseline, setBaseline] = useState<PostDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [commitUrl, setCommitUrl] = useState('');
  const [preview, setPreview] = useState(false);
  const [autoUpdated, setAutoUpdated] = useState(true);
  const [picker, setPicker] = useState<{ target: 'body' | 'cover'; source: 'r2' | 'repository' }>();
  const [asset, setAsset] = useState<ContentEntry>();
  const [conflict, setConflict] = useState<PostDocument>();
  const [newOpen, setNewOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('.md');
  const [tag, setTag] = useState('');
  const [coverMode, setCoverMode] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const editor = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const requestVersion = useRef(0);
  const dirty = Boolean(doc && (!doc.sha || JSON.stringify(doc) !== JSON.stringify(baseline)));

  async function refresh() {
    setLoading(true); setError('');
    try { setTree(await getPostTree()); } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy]);
  useEffect(() => {
    if (!doc || !dirty) return;
    try { localStorage.setItem(draftKey(doc.path), JSON.stringify(doc)); setStorageNotice('已暂存到当前浏览器'); }
    catch { setStorageNotice('浏览器暂存不可用，请及时保存或导出正文'); }
  }, [doc, dirty]);
  function leave() { return !dirty || window.confirm('当前有未提交的编辑。内容已尝试暂存到当前浏览器，仍要切换吗？'); }
  function clearDraft(path: string) { try { localStorage.removeItem(draftKey(path)); } catch { /* 隐私模式下不影响 GitHub 保存结果。 */ } }
  function initialize(next: PostDocument) {
    setBaseline(next); setDoc(next); setAsset(undefined); setConflict(undefined); setPreview(false); setCoverMode(''); setAutoUpdated(true); setStorageNotice(''); setTag('');
    try {
      const cached = localStorage.getItem(draftKey(next.path));
      if (cached) {
        const draft = JSON.parse(cached) as PostDocument;
        if (draft.path === next.path && typeof draft.body === 'string' && draft.frontmatter && JSON.stringify(draft) !== JSON.stringify(next) && window.confirm('发现这篇文章的浏览器暂存，是否恢复？')) {
          // 保留暂存的基准 SHA，外部修改时保存必须触发冲突。
          setDoc(draft);
        }
      }
    } catch { setStorageNotice('无法读取浏览器暂存'); }
  }
  async function open(entry: ContentEntry) {
    if (busy || !leave()) return;
    if (entry.kind === 'asset') { setAsset(entry); setDoc(undefined); setBaseline(undefined); setConflict(undefined); return; }
    if (entry.kind !== 'article') return;
    const version = ++requestVersion.current;
    setBusy(true); setError(''); setNotice(''); setCommitUrl('');
    try { const next = await getPost(entry.path); if (version === requestVersion.current) initialize(next); }
    catch (e) { setError((e as Error).message); } finally { if (version === requestVersion.current) setBusy(false); }
  }
  function field(key: string, value: unknown) { setDoc(old => old ? { ...old, frontmatter: { ...old.frontmatter, [key]: value } } : old); }
  function insert(before: string, after = '') {
    if (!doc) return;
    // DOM selection 使用 LF 索引；转换回原文的 CRLF 字符索引后再拼接。
    const normalized = doc.body.replace(/\r\n/g, '\n');
    const rawIndex = (n: number) => { let raw = 0, logical = 0; while (raw < doc.body.length && logical < n) { if (doc.body[raw] === '\r' && doc.body[raw + 1] === '\n') raw++; raw++; logical++; } return raw; };
    const { start, end } = selection.current;
    const body = doc.body.slice(0, rawIndex(start)) + before + doc.body.slice(rawIndex(start), rawIndex(end)) + after + doc.body.slice(rawIndex(end));
    setDoc({ ...doc, body }); setPreview(false);
    const caret = Math.min(start, normalized.length) + before.length + (end - start) + after.length;
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(caret, caret); selection.current = { start: caret, end: caret }; });
  }
  async function save(draft: boolean) {
    if (!doc || busy) return;
    if (baseline?.frontmatter.draft !== true && baseline?.sha && draft && !window.confirm('转为草稿并提交后，博客下次部署将下架这篇文章。继续吗？')) return;
    setBusy(true); setError(''); setNotice(''); setCommitUrl('');
    try {
      const result = await savePost({ path: doc.path, sha: doc.sha || undefined, frontmatter: { ...doc.frontmatter, draft }, body: doc.body, autoUpdated }, !doc.sha);
      clearDraft(doc.path); setDoc(result.document); setBaseline(result.document); setConflict(undefined); setStorageNotice('');
      setNotice(result.commitSha ? `已提交 GitHub · ${result.commitSha.slice(0, 7)} · 部署状态未确认` : '没有需要提交的更改');
      setCommitUrl(result.commitUrl || '');
      try { setTree(await getPostTree()); } catch { setNotice('文章已保存，但内容树刷新失败，请手动刷新'); }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof PostApiError && e.status === 409 && doc.sha) {
        try { setConflict(await getPost(doc.path)); } catch { /* 不覆盖原始冲突提示，也不丢弃编辑。 */ }
      }
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!doc?.sha || !window.confirm(`删除 ${doc.path} 并提交 GitHub？同目录图片会保留。`)) return;
    setBusy(true); setError('');
    try { const result = await deletePost(doc.path, doc.sha); clearDraft(doc.path); setDoc(undefined); setBaseline(undefined); setNotice('删除已提交 GitHub · 部署状态未确认'); setCommitUrl(result.commitUrl); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function create(event: React.FormEvent) {
    event.preventDefault();
    const path = newPath.trim().replace(/\.(md|mdx)$/, '') + newType;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug) || !newTitle.trim() || !newPath.trim() || /[\\%?#:\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) { setError('请填写标题、有效相对路径和小写 slug'); return; }
    if (tree.entries.some(e => e.path === path)) { setError('文件路径已存在'); return; }
    initialize({ path, sha: '', extension: postExtension(path), frontmatter: { title: newTitle.trim(), published: today(), slug: newSlug, draft: true, lang: 'zh-CN', comment: true, pinned: false }, body: '\n' });
    setNewOpen(false); setError(''); setNotice('新文章已在编辑器中创建，尚未提交 GitHub');
  }
  function imageSource(value: string) {
    if (/^https?:\/\//i.test(value)) return value;
    const path = resolvePostAsset(doc?.path || '', value);
    return path && isRaster(path) ? repositoryAssetUrl(path) : undefined;
  }
  const fm = doc?.frontmatter;
  const cover = typeof fm?.image === 'string' ? fm.image : '';
  const inferredMode = !cover ? 'none' : cover === 'api' ? 'api' : tree.mediaBaseUrl && cover.startsWith(tree.mediaBaseUrl.replace(/\/$/, '') + '/') ? 'r2' : /^https?:\/\//.test(cover) ? 'external' : 'repository';
  const textField = (key: string, label: string, type = 'text') => <label key={key} className="article-field">{label}<input type={type} value={typeof fm?.[key] === 'string' ? type === 'date' ? (fm[key] as string).slice(0, 10) : fm[key] as string : ''} onChange={e => field(key, e.target.value)}/></label>;
  return <div className="app-shell"><Sidebar/><div className="workspace articles-workspace">
    <header className="topbar"><div className="workspace-label"><FilePlus2 size={17}/><span>工作空间</span><span>/</span><strong>Articles</strong></div><span className="private-badge">Firefly / master</span></header>
    <main id="main-content" className="articles-main">
      <div className="page-heading"><div><p className="eyebrow">CONTENT STUDIO</p><h1>Articles</h1><p>写下故事，让灵感有迹可循。</p></div><button className="primary" disabled={busy} onClick={() => { if (leave()) { setNewPath(''); setNewTitle(''); setNewSlug(''); setNewType('.md'); setNewOpen(true); } }}><FilePlus2 size={16}/>新建文章</button></div>
      {error && <div className="article-error" role="alert">{error}<button aria-label="关闭错误" onClick={() => setError('')}><X size={15}/></button></div>}
      {notice && <div className="article-notice" role="status">{notice}{commitUrl && <a href={commitUrl} target="_blank" rel="noreferrer">查看提交 ↗</a>}</div>}
      <div className="articles-layout"><aside className="articles-tree-panel" aria-label="文章内容树"><div className="tree-heading"><strong>Content Tree</strong><button aria-label="刷新内容树" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={15}/></button></div><input aria-label="搜索文章路径" placeholder="搜索路径…" value={search} onChange={e => setSearch(e.target.value)}/><small>src/content/posts/</small>{loading ? <p role="status">正在读取内容树…</p> : <ContentTree entries={tree.entries} active={doc?.path || asset?.path} search={search} disabled={busy} onSelect={entry => void open(entry)}/>}{!loading && !tree.entries.length && <p>尚未读取到内容。检查连接后刷新，或创建文章。</p>}</aside>
      <section className="article-editor-panel" aria-label="文章编辑器">
        {doc && fm ? <>
          <header className="editor-heading"><div><strong>{fm.title || '未命名文章'}</strong><code>{doc.path}</code><small>{busy ? '正在处理…' : dirty ? storageNotice || '有未提交的编辑' : doc.sha ? '已与 GitHub 同步' : '尚未提交'}</small></div><div className="article-actions"><button disabled={busy} onClick={() => {
            const blob = new Blob([doc.body], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = doc.path.split('/').pop()!; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>导出正文</button>{doc.sha && <button aria-label="删除文章" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/></button>}{!doc.sha || baseline?.frontmatter.draft ? <><button disabled={busy} onClick={() => void save(true)}><Save size={15}/>保存草稿</button><button className="primary" disabled={busy} onClick={() => void save(false)}><Upload size={15}/>发布</button></> : <button className="primary" disabled={busy || !dirty} onClick={() => void save(Boolean(fm.draft))}><Save size={15}/>保存更新</button>}</div></header>
          {conflict && <section className="conflict-panel"><h3>比较 GitHub 最新版本</h3><p>本地编辑保留在左侧编辑器。以下为远端内容，选择合并基准不会替换你的正文。</p><details><summary>远端元信息</summary><pre>{JSON.stringify(conflict.frontmatter, null, 2)}</pre></details><pre>{conflict.body}</pre><div className="article-actions"><button onClick={() => { if (window.confirm('放弃本地编辑并载入远端版本？')) { clearDraft(doc.path); setDoc(conflict); setBaseline(conflict); setConflict(undefined); } }}>使用远端版本</button><button onClick={() => { if (window.confirm('确认已比较并完成必要合并？下次保存将用当前编辑替换远端版本。')) { setDoc({ ...doc, sha: conflict.sha }); setBaseline(conflict); setConflict(undefined); setError(''); } }}>已比较，使用最新 SHA 继续编辑</button></div></section>}
          <fieldset disabled={busy} className="editor-fields"><div className="writing-pane"><div className="writing-tabs"><button aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button><button aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button><span>{doc.extension.slice(1).toUpperCase()}</span></div>
          {!preview ? <><div className="markdown-toolbar"><button title="二级标题" onClick={() => insert('## ')}>H2</button><button aria-label="加粗" onClick={() => insert('**', '**')}><Bold size={15}/></button><button aria-label="斜体" onClick={() => insert('*', '*')}><Italic size={15}/></button><button aria-label="链接" onClick={() => insert('[', '](https://)')}><Link size={15}/></button><button aria-label="代码块" onClick={() => insert('\n```\n', '\n```\n')}><Code size={15}/></button><button onClick={() => setPicker({ target: 'body', source: 'r2' })}><ImagePlus size={15}/>Insert Image</button></div><textarea ref={editor} className="markdown-source" aria-label="Markdown 正文" spellCheck={false} value={doc.body} onSelect={e => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} onChange={e => {
            const value = e.target.value; const body = doc.body.includes('\r\n') ? value.replace(/\r?\n/g, '\r\n') : value;
            setDoc({ ...doc, body });
          }}/></> : <><p className="preview-note">基础 Markdown 预览。MDX 组件、扩展指令和公式等以 Astro 构建结果为准。</p>{doc.extension === '.mdx' ? <pre className="mdx-source">{doc.body}</pre> : <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ src, alt }) => { const resolved = src ? imageSource(src) : undefined; return resolved ? <img src={resolved} alt={alt || ''} loading="lazy"/> : <span>[图片：{alt}]</span>; }, a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{doc.body}</ReactMarkdown></div>}</>}
          <div className="editor-footnote">{doc.body.length.toLocaleString()} 字符 · {doc.sha ? `版本 ${doc.sha.slice(0, 7)}` : '新文章'} · 正文按原始文本保存</div></div>
          <aside className="article-properties"><details open><summary>Metadata</summary>{textField('title', '标题')}{textField('slug', 'Slug')}<small>公开 URL 标识；修改不改变文件路径。</small>{textField('description', '摘要')}{textField('category', '分类')}{textField('lang', '语言')}
          <label className="article-field">标签<div className="tag-list">{(Array.isArray(fm.tags) ? fm.tags : []).map(value => <button key={value} onClick={() => field('tags', fm.tags!.filter(t => t !== value))}>{value} ×</button>)}</div><input aria-label="添加标签" placeholder="输入后按 Enter" value={tag} onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (tag.trim()) field('tags', [...new Set([...(fm.tags || []), tag.trim()])]); setTag(''); } }}/></label></details>
          <details open><summary>Cover</summary><label className="article-field">图片来源<select value={coverMode || inferredMode} onChange={e => { const mode = e.target.value; setCoverMode(mode); if (mode === 'none') field('image', ''); else if (mode === 'api') field('image', 'api'); else if (mode === 'r2' || mode === 'repository') setPicker({ target: 'cover', source: mode }); }}><option value="none">None</option><option value="api">Random API</option><option value="repository">Repository Asset</option><option value="r2">Odette Media</option><option value="external">External URL</option></select></label>{imageSource(cover) && <img className="cover-preview" src={imageSource(cover)} alt="文章封面"/>}{cover === 'api' && <p className="preview-note">随机图片由博客的 API 配置决定。</p>}{textField('image', '封面引用')}<button onClick={() => setPicker({ target: 'cover', source: 'r2' })}><ImagePlus size={15}/>选择 / 上传图片</button></details>
          <details open><summary>Publishing</summary>{textField('published', '发布日期', 'date')}{textField('updated', '修改日期（可选）', 'date')}<label className="article-check"><input type="checkbox" checked={autoUpdated} onChange={e => setAutoUpdated(e.target.checked)}/>编辑已发布文章时自动更新日期</label>{(['draft', 'pinned', 'comment'] as const).map(key => <label key={key} className="article-check"><input type="checkbox" checked={Boolean(fm[key] ?? (key === 'comment'))} onChange={e => field(key, e.target.checked)}/>{{ draft: '草稿', pinned: '置顶', comment: '允许评论' }[key]}</label>)}</details>
          <details><summary>Series</summary>{textField('series', '系列名称')}<label className="article-field">系列顺序<input type="number" value={typeof fm.seriesOrder === 'number' ? fm.seriesOrder : ''} onChange={e => field('seriesOrder', e.target.value === '' ? '' : Number(e.target.value))}/></label></details>
          <details><summary>Advanced</summary>{textField('author', '作者')}{textField('sourceLink', '来源链接')}{textField('licenseName', '许可名称')}{textField('licenseUrl', '许可链接')}{textField('password', '主题文章密码', 'password')}{textField('passwordHint', '密码提示')}<small>此字段会写入仓库；公开仓库中的密码和正文可见。</small></details></aside></fieldset>
        </> : asset ? <div className="repository-asset-view"><p className="eyebrow">REPOSITORY ASSET</p><h2>{asset.path}</h2>{isRaster(asset.path) ? <img src={repositoryAssetUrl(asset.path)} alt={asset.path}/> : <p>此资源仅在内容树中展示，第一版不提供编辑或预览。</p>}<p>资源保存在 GitHub，删除文章不会删除它。</p></div> : <div className="article-welcome"><FilePlus2 size={38}/><h2>从一篇文章开始</h2><p>在左侧打开 Markdown、MDX 或 Page Bundle，<br/>也可以新建文章，把下一段故事写下来。</p><span>GitHub 保存文章 · R2 保存共享图片</span></div>}
      </section></div>
    </main></div>
    {newOpen && <NewArticleDialog onClose={() => setNewOpen(false)} onSubmit={create}><label className="article-field">标题<input autoFocus required value={newTitle} onChange={e => { setNewTitle(e.target.value); const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!newSlug || newSlug === newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) { setNewSlug(slug); setNewPath(slug); } }}/></label><label className="article-field">相对文件路径<input required placeholder="guide/furina-build 或 guide/index" value={newPath} onChange={e => setNewPath(e.target.value)}/></label><label className="article-field">类型<select value={newType} onChange={e => setNewType(e.target.value)}><option value=".md">Markdown (.md)</option><option value=".mdx">MDX (.mdx)</option></select></label><label className="article-field">Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={newSlug} onChange={e => setNewSlug(e.target.value)}/></label><p>文件名创建后固定。新文章默认草稿，不写入 updated。</p>{error && <p role="alert" className="article-error">{error}</p>}<button type="submit" className="primary">开始编辑</button></NewArticleDialog>}
    {picker && doc && <AssetPicker entries={tree.entries} documentPath={doc.path} initialSource={picker.source} onClose={() => setPicker(undefined)} onSelect={(url, alt) => { if (picker.target === 'cover') { field('image', url); setCoverMode(/^https?:/.test(url) ? 'r2' : 'repository'); } else insert(`![${alt.replace(/[\\\[\]]/g, '\\$&')}](<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`); setPicker(undefined); }}/>} 
  </div>;
}

function NewArticleDialog({ children, onClose, onSubmit }: { children: React.ReactNode; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="new-article-dialog" ref={dialog} onCancel={onClose} aria-labelledby="new-article-title"><header className="picker-heading"><h2 id="new-article-title">新建文章</h2><button aria-label="关闭新建文章" onClick={onClose}><X size={18}/></button></header><form onSubmit={onSubmit}>{children}</form></dialog>;
}
