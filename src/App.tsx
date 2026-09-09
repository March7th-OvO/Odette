import { Dashboard } from './pages/Dashboard';
import { lazy, Suspense } from 'react';
const Articles = lazy(() => import('./pages/Articles').then(module => ({ default: module.Articles })));
// 独立页面加载编辑器依赖，图片库初始包不承担 Markdown 预览开销。
export default function App() {
  return window.location.pathname.startsWith('/articles')
    ? <Suspense fallback={<p role="status">正在打开 Articles…</p>}><Articles/></Suspense>
    : <Dashboard/>;
}
