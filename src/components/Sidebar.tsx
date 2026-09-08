import { useState } from 'react';
import { Cloud, Images, Upload } from 'lucide-react';

/** Desktop navigation expands on pointer hover or keyboard focus; compact screens stay fully usable. */
export function Sidebar() {
  const [pointerInside, setPointerInside] = useState(false);
  const [keyboardFocusInside, setKeyboardFocusInside] = useState(false);
  const expanded = pointerInside || keyboardFocusInside;

  return <aside
    className="sidebar"
    aria-label="工作空间导航"
    aria-expanded={expanded}
    data-state={expanded ? 'expanded' : 'collapsed'}
    onPointerEnter={() => setPointerInside(true)}
    onPointerLeave={() => setPointerInside(false)}
    onFocusCapture={(event) => setKeyboardFocusInside((event.target as HTMLElement).matches(':focus-visible'))}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardFocusInside(false);
    }}
  >
    <a className="brand" href="/" aria-label="Odette 首页">
      <span className="brand-mark"><Cloud size={23} strokeWidth={1.8}/></span>
      <span className="sidebar-label" aria-hidden={!expanded}><span className="sidebar-label-content brand-name">odette<span>媒体资产管理</span></span></span>
    </a>
    <div className="sidebar-section-label sidebar-label" aria-hidden={!expanded}><span className="sidebar-label-content">工作空间</span></div>
    <nav className="sidebar-nav">
      <a className="nav-item is-active" href="#library" aria-label="图片库" aria-current="location" title="图片库"><Images size={19}/><span className="sidebar-label" aria-hidden={!expanded}><span className="sidebar-label-content">图片库</span></span></a>
      <a className="nav-item" href="#upload" aria-label="上传图片" title="上传图片"><Upload size={19}/><span className="sidebar-label" aria-hidden={!expanded}><span className="sidebar-label-content">上传图片</span></span></a>
    </nav>

  </aside>;
}
