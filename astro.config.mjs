import { defineConfig } from 'astro/config';

// User GitHub Pages site: https://caberobertson.github.io  -> base is "/".
export default defineConfig({
  site: 'https://caberobertson.github.io',
  base: '/',
  // 'file' keeps the hand-written URL shape (/experience.html, /crashguard.html)
  // instead of Astro's default directory form (/experience/). Existing links,
  // shared URLs and the resume's site reference all keep working.
  build: {
    format: 'file',
    // Inline every stylesheet rather than only the small ones. The whole
    // bundle is about 34 KB across two files; as <link> tags they are two
    // render-blocking round trips on every navigation, and Lighthouse
    // attributed roughly a second of blocking time to them. Inlined, first
    // paint needs nothing but the HTML document. The tradeoff is that the CSS
    // is re-sent per page instead of being cached once; at this size the round
    // trip costs more than the bytes.
    inlineStylesheets: 'always',
  },
  devToolbar: { enabled: false },
});
