/**
 * Lighthouse run against the built site.
 *
 *   npm run build && npm run lighthouse
 *   npm run lighthouse -- /projects.html /notes.html      # specific pages
 *   RUNS=5 npm run lighthouse                             # median of N
 *
 * Lighthouse is not a dependency: it pulls ~100 packages and is a local
 * diagnostic, not something CI needs. Install it when you want to run this.
 *
 * The static server below deliberately mirrors GitHub Pages rather than being
 * a bare file server: it sends brotli/gzip for text and a cache lifetime on
 * hashed assets, and it compresses once instead of per request. Without those,
 * the numbers are dominated by the harness, not the site.
 *
 * On performance scores: they move with machine load. Byte-identical runs on a
 * busy container have measured 80 and 99 minutes apart, because Lighthouse's
 * simulated throttling calibrates against the host CPU. Trust the underlying
 * metrics (TBT, CLS, byte weight, request count) over the composite, and use
 * RUNS to get a median before concluding anything changed.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const dist = path.join(root, 'dist');
const PORT = 4331;
const RUNS = Number(process.env.RUNS || 1);

if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/ is empty. Run `npm run build` first.');
    process.exit(1);
}

const [lighthouse, chromeLauncher] = await Promise.all([
    import('lighthouse').then((m) => m.default),
    import('chrome-launcher'),
]).catch(() => {
    console.error('lighthouse is not installed. `npm i -D lighthouse chrome-launcher` to run this.');
    process.exit(1);
});

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|xml|json)|image\/svg)/;
const encoded = new Map();

const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(dist, rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    let body = fs.readFileSync(file);
    const headers = {
        'Content-Type': type,
        'Cache-Control': rel.startsWith('/_astro/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=600',
    };
    const accept = req.headers['accept-encoding'] || '';
    if (COMPRESSIBLE.test(type)) {
        const mode = /br/.test(accept) ? 'br' : /gzip/.test(accept) ? 'gzip' : null;
        if (mode) {
            const key = `${rel}|${mode}`;
            if (!encoded.has(key)) {
                encoded.set(
                    key,
                    mode === 'br'
                        ? zlib.brotliCompressSync(body, {
                              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
                          })
                        : zlib.gzipSync(body, { level: 6 }),
                );
            }
            body = encoded.get(key);
            headers['Content-Encoding'] = mode;
        }
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
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

const chrome = await chromeLauncher.launch({
    chromePath: findChromium(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const pages = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
          '/index.html',
          '/projects.html',
          '/notes.html',
          '/crashguard.html',
          '/experience.html',
          '/skills.html',
          '/contact.html',
          '/notes/vendor-library-was-wrong.html',
          '/projects/rf-jamming-demonstrator.html',
      ];

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
let below = 0;

for (const page of pages) {
    const runs = { perf: [], a11y: [], bp: [], seo: [], tbt: [], cls: [], bytes: [] };
    for (let i = 0; i < RUNS; i++) {
        const { lhr } = await lighthouse(`http://localhost:${PORT}${page}`, {
            port: chrome.port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            formFactor: 'desktop',
            screenEmulation: { disabled: true },
        });
        const s = (k) => Math.round(lhr.categories[k].score * 100);
        runs.perf.push(s('performance'));
        runs.a11y.push(s('accessibility'));
        runs.bp.push(s('best-practices'));
        runs.seo.push(s('seo'));
        runs.tbt.push(Math.round(lhr.audits['total-blocking-time'].numericValue));
        runs.cls.push(lhr.audits['cumulative-layout-shift'].numericValue);
        runs.bytes.push(Math.round(lhr.audits['total-byte-weight'].numericValue / 1024));
    }
    const row = {
        page,
        perf: median(runs.perf),
        a11y: median(runs.a11y),
        bp: median(runs.bp),
        seo: median(runs.seo),
        TBTms: median(runs.tbt),
        CLS: Number(median(runs.cls).toFixed(3)),
        KB: median(runs.bytes),
    };
    rows.push(row);
    // Accessibility, best practices and SEO are deterministic, so they are the
    // ones worth gating on. Performance is reported but not enforced.
    if (row.a11y < 95 || row.bp < 95 || row.seo < 100) below++;
}

console.table(rows);
await chrome.kill();
server.close();

if (below) {
    console.error(`\n${below} page(s) below the a11y/best-practices/SEO floor.`);
    process.exit(1);
}
console.log('\nAll pages meet the accessibility, best-practices and SEO floor.');
