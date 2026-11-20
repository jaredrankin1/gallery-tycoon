import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  // Inline every asset (sprite atlases included) so a build is one self-contained bundle.
  build: { outDir: 'dist', assetsInlineLimit: 10_000_000 },
});
