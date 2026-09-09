import { FileCode2, FileImage, Folder, Package } from 'lucide-react';
import type { ContentEntry } from '../../shared/post';

export function ContentTree({ entries, active, search, onSelect, disabled = false }: { entries: ContentEntry[]; active?: string; search: string; onSelect: (entry: ContentEntry) => void; disabled?: boolean }) {
  const filtered = search.trim().toLowerCase();
  const render = (parent = ''): React.ReactNode => entries.filter(entry => entry.path.split('/').slice(0, -1).join('/') === parent)
    .sort((a, b) => Number(['folder', 'bundle'].includes(b.kind)) - Number(['folder', 'bundle'].includes(a.kind)) || a.path.localeCompare(b.path))
    .map(entry => {
      const directory = entry.kind === 'folder' || entry.kind === 'bundle';
      if (filtered && !entry.path.toLowerCase().includes(filtered) && !(directory && entries.some(child => child.path.startsWith(entry.path + '/') && child.path.toLowerCase().includes(filtered)))) return null;
      const label = entry.path.split('/').pop();
      if (directory) return <details key={`${entry.path}-${filtered}`} open={filtered ? true : undefined} className="content-directory">
        <summary title={entry.conflict ? '同时存在 index.md 和 index.mdx，请处理入口冲突' : entry.path}>{entry.kind === 'bundle' ? <Package size={16}/> : <Folder size={16}/>}<span>{label}</span>{entry.conflict && <span className="tree-warning">冲突</span>}</summary>
        <div className="content-children">{render(entry.path)}</div>
      </details>;
      return <button key={entry.path} className={`content-leaf ${active === entry.path ? 'is-selected' : ''}`} title={entry.path} aria-current={active === entry.path ? 'page' : undefined} disabled={disabled || entry.kind === 'unsupported'} onClick={() => onSelect(entry)}>
        {entry.kind === 'article' ? <FileCode2 size={16}/> : <FileImage size={16}/>}<span>{label}</span>
      </button>;
    });
  return <div className="content-tree">{render()}</div>;
}
