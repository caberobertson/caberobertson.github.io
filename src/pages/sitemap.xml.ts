import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://caberobertson.github.io';

/**
 * Routes are derived from the pages directory rather than hand-listed, so a
 * new page cannot be added without appearing here. Anything excluded below is
 * excluded for a reason, and the reason is written next to it.
 */
const EXCLUDED = new Set([
    '404',            // error page, not a destination
    'ieee-points',    // noindex: a chapter-internal program page
    'ieee-bricks',    // noindex: chapter fundraising, shared by link not search
    'og-preview',     // build tool: the source frames for the social cards
]);

/** Rough priority by depth and role. Search engines treat this as a hint. */
const priorityFor = (route: string) => {
    if (route === '') return '1.0';
    if (['projects', 'experience', 'crashguard', 'notes'].includes(route)) return '0.9';
    if (route.startsWith('projects/') || route.startsWith('notes/')) return '0.8';
    return '0.7';
};

export const GET: APIRoute = async () => {
    // Eager glob so the keys are known at build time.
    const modules = import.meta.glob('./**/*.astro', { eager: true });

    const staticRoutes = Object.keys(modules)
        .map((p) => p.replace(/^\.\//, '').replace(/\.astro$/, ''))
        // Dynamic routes are expanded from their collections below.
        .filter((r) => !r.includes('['))
        .filter((r) => !EXCLUDED.has(r))
        // build.format is 'file', so index.astro is the site root.
        .map((r) => (r === 'index' ? '' : r));

    const projects = (await getCollection('projects'))
        .filter((p) => !p.data.externalPage)
        .map((p) => `projects/${p.id}`);

    const notes = (await getCollection('notes'))
        .filter((n) => !n.data.draft)
        .map((n) => `notes/${n.id}`);

    const routes = [...new Set([...staticRoutes, ...projects, ...notes])].sort();

    const urls = routes
        .map((r) => {
            const loc = r === '' ? `${SITE}/` : `${SITE}/${r}.html`;
            return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priorityFor(r)}</priority>\n  </url>`;
        })
        .join('\n');

    return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
    );
};
