/* ==========================================================================
   DOM smoke test — runs every page through jsdom with the real scripts,
   then asserts that local assets resolve, internal links aren't broken, the
   command palette mounts, and key interactive widgets initialize.
   No browser or network required, so it runs anywhere (including CI).
   ========================================================================== */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'experience.html', 'projects.html', 'skills.html', 'contact.html', '404.html'];
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

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
        window.eval(mainJs);
    } catch (e) {
        console.log(`FAIL ${page}: main.js threw: ${e.message}`);
        failures++;
        continue;
    }

    const doc = window.document;
    const errs = [];

    // Every local asset referenced must exist on disk
    for (const el of doc.querySelectorAll('img[src], script[src], link[rel=stylesheet][href]')) {
        const src = el.getAttribute('src') || el.getAttribute('href');
        if (/^(https?:|data:)/.test(src)) continue;
        if (!fs.existsSync(path.join(root, src))) errs.push(`missing asset: ${src}`);
    }

    // Internal links must resolve to a real file
    for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (/^(https?:|mailto:|tel:|#)/.test(href)) continue;
        const file = href.split('#')[0];
        if (file && !fs.existsSync(path.join(root, file))) errs.push(`broken link: ${href}`);
    }

    // Every page should expose exactly one <h1>
    const h1s = doc.querySelectorAll('h1');
    if (h1s.length !== 1) errs.push(`expected 1 <h1>, found ${h1s.length}`);

    // Command palette mounts on every page
    if (!doc.querySelector('.cmdk-overlay')) errs.push('command palette not injected');

    // Page-specific assertions
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
