// Painting images cut by tools/slice_art.py. Keys match Artwork.image.
const urls = import.meta.glob('../assets/art/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const paintingUrl = (key: string): string | undefined => urls[`../assets/art/${key}.jpg`];

const cache = new Map<string, HTMLImageElement>();

/** The image for a painting, loading on first use. Null if the key is unknown. */
export function paintingImage(key: string): HTMLImageElement | null {
  let img = cache.get(key);
  if (!img) {
    const src = paintingUrl(key);
    if (!src) return null;
    img = new Image();
    img.src = src;
    cache.set(key, img);
  }
  return img;
}

/** Start loading every painting so walls never show a blank frame. */
export function preloadPaintings() {
  for (const k of Object.keys(urls)) paintingImage(k.replace('../assets/art/', '').replace('.jpg', ''));
}
