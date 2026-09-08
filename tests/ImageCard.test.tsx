import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ImageItem } from '../shared/image';
import { FolderGrid } from '../src/components/FolderGrid';
import { ImageCard } from '../src/components/ImageCard';
import { UploadArea } from '../src/components/UploadArea';

describe('ImageCard', () => {
  it('loads the thumbnail in the grid while retaining the original sharing URL', () => {
    const image: ImageItem = {
      key: 'image/photo.png',
      url: 'https://img.odette.moe/image/photo.png',
      thumbnailUrl: 'https://img.odette.moe/cdn-cgi/image/width=400/image/photo.png',
      originalName: 'photo.png',
      size: 2 * 1024 * 1024,
      contentType: 'image/png',
      uploaded: '2026-09-08T00:00:00.000Z',
    };

    const markup = renderToStaticMarkup(<ImageCard image={image} onPreview={() => undefined} onDelete={() => undefined}/>);

    expect(markup).toContain(`<img src="${image.thumbnailUrl}"`);
    expect(markup).not.toContain(`<img src="${image.url}"`);
    expect(markup).toContain(image.url);
  });
});

describe('directory browser components', () => {
  it('renders child prefixes as folder cards', () => {
    const markup = renderToStaticMarkup(<FolderGrid folders={['image/PhotoWall/', 'image/backgrounds/']} onOpen={() => undefined}/>);
    expect(markup).toContain('PhotoWall');
    expect(markup).toContain('backgrounds');
    expect(markup).toContain('title="image/PhotoWall/"');
  });

  it('shows the upload destination', () => {
    const markup = renderToStaticMarkup(<UploadArea busy={false} prefix="image/PhotoWall/" onFiles={() => undefined}/>);
    expect(markup).toContain('image/PhotoWall/');
  });
});
