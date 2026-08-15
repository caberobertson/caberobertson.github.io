import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects collection.
 *
 * The schema encodes the structure hardware reviewers actually read for
 * (problem, constraints, tradeoffs, results), so a page cannot quietly ship
 * missing its evidence. `audiences` drives the Phase 4 lens filter.
 *
 * Note on figures: this site does not ship "media pending" boxes. A project
 * either has real media, or it has an authored figure built from numbers that
 * already exist in the write-up. `figure` selects which.
 */
const projects = defineCollection({
    loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
    schema: z.object({
        title: z.string(),
        /** One-line outcome. Shown under the title and in the index grid. */
        outcome: z.string(),
        status: z.enum(['active', 'complete', 'archived']),
        /** Display string, e.g. "Jul 2026 - Present". Kept free-form on purpose. */
        period: z.string(),
        /** Sort key, newest first. */
        order: z.number(),
        audiences: z.array(z.enum(['defense', 'bigtech', 'neurotech'])).min(1),
        tags: z.array(z.string()).min(1),
        /** Context line: employer, competition, course. */
        context: z.string().optional(),
        role: z.string().optional(),
        /** Headline numbers rendered as the spec strip. */
        metrics: z
            .array(z.object({ value: z.string(), label: z.string() }))
            .default([]),
        /** Clickable proof. Anchors are fine; so are files and external links. */
        artifacts: z
            .array(z.object({ label: z.string(), href: z.string() }))
            .default([]),
        /** Which figure component the page renders. See ProjectFigure.astro. */
        figure: z
            .enum(['none', 'image', 'images', 'cost', 'doe', 'pipeline', 'video'])
            .default('none'),
        figureData: z.record(z.any()).optional(),
        /** Set when the page lives outside the collection, e.g. crashguard.astro. */
        externalPage: z.string().optional(),
        /** Flagged for the owner to confirm releasability before publishing. */
        releasabilityNote: z.string().optional(),
    }),
});

export const collections = { projects };
