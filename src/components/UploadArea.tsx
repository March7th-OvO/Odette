import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { IMAGE_TYPES } from '../../shared/image';
/** Inline upload surface shared by directory navigation, file selection and drag/drop. */
export function UploadArea({ busy, prefix, onFiles }: { busy: boolean; prefix: string; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <section id="upload" aria-label="上传图片" aria-busy={busy} className={`upload-area ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) onFiles(Array.from(event.dataTransfer.files)); }}>
    <div className="upload-icon" aria-hidden="true"><Upload size={25} strokeWidth={1.7}/></div>
    <div className="upload-copy"><h2>{busy ? '正在上传图片…' : '拖拽图片到这里，即可上传'}</h2><p>上传到 <strong>{prefix}</strong>，支持一次上传多张。</p><small>JPG · PNG · WEBP · AVIF · GIF <i/> 单张最大 10 MB</small></div>
    <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="spin" size={17}/> : <Upload size={17}/>}<span>{busy ? '上传中' : '选择图片'}</span></button>
    <input ref={input} className="sr-only" type="file" multiple accept={Object.keys(IMAGE_TYPES).join(',')} aria-label="选择要上传的图片" disabled={busy} onChange={event => { onFiles(Array.from(event.target.files || [])); event.target.value = ''; }}/>
  </section>;
}
