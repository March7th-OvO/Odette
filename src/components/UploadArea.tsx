import { useRef, useState } from 'react';
import { ArrowUpRight, Upload } from 'lucide-react';
import { IMAGE_TYPES } from '../../shared/image';
export function UploadArea({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <section className={`upload-area ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) onFiles(Array.from(event.dataTransfer.files)); }}>
    <div className="upload-illustration" aria-hidden="true"><span/><span/><div><Upload size={27} strokeWidth={1.3}/></div></div>
    <div className="upload-copy"><p className="eyebrow">A LITTLE SPACE FOR YOUR IMAGES</p><h2>{busy ? '正在收好你的图片…' : '让每张图片，都有一个住处。'}</h2><p>拖拽图片到这里，或从设备中选择。支持一次上传多张。</p><small>JPG · PNG · WEBP · AVIF · GIF <i/> 单张最大 10 MB</small></div>
    <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? '上传中' : '选择图片'}<ArrowUpRight size={17}/></button>
    <input ref={input} className="sr-only" type="file" multiple accept={Object.keys(IMAGE_TYPES).join(',')} aria-label="选择要上传的图片" disabled={busy} onChange={event => { onFiles(Array.from(event.target.files || [])); event.target.value = ''; }}/>
  </section>;
}
