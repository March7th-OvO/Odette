import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ImageItem } from '../shared/image';
import { ImageCard } from '../src/components/ImageCard';

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
