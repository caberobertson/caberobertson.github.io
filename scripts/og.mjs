/**
 * Render the social preview cards.
 *
 *   npm run build && npm run og
 *
 * Serves dist/, screenshots each frame on /og-preview.html, and writes
 * public/og/<slug>.png. The output is committed: Playwright is a local tool,
 * not a CI dependency, so the deploy workflow never has to run a browser.
 *
 * Chromium is resolved in this order: $CHROMIUM_PATH, then any chrome-linux
 * build under $PLAYWRIGHT_BROWSERS_PATH, then Playwright's own download. The
 * middle case exists because a preinstalled browser rarely matches the exact
 * build number the freshly installed playwright package wants, and pinning the
 * executable is cheaper than re-downloading a browser to take seven
 * screenshots.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'public', 'og');
const PORT = 4319;

if (!fs.existsSync(path.join(dist, 'og-preview.html'))) {
    console.error('dist/og-preview.html is missing. Run `npm run build` first.');
    process.exit(1);
}

const { chromium } = await import('playwright').catch(() => {
    console.error('playwright is not installed. `npm i -D playwright` to regenerate the cards.');
    process.exit(1);
});

const TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(dist, rel === '/' ? '/index.html' : rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
});

await new Promise((r) => server.listen(PORT, r));

const findChromium = () => {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!base || !fs.existsSync(base)) return undefined;
    for (const dir of fs.readdirSync(base)) {
        const candidate = path.join(base, dir, 'chrome-linux', 'chrome');
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
};

const executablePath = findChromium();
if (executablePath) console.log(`chromium: ${executablePath}`);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${PORT}/og-preview.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

fs.mkdirSync(outDir, { recursive: true });

const slugs = await page.$$eval('[data-og]', (els) => els.map((e) => e.dataset.og));
for (const slug of slugs) {
    const el = await page.$(`#og-${slug}`);
    const out = path.join(outDir, `${slug}.png`);
    await el.screenshot({ path: out });
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`  og/${slug}.png  ${kb} KB`);
}

await browser.close();
server.close();
console.log(`\n${slugs.length} cards written to public/og/`);
