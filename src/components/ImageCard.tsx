import { Image, Trash2, Maximize2 } from 'lucide-react';
import type { ImageItem } from '../../shared/image';
import { CopyButton } from './CopyButton';
export const formatSize = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
/** Keep image actions visible while long filenames and URLs truncate independently. */
export function ImageCard({ image, onPreview, onDelete }: { image: ImageItem; onPreview: () => void; onDelete: () => void }) {
  return <article className="image-card"><button className="thumbnail" onClick={onPreview} aria-label={`预览 ${image.originalName}`}><img src={image.url} alt={image.originalName} loading="lazy"/><span className="image-format">{image.contentType.split('/')[1]?.toUpperCase()}</span><span className="expand"><Maximize2 size={17}/></span></button>
    <div className="card-info"><div className="file-heading"><span className="file-icon" aria-hidden="true"><Image size={17}/></span><div className="file-details"><h3 title={image.originalName}>{image.originalName}</h3><p className="file-url" title={image.url}>{image.url}</p></div></div><div className="file-meta"><span>{formatSize(image.size)}</span><time>{new Date(image.uploaded).toLocaleDateString('zh-CN')}</time></div><div className="card-actions"><CopyButton value={image.url}/><CopyButton value={`![](${image.url})`} markdown/><button className="icon-button delete" aria-label={`删除 ${image.originalName}`} title="删除图片" onClick={onDelete}><Trash2 size={15}/></button></div></div>
  </article>;
}
