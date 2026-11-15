// Builds the single-file Claude artifact version of the Resume Tailor.
// Run `npm run build` first: the site context is read from dist/, so the
// artifact always carries the same source material the site publishes.
//   node scripts/build-tailor-artifact.mjs [output.html]
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const contextFile = path.join(root, 'dist', 'resume-context.json');
if (!fs.existsSync(contextFile)) {
    console.error('dist/resume-context.json not found. Run `npm run build` first.');
    process.exit(1);
}
const out = path.resolve(process.argv[2] ?? path.join(root, 'dist', 'resume-tailor-artifact.html'));

const result = await build({
    entryPoints: [path.join(root, 'src', 'artifact', 'main.js')],
    bundle: true,
    format: 'iife',
    minify: false,
    write: false,
    define: { __CONTEXT__: fs.readFileSync(contextFile, 'utf8') },
});
// A literal "</script" inside the bundle would end the inline script early.
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = fs.readFileSync(path.join(root, 'src', 'artifact', 'page.html'), 'utf8');
fs.writeFileSync(out, page.replace('/*__BUNDLE__*/', () => js));
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
