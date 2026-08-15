/**
 * The three audiences this site is written for, weighted equally.
 *
 * `id` is the value used in ?lens= and in a project's `audiences` array, so
 * the schema enum and this list have to stay in step. Anything reading a lens
 * from a URL must validate against `isLens` before trusting it.
 */
export const LENSES = [
    {
        id: 'all',
        label: 'All work',
        blurb: 'Everything, newest first.',
    },
    {
        id: 'defense',
        label: 'Defense & aerospace',
        blurb: 'RF and electronic warfare, unmanned systems, ITAR-aware production.',
    },
    {
        id: 'bigtech',
        label: 'Big tech hardware',
        blurb: 'Embedded firmware, board bring-up, test and design of experiments.',
    },
    {
        id: 'neurotech',
        label: 'Neurotech & BCI',
        blurb: 'Biopotential acquisition, sensor fusion, real-time pipelines.',
    },
] as const;

export type LensId = (typeof LENSES)[number]['id'];

const IDS = new Set<string>(LENSES.map((l) => l.id));

export const isLens = (v: unknown): v is LensId => typeof v === 'string' && IDS.has(v);
