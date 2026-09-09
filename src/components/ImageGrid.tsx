import type { ImageItem } from '../../shared/image';
import { ImageCard } from './ImageCard';
export function ImageGrid({ images, onPreview, onDelete, selectedKeys, onToggle }: { images: ImageItem[]; onPreview: (image: ImageItem) => void; onDelete: (image: ImageItem) => void; selectedKeys?: Set<string>; onToggle?: (key: string) => void }) {
  return <div className="image-grid">{images.map(image => <ImageCard key={image.key} image={image} onPreview={() => onPreview(image)} onDelete={() => onDelete(image)} selected={selectedKeys?.has(image.key)} onToggle={onToggle ? () => onToggle(image.key) : undefined}/>)}</div>;
}
