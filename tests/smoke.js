/* ==========================================================================
   DOM smoke test, run against the built output in dist/.
   Loads every generated page through jsdom with the real site script, then
   asserts that local assets resolve, internal links aren't broken, the
   command palette mounts, nav active-state is baked in at build time, and
   key interactive widgets initialize.
   No browser or network required, so it runs anywhere (including CI).
   ========================================================================== */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..', 'dist');
// Static pages plus every generated project detail page, so a new entry in
// the collection is covered automatically instead of silently untested.
const staticPages = ['index.html', 'experience.html', 'projects.html', 'notes.html', 'skills.html', 'contact.html', 'crashguard.html', 'ieee-points.html', 'og-preview.html', '404.html'];
const collectionPages = (dir) =>
    fs.existsSync(path.join(root, dir))
        ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.html')).map((f) => `${dir}/${f}`)
        : [];
const pages = [...staticPages, ...collectionPages('projects'), ...collectionPages('notes')];

if (!fs.existsSync(root)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
}

// The built bundle is an ES module, so exercise the source instead: same code,
// and it stays evaluable inside jsdom.
const siteJs = fs.readFileSync(path.resolve(here, '..', 'src', 'scripts', 'site.js'), 'utf8');

let failures = 0;

for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://caberobertson.github.io/' + page,
        pretendToBeVisual: true,
        runScripts: 'outside-only',
    });
    const { window } = dom;
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

    try {
        window.eval(siteJs);
    } catch (e) {
        console.log(`FAIL ${page}: site.js threw: ${e.message}`);
        failures++;
        continue;
    }

    const doc = window.document;
    const errs = [];

    // Every local asset referenced must exist in the build output
    for (const el of doc.querySelectorAll('img[src], script[src], link[rel=stylesheet][href]')) {
        const src = el.getAttribute('src') || el.getAttribute('href');
        if (/^(https?:|data:)/.test(src)) continue;
        const file = src.split('?')[0].replace(/^\//, '');
        if (!fs.existsSync(path.join(root, file))) errs.push(`missing asset: ${src}`);
    }

    // Assets referenced from inline style attributes, e.g. the gallery's
    // --slide-bg custom property. These resolve against the *stylesheet's*
    // URL once var() is substituted, not the document's, so they must be
    // root-relative. A bare "photo1.jpg" silently 404s from /_astro/.
    for (const el of doc.querySelectorAll('[style*="url("]')) {
        for (const m of el.getAttribute('style').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
            const u = m[1];
            if (/^(https?:|data:)/.test(u)) continue;
            if (!u.startsWith('/')) { errs.push(`inline-style url() must be root-relative: ${u}`); continue; }
            if (!fs.existsSync(path.join(root, u.replace(/^\//, '')))) errs.push(`missing inline-style asset: ${u}`);
        }
    }

    // Deferred gallery assets: the slider sets these from JS, so they get the
    // same root-relative treatment and existence check as the inline styles.
    for (const el of doc.querySelectorAll('[data-bg], img[data-src]')) {
        const u = el.getAttribute('data-bg') || el.getAttribute('data-src');
        if (/^(https?:|data:)/.test(u)) continue;
        const file = u.replace(/^\//, '');
        if (!fs.existsSync(path.join(root, file))) errs.push(`missing deferred asset: ${u}`);
        if (el.hasAttribute('data-bg') && !u.startsWith('/')) errs.push(`data-bg must be root-relative: ${u}`);
    }

    // Internal links must resolve to something that shipped. Relative hrefs
    // resolve against the page's own directory, which matters for /projects/*.
    const pageDir = path.dirname(path.join(root, page));
    for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (/^(https?:|mailto:|tel:|#)/.test(href)) continue;
        // Strip the query too: /projects.html?lens=defense is a real link to a
        // real file, and the lens is read from the query at runtime.
        const rel = href.split('#')[0].split('?')[0];
        if (!rel) continue;
        const target = rel.startsWith('/') ? path.join(root, rel.slice(1)) : path.join(pageDir, rel);
        if (!fs.existsSync(target)) errs.push(`broken link: ${href}`);
    }

    // Exactly one <h1> per page. og-preview is a build tool whose whole body
    // is card frames, not a document, so it is exempt from the outline rules.
    const isBuildTool = page === 'og-preview.html';
    if (!isBuildTool) {
        const h1s = doc.querySelectorAll('h1');
        if (h1s.length !== 1) errs.push(`expected 1 <h1>, found ${h1s.length}`);
    }

    // Command palette mounts everywhere the site chrome does.
    if (!doc.querySelector('.cmdk-overlay')) errs.push('command palette not injected');

    // Indexable pages carry a canonical URL; noindex pages deliberately do not.
    const isNoindex = !!doc.querySelector('meta[name=robots][content*=noindex]');
    const canonical = doc.querySelector('link[rel=canonical]');
    if (!isNoindex && !canonical) errs.push('missing canonical link');
    if (isNoindex && canonical) errs.push('noindex page should not have a canonical link');
    if (!doc.title.trim()) errs.push('missing <title>');

    // Fonts must be self-hosted, never hotlinked
    if (/fonts\.(googleapis|gstatic)\.com/.test(html)) errs.push('hotlinked webfont host');

    // Nav active-state is baked in at build time so it survives with JS off.
    // Only pages that are themselves nav entries highlight; detail pages
    // (crashguard, ieee-points) highlight nothing, matching prior behaviour.
    const NAV_PAGES = ['index.html', 'experience.html', 'projects.html', 'notes.html', 'skills.html', 'contact.html'];
    if (page !== '404.html' && page !== 'og-preview.html') {
        const active = doc.querySelectorAll('.nav-links a.active').length;
        const want = NAV_PAGES.includes(page) ? 1 : 0;
        if (active !== want) errs.push(`expected ${want} active nav link(s), found ${active}`);
    }

    // No page may ship placeholder media language: if an asset does not exist,
    // the page must carry an authored figure instead of an empty promise.
    const bodyText = doc.body.textContent || '';
    for (const phrase of ['coming soon', 'TBD', 'placeholder', 'lorem ipsum', 'image pending', 'photo pending']) {
        if (bodyText.toLowerCase().includes(phrase.toLowerCase())) errs.push(`placeholder text on page: "${phrase}"`);
    }

    // Third-party requests: the site must not contact anything on load. The
    // only external endpoint is the YouTube embed, and that is injected by the
    // facade after a click. Update this list deliberately, never by accident.
    const THIRD_PARTY_OK = [/youtube-nocookie\.com/, /youtube\.com\/embed/, /i\.ytimg\.com/, /linkedin\.com/, /mitchellcoding\.com/, /syndetix\.com/, /github\.com/];
    for (const el of doc.querySelectorAll('script[src], link[rel=stylesheet][href], img[src]')) {
        const src = el.getAttribute('src') || el.getAttribute('href');
        if (!/^https?:/.test(src)) continue;
        if (!THIRD_PARTY_OK.some((re) => re.test(src))) errs.push(`unexpected third-party request on load: ${src}`);
    }

    // Heading levels must not skip: an h1 followed by an h4 is a broken
    // outline for anyone navigating by heading.
    const levels = isBuildTool ? [] : [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1) {
            errs.push(`heading level skip: h${levels[i - 1]} followed by h${levels[i]}`);
            break;
        }
    }

    // Social card: every indexable page advertises one, and it has to exist.
    if (!isNoindex) {
        const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
        if (!og) errs.push('missing og:image');
        else {
            const file = og.replace('https://caberobertson.github.io/', '');
            if (!fs.existsSync(path.join(root, file))) errs.push(`og:image does not exist in the build: ${og}`);
        }
    }

    if (page.startsWith('notes/')) {
        if (!doc.querySelector('.doc-back')) errs.push('note missing back link');
        if (!doc.querySelector('time[datetime]')) errs.push('note missing machine-readable date');
        // Traceability: a note must point at the project carrying its numbers.
        if (!doc.querySelector('.note-foot a')) errs.push('note does not link back to its project');
    }

    if (page === 'projects.html') {
        // The lens is progressive enhancement: the chips must be real links
        // and every project must still be in the document unfiltered.
        const chips = doc.querySelectorAll('.lens-chip');
        if (chips.length < 4) errs.push(`expected 4 lens chips, found ${chips.length}`);
        for (const c of chips) {
            if (c.tagName !== 'A' || !c.getAttribute('href')) errs.push('lens chip is not a real link');
            if (!c.getAttribute('data-lens')) errs.push('lens chip missing data-lens');
        }
        const items = doc.querySelectorAll('[data-audiences]');
        if (!items.length) errs.push('project items carry no audience data');
        for (const it of items) {
            if (it.hasAttribute('hidden')) errs.push('a project ships hidden: the no-JS view must show everything');
        }
    }

    if (page.startsWith('projects/')) {
        if (!doc.querySelector('.doc-back')) errs.push('project page missing back link');
        if (!doc.querySelector('.project-body h2')) errs.push('project page has no write-up sections');
    }

    if (page === 'index.html') {
        // Scan strip: the seven-second read must be present and complete.
        if (!doc.querySelector('.scan-name')) errs.push('hero scan strip missing');
        const metrics = doc.querySelectorAll('.scan-metric').length;
        if (metrics < 3) errs.push(`expected 3-4 hero metrics, found ${metrics}`);
        if (!/ITAR/.test(doc.querySelector('.scan-facts')?.textContent || '')) errs.push('eligibility line missing from hero');
        // Flagship demo is a click-to-play facade, never a bare third-party iframe.
        const facade = doc.querySelector('.video-facade');
        if (!facade) errs.push('flagship video facade missing');
        if (!facade?.getAttribute('data-video-id')) errs.push('facade has no video id');
        if (/youtube\.com\/embed/.test(html)) errs.push('home page ships a YouTube iframe before interaction');
        const slides = doc.querySelectorAll('.slide').length;
        const dots = doc.querySelectorAll('.dots-container .dot').length;
        if (dots !== slides) errs.push(`slider dots (${dots}) != slides (${slides})`);
        if (!doc.querySelector('script[type="application/ld+json"]')) errs.push('JSON-LD structured data missing');
    }

    if (errs.length) {
        console.log(`FAIL ${page}:\n  - ` + errs.join('\n  - '));
        failures++;
    } else {
        console.log(`PASS ${page}`);
    }

    window.close();
}

if (failures) {
    console.error(`\n${failures} page(s) failed the smoke test.`);
    process.exit(1);
}
console.log('\nAll pages passed the smoke test.');
