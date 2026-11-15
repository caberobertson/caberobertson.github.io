/**
 * Hamming(7,4) over a binary symmetric channel, as a pure model.
 *
 * This is the small textbook instance of the experiment behind the channel
 * decoding simulations: encode with a generator matrix, pass the word through
 * a noisy channel, decode from the syndrome H.r^T, and count frame and bit
 * errors against the channel's crossover probability. It is an illustration
 * of the method, not a port of the research code, which is not published.
 *
 * Codeword layout, positions 0..6: [d1 d2 d3 d4 | p1 p2 p3]. The integer
 * forms pack position i into bit i so the Monte Carlo loop runs on plain
 * bitwise operations.
 */
import { mulberry32 } from './rng.js';

/** Parity part of the generator: row i says which parities data bit i feeds. */
export const P = [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
];

/** G = [I4 | P], 4 x 7. */
export const G = P.map((row, i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)).concat(row));

/** H = [P^T | I3], 3 x 7. Its seven columns are the seven nonzero 3-bit words. */
export const H = [0, 1, 2].map((j) =>
    P.map((row) => row[j]).concat([0, 1, 2].map((k) => (k === j ? 1 : 0))),
);

export const N = 7;
export const K = 4;
export const DATA_MASK = 0b0001111;

export const popcount = (x) => {
    let c = 0;
    for (let v = x; v; v &= v - 1) c += 1;
    return c;
};

export const toBits = (x, len) => Array.from({ length: len }, (_, i) => (x >> i) & 1);
export const fromBits = (bits) => bits.reduce((acc, b, i) => acc | (b << i), 0);

/** Encode a 4-bit message (array of 0/1) into a 7-bit codeword. */
export function encode(msg) {
    return G[0].map((_, col) => msg.reduce((acc, m, row) => acc ^ (m & G[row][col]), 0));
}

/** Syndrome s = H.r^T over GF(2), as an array of three bits. */
export function syndrome(r) {
    return H.map((row) => row.reduce((acc, h, k) => acc ^ (h & r[k]), 0));
}

/** Position whose column of H equals the syndrome, or -1 for a zero syndrome. */
export function errorPosition(s) {
    if (!s.some(Boolean)) return -1;
    for (let k = 0; k < N; k++) {
        if (H.every((row, j) => row[k] === s[j])) return k;
    }
    return -1;
}

/** Full decode of a received word: syndrome, the bit flipped, and the result. */
export function decode(r) {
    const s = syndrome(r);
    const flipped = errorPosition(s);
    const codeword = r.slice();
    if (flipped >= 0) codeword[flipped] ^= 1;
    return { syndrome: s, flipped, codeword, message: codeword.slice(0, K) };
}

// ---- Integer tables for the Monte Carlo loop --------------------------------

/** ENC[m] is the codeword for message m, 0..15. */
export const ENC = Uint8Array.from({ length: 16 }, (_, m) => fromBits(encode(toBits(m, K))));

/** SYN[r] is the syndrome of received word r, 0..127, packed into 3 bits. */
export const SYN = Uint8Array.from({ length: 128 }, (_, r) => fromBits(syndrome(toBits(r, N))));

/** CORR[s] is the bitmask the decoder flips for syndrome s. */
export const CORR = Uint8Array.from({ length: 8 }, (_, s) => {
    const pos = errorPosition(toBits(s, 3));
    return pos < 0 ? 0 : 1 << pos;
});

export const decodeInt = (r) => r ^ CORR[SYN[r]];

/**
 * Exact frame and bit error rates after decoding, by enumerating all 128
 * error patterns. The code is linear, so the all-zero codeword stands in for
 * every codeword: whatever the decoder leaves behind is the decoding error.
 */
export function exactRates(p) {
    let fer = 0;
    let ber = 0;
    for (let e = 0; e < 128; e++) {
        const w = popcount(e);
        const prob = p ** w * (1 - p) ** (N - w);
        const residual = decodeInt(e);
        if (residual !== 0) {
            fer += prob;
            ber += (prob * popcount(residual & DATA_MASK)) / K;
        }
    }
    return { fer, ber };
}

/** Closed form for the frame error rate: more than one bit in error. */
export const closedFormFer = (p) => 1 - (1 - p) ** 7 - 7 * p * (1 - p) ** 6;

/** Crossover probabilities swept by the lab, matching the published figure. */
export const SWEEP = [0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

/**
 * Incremental Monte Carlo: random messages through a BSC, decoded, counted.
 * step() adds frames at every sweep point so the estimate can be refined a
 * little per animation frame without blocking the page.
 */
export class MonteCarlo {
    constructor(ps = SWEEP, seed = 2026) {
        this.ps = ps;
        this.rand = mulberry32(seed);
        this.frames = new Float64Array(ps.length);
        this.frameErrors = new Float64Array(ps.length);
        this.bitErrors = new Float64Array(ps.length);
    }

    step(framesPerPoint = 1000) {
        const rand = this.rand;
        for (let i = 0; i < this.ps.length; i++) {
            const p = this.ps[i];
            let fe = 0;
            let be = 0;
            for (let f = 0; f < framesPerPoint; f++) {
                const c = ENC[(rand() * 16) | 0];
                let e = 0;
                for (let b = 0; b < N; b++) if (rand() < p) e |= 1 << b;
                const diff = decodeInt(c ^ e) ^ c;
                if (diff) {
                    fe += 1;
                    be += popcount(diff & DATA_MASK);
                }
            }
            this.frames[i] += framesPerPoint;
            this.frameErrors[i] += fe;
            this.bitErrors[i] += be;
        }
    }

    get totalFrames() {
        return this.frames.reduce((a, b) => a + b, 0);
    }

    results() {
        return this.ps.map((p, i) => ({
            p,
            frames: this.frames[i],
            fer: this.frames[i] ? this.frameErrors[i] / this.frames[i] : NaN,
            ber: this.frames[i] ? this.bitErrors[i] / (this.frames[i] * K) : NaN,
        }));
    }
}
