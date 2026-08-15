/**
 * Structured data helpers.
 *
 * Only schema that describes something actually on the page belongs here.
 * Marking up claims a visitor cannot see is what gets a site's rich results
 * turned off, and there is nothing on this site worth risking that for.
 */
const SITE = 'https://caberobertson.github.io';

/** Stable node the other graphs point at instead of restating the Person. */
export const PERSON_REF = { '@type': 'Person', '@id': `${SITE}/#cabe`, name: 'Cabe Robertson' };

export interface Crumb {
    name: string;
    /** Root-relative, e.g. "/projects.html". Omit on the current page. */
    href?: string;
}

export const breadcrumbs = (crumbs: Crumb[]) => ({
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        ...(c.href ? { item: `${SITE}${c.href}` } : {}),
    })),
});

/** Wrap one or more nodes in a single @graph, which is one script tag. */
export const graph = (...nodes: unknown[]) =>
    JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
