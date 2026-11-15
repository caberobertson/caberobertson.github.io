/**
 * Synthetic data generation with domain randomization, at browser scale.
 *
 * The idea being illustrated: when the scene is built in simulation, every
 * image comes with labels that are exact by construction, and randomizing the
 * scene (how many defects, how big, how it is lit, what the surface looks
 * like) is what makes a model trained on those images hold up on real ones.
 *
 * This is a teaching model written for this site. It is a heightfield with
 * Lambertian shading, not a renderer. It is not NVIDIA Isaac Sim output and it
 * contains no data, geometry, or parameters from any employer's pipeline.
 *
 * Each randomized parameter group draws from its own stream derived from the
 * sample seed, so switching one group off freezes only that group.
 */
import { substream } from './rng.js';

export const RANDOMIZE_ALL = Object.freeze({ layout: true, size: true, light: true, surface: true });

/** Values used for a parameter group when its randomization is switched off. */
export const NOMINAL = Object.freeze({
    count: 4,
    layoutSeed: 20261,
    radius: 0.07,
    depth: 1,
    azimuth: (135 * Math.PI) / 180,
    elevation: (35 * Math.PI) / 180,
    tone: 0.5,
    roughness: 0.5,
    seams: 4,
});

export const RANGES = Object.freeze({
    count: [1, 8],
    radius: [0.035, 0.12],
    depth: [0.6, 1.4],
    elevationDeg: [15, 65],
    seams: [2, 5],
});

const lerp = (a, b, t) => a + (b - a) * t;
const MARGIN = 0.12;
const MIN_SPACING = 0.2;
const RIM = 1.25; // crater extent, in radii, including the raised rim

/** Draw one fully specified scene from a seed. */
export function generateSample(seed, randomize = RANDOMIZE_ALL) {
    // Layout (how many craters and where) is one group: with it switched off,
    // every sample shares the same scene, so the remaining groups can be seen
    // acting on identical geometry.
    const layoutSeed = randomize.layout ? seed : NOMINAL.layoutSeed;
    const rCount = substream(layoutSeed, 1);
    const rPos = substream(layoutSeed, 3);
    const rSize = substream(seed, 2);
    const rLight = substream(seed, 4);
    const rSurf = substream(seed, 5);

    const span = RANGES.count[1] - RANGES.count[0] + 1;
    const count = randomize.layout ? RANGES.count[0] + Math.floor(rCount() * span) : NOMINAL.count;

    // Positions use a fixed spacing rule, independent of radius, so that
    // freezing size leaves every crater where it was.
    const centres = [];
    for (let i = 0; i < count; i++) {
        let x = 0.5, y = 0.5;
        for (let attempt = 0; attempt < 40; attempt++) {
            x = lerp(MARGIN, 1 - MARGIN, rPos());
            y = lerp(MARGIN, 1 - MARGIN, rPos());
            if (centres.every((c) => Math.hypot(c.x - x, c.y - y) >= MIN_SPACING)) break;
        }
        centres.push({ x, y });
    }

    const craters = centres.map(({ x, y }) => {
        const r = randomize.size ? lerp(RANGES.radius[0], RANGES.radius[1], rSize()) : NOMINAL.radius;
        const depth = randomize.size ? lerp(RANGES.depth[0], RANGES.depth[1], rSize()) : NOMINAL.depth;
        return { x, y, r, depth };
    });

    const azimuth = randomize.light ? rLight() * 2 * Math.PI : NOMINAL.azimuth;
    const elevation = randomize.light
        ? (lerp(RANGES.elevationDeg[0], RANGES.elevationDeg[1], rLight()) * Math.PI) / 180
        : NOMINAL.elevation;

    const tone = randomize.surface ? rSurf() : NOMINAL.tone;
    const roughness = randomize.surface ? rSurf() : NOMINAL.roughness;
    const seamSpan = RANGES.seams[1] - RANGES.seams[0] + 1;
    const seams = randomize.surface ? RANGES.seams[0] + Math.floor(rSurf() * seamSpan) : NOMINAL.seams;

    return { seed, craters, light: { azimuth, elevation }, surface: { tone, roughness, seams } };
}

/** Unit vector pointing from the surface toward the light. */
export function lightVector({ azimuth, elevation }) {
    return [Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation)];
}

/** Crater profile at normalised radius rho = r / R, in units of depth. */
export function craterProfile(rho) {
    const bowl = rho < 1 ? -(1 - rho * rho) : 0;
    const rim = 0.25 * Math.exp(-(((rho - 1) / 0.22) ** 2));
    return bowl + rim;
}

/** Deterministic lattice hash in [0, 1). */
function lattice(seed, ix, iy) {
    let h = (seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(seed, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lattice(seed, ix, iy), b = lattice(seed, ix + 1, iy);
    const c = lattice(seed, ix, iy + 1), d = lattice(seed, ix + 1, iy + 1);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy) - 0.5;
}

/**
 * Surface height on an S x S grid. Heights and lengths share one unit (the
 * image width), so slopes are physical and the shading needs no fudge factor.
 */
export function heightfield(sample, S) {
    const h = new Float32Array(S * S);
    const { roughness, seams } = sample.surface;
    const rough = 0.0006 + 0.0022 * roughness;
    for (let j = 0; j < S; j++) {
        const y = (j + 0.5) / S;
        for (let i = 0; i < S; i++) {
            const x = (i + 0.5) / S;
            let v = rough * (valueNoise(sample.seed, x * 14, y * 14) + 0.5 * valueNoise(sample.seed + 1, x * 41, y * 41));
            // Panel seams: shallow grooves on a regular grid.
            const gx = Math.abs(((x * seams + 0.5) % 1) - 0.5) / seams;
            const gy = Math.abs(((y * seams + 0.5) % 1) - 0.5) / seams;
            const g = Math.min(gx, gy);
            v -= 0.0035 * Math.exp(-((g / 0.0035) ** 2));
            h[j * S + i] = v;
        }
    }
    for (const c of sample.craters) {
        const depth = 0.35 * c.r * c.depth;
        const reach = c.r * 2;
        const i0 = Math.max(0, Math.floor((c.x - reach) * S)), i1 = Math.min(S - 1, Math.ceil((c.x + reach) * S));
        const j0 = Math.max(0, Math.floor((c.y - reach) * S)), j1 = Math.min(S - 1, Math.ceil((c.y + reach) * S));
        for (let j = j0; j <= j1; j++) {
            const dy = (j + 0.5) / S - c.y;
            for (let i = i0; i <= i1; i++) {
                const dx = (i + 0.5) / S - c.x;
                h[j * S + i] += depth * craterProfile(Math.hypot(dx, dy) / c.r);
            }
        }
    }
    return h;
}

/**
 * Render a sample to RGBA. Lambertian shading from the heightfield's normals,
 * exposed so that flat ground lands at mid grey whatever the sun angle, the
 * way a camera's auto-exposure would.
 */
export function renderSample(sample, S) {
    const h = heightfield(sample, S);
    const L = lightVector(sample.light);
    const flat = L[2];
    const out = new Uint8ClampedArray(S * S * 4);
    const { tone } = sample.surface;
    // Cool anodised grey through to a warmer foil tone.
    const tint = [lerp(0.86, 1.06, tone), lerp(0.9, 0.95, tone), lerp(1.0, 0.74, tone)];
    for (let j = 0; j < S; j++) {
        const jm = Math.max(0, j - 1), jp = Math.min(S - 1, j + 1);
        for (let i = 0; i < S; i++) {
            const im = Math.max(0, i - 1), ip = Math.min(S - 1, i + 1);
            const dhdx = ((h[j * S + ip] - h[j * S + im]) * S) / (ip - im);
            const dhdy = ((h[jp * S + i] - h[jm * S + i]) * S) / (jp - jm);
            const inv = 1 / Math.hypot(dhdx, dhdy, 1);
            const ndotl = Math.max(0, (-dhdx * L[0] - dhdy * L[1] + L[2]) * inv);
            const lum = 0.1 + 0.46 * (ndotl / flat);
            const o = (j * S + i) * 4;
            for (let k = 0; k < 3; k++) out[o + k] = 255 * Math.pow(Math.min(1, lum * tint[k]), 1 / 2.2);
            out[o + 3] = 255;
        }
    }
    return out;
}

/** Ground-truth boxes, normalised to [0, 1], clipped to the frame. */
export function boundingBoxes(sample) {
    return sample.craters.map((c) => {
        const x0 = Math.max(0, c.x - c.r * RIM), y0 = Math.max(0, c.y - c.r * RIM);
        const x1 = Math.min(1, c.x + c.r * RIM), y1 = Math.min(1, c.y + c.r * RIM);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    });
}

/** The record a dataset writer would emit beside the image (COCO-style boxes). */
export function annotation(sample, size = 512) {
    const deg = (rad) => Math.round((rad * 180) / Math.PI);
    return {
        image: `sample_${String(sample.seed).padStart(6, '0')}.png`,
        width: size,
        height: size,
        light: { azimuth_deg: deg(sample.light.azimuth), elevation_deg: deg(sample.light.elevation) },
        annotations: boundingBoxes(sample).map((b, id) => ({
            id,
            category: 'crater',
            bbox: [b.x, b.y, b.w, b.h].map((v) => Math.round(v * size)),
        })),
    };
}
