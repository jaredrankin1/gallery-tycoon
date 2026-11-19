// Artwork images. Keys match Artwork.image.
//   paintings: src/assets/art/<key>.jpg (tools/slice_art.py)
//   sculpture and fibre art: src/assets/sculpture/<key>.png (tools/slice_sculpture.py)
const globbed = {
  ...import.meta.glob('../assets/art/*.jpg', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../assets/sculpture/*.png', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>;

const urls: Record<string, string> = {};
for (const [path, url] of Object.entries(globbed)) urls[path.replace(/^.*\/|\.\w+$/g, '')] = url;

export const paintingUrl = (key: string): string | undefined => urls[key];

const cache = new Map<string, HTMLImageElement>();

/** The image for a work, loading on first use. Null if the key is unknown. */
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

/** Start loading every work so walls and pedestals never show a blank. */
export function preloadPaintings() {
  for (const k of Object.keys(urls)) paintingImage(k);
}
