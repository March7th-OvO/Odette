/** Match the real grid so the initial load reserves the same content structure. */
export function ImageGridSkeleton() {
  return <div role="status" aria-label="正在打开图片库">
    <span className="sr-only">正在打开图片库…</span>
    <div className="image-grid skeleton-grid" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <div className="image-card skeleton-card" key={index}>
        <div className="skeleton skeleton-thumbnail"/>
        <div className="card-info"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-meta"/><div className="skeleton skeleton-actions"/></div>
      </div>)}
    </div>
  </div>;
}
