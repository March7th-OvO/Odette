import { ChevronRight, Folder } from 'lucide-react';

const folderName = (prefix: string) => prefix.slice(0, -1).split('/').pop() || prefix;

/** R2 文件夹是由 delimiter 分组得到的前缀，点击后直接以该前缀加载下一层。 */
export function FolderGrid({ folders, onOpen }: { folders: string[]; onOpen: (prefix: string) => void }) {
  if (!folders.length) return null;
  return <section className="folder-section" aria-labelledby="folder-title">
    <h3 id="folder-title">文件夹</h3>
    <div className="folder-grid">
      {folders.map(prefix => <button className="folder-card" key={prefix} onClick={() => onOpen(prefix)} title={prefix}>
        <span className="folder-icon" aria-hidden="true"><Folder size={21}/></span>
        <span><strong>{folderName(prefix)}</strong><small>文件夹</small></span>
        <ChevronRight size={16}/>
      </button>)}
    </div>
  </section>;
}
