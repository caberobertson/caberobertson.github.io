import { defineConfig } from 'astro/config';

// User GitHub Pages site: https://caberobertson.github.io  -> base is "/".
export default defineConfig({
  site: 'https://caberobertson.github.io',
  base: '/',
  // 'file' keeps the hand-written URL shape (/experience.html, /crashguard.html)
  // instead of Astro's default directory form (/experience/). Existing links,
  // shared URLs and the resume's site reference all keep working.
  build: { format: 'file' },
  devToolbar: { enabled: false },
});
