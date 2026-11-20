// Bundles dist/ into one self-contained HTML file (for sharing a playable build).
// Usage: npm run build && node scripts/build-single.mjs [out.html]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const assets = readdirSync('dist/assets');
const js = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8');
const css = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8');
const out = process.argv[2] ?? 'dist/art-gallery-tycoon.html';

writeFileSync(
  out,
  `<title>Art Gallery Tycoon</title>
<meta name="theme-color" content="#121212">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,400..800;1,500&display=swap">
<style>${css}</style>
<div id="stage"><div id="app"></div></div>
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`,
);
console.log(`wrote ${out}`);
