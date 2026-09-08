import { Cloud, Images, Upload } from 'lucide-react';

/** Desktop navigation expands on pointer hover or keyboard focus; compact screens stay fully usable. */
export function Sidebar() {
  return <aside className="sidebar" aria-label="工作空间导航">
    <a className="brand" href="/" aria-label="Odette 首页">
      <span className="brand-mark"><Cloud size={23} strokeWidth={1.8}/></span>
      <span className="sidebar-label brand-name">odette<span>媒体资产管理</span></span>
    </a>
    <div className="sidebar-section-label sidebar-label">工作空间</div>
    <nav className="sidebar-nav">
      <a className="nav-item is-active" href="#library" aria-label="图片库" aria-current="location" title="图片库"><Images size={19}/><span className="sidebar-label">图片库</span></a>
      <a className="nav-item" href="#upload" aria-label="上传图片" title="上传图片"><Upload size={19}/><span className="sidebar-label">上传图片</span></a>
    </nav>
    <div className="sidebar-bottom">
      <div className="storage-note sidebar-label"><Cloud size={19}/><div><strong>原图存储</strong><p>保留原始画质，随时分享链接。</p></div></div>
    </div>
  </aside>;
}
