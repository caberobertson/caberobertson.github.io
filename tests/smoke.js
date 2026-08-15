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
const pages = ['index.html', 'experience.html', 'projects.html', 'skills.html', 'contact.html', 'crashguard.html', 'ieee-points.html', '404.html'];

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

    // Internal links must resolve to something that shipped
    for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (/^(https?:|mailto:|tel:|#)/.test(href)) continue;
        const file = href.split('#')[0].replace(/^\//, '');
        if (file && !fs.existsSync(path.join(root, file))) errs.push(`broken link: ${href}`);
    }

    // Exactly one <h1> per page
    const h1s = doc.querySelectorAll('h1');
    if (h1s.length !== 1) errs.push(`expected 1 <h1>, found ${h1s.length}`);

    // Command palette mounts everywhere
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
    const NAV_PAGES = ['index.html', 'experience.html', 'projects.html', 'skills.html', 'contact.html'];
    if (page !== '404.html') {
        const active = doc.querySelectorAll('.nav-links a.active').length;
        const want = NAV_PAGES.includes(page) ? 1 : 0;
        if (active !== want) errs.push(`expected ${want} active nav link(s), found ${active}`);
    }

    if (page === 'index.html') {
        const phrases = JSON.parse(doc.querySelector('#typed-text').dataset.phrases);
        if (!Array.isArray(phrases) || !phrases.length) errs.push('typed phrases malformed');
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
