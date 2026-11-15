/**
 * Seeded randomness for the lab models.
 *
 * Everything interactive on the site is reproducible from a seed, so a test
 * can assert on exact output and a visitor can be handed a sample number that
 * regenerates the same picture. Math.random is never used in the models.
 */

/** mulberry32: small, fast, and good enough for simulation at this scale. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Derive an independent stream from a seed and a small integer label. */
export function substream(seed, label) {
    let h = (seed ^ Math.imul(label + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return mulberry32((h ^ (h >>> 16)) >>> 0);
}

/** Standard normal sampler (Box-Muller) on top of a uniform generator. */
export function gaussian(rand) {
    let spare = null;
    return function normal() {
        if (spare !== null) {
            const s = spare;
            spare = null;
            return s;
        }
        let u = 0;
        while (u === 0) u = rand();
        const v = rand();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
}
