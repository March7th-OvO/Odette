import type { ImageItem } from '../../shared/image';
import { ImageCard } from './ImageCard';
export function ImageGrid({ images, onPreview, onDelete }: { images: ImageItem[]; onPreview: (image: ImageItem) => void; onDelete: (image: ImageItem) => void }) {
  return <div className="image-grid">{images.map(image => <ImageCard key={image.key} image={image} onPreview={() => onPreview(image)} onDelete={() => onDelete(image)}/>)}</div>;
}
