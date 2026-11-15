/**
 * Small DSP kit for the EEG filter bench: RBJ biquads, a radix-2 FFT, an
 * amplitude spectrum, and a synthetic single-channel EEG.
 *
 * The synthetic signal is a teaching model. Its ingredients are the ones a
 * dry-electrode recording actually contends with (1/f background, an alpha
 * rhythm that grows with the eyes closed, mains pickup, slow drift, blinks),
 * but the amplitudes are chosen for a clear picture, not fitted to data. No
 * capstone measurement is represented here.
 */
import { mulberry32, gaussian } from './rng.js';

/** RBJ cookbook biquad coefficients, normalised so a0 = 1. */
export function biquad(type, f0, fs, Q = Math.SQRT1_2) {
    const w0 = (2 * Math.PI * f0) / fs;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Q);
    let b0, b1, b2;
    if (type === 'lowpass') {
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = (1 - cos) / 2;
    } else if (type === 'highpass') {
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = (1 + cos) / 2;
    } else if (type === 'notch') {
        b0 = 1;
        b1 = -2 * cos;
        b2 = 1;
    } else {
        throw new Error(`unknown biquad type: ${type}`);
    }
    const a0 = 1 + alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** One biquad section, transposed direct form II. */
export class Biquad {
    constructor(coeffs) {
        this.c = coeffs;
        this.z1 = 0;
        this.z2 = 0;
    }

    reset() {
        this.z1 = 0;
        this.z2 = 0;
    }

    process(x) {
        const { b0, b1, b2, a1, a2 } = this.c;
        const y = b0 * x + this.z1;
        this.z1 = b1 * x - a1 * y + this.z2;
        this.z2 = b2 * x - a2 * y;
        return y;
    }
}

/** |H(e^jw)| of a biquad at frequency f. */
export function magnitudeResponse(c, f, fs) {
    const w = (2 * Math.PI * f) / fs;
    const cr = Math.cos(w), ci = -Math.sin(w);          // e^{-jw}
    const c2r = Math.cos(2 * w), c2i = -Math.sin(2 * w); // e^{-2jw}
    const nr = c.b0 + c.b1 * cr + c.b2 * c2r;
    const ni = c.b1 * ci + c.b2 * c2i;
    const dr = 1 + c.a1 * cr + c.a2 * c2r;
    const di = c.a1 * ci + c.a2 * c2i;
    return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re, im) {
    const n = re.length;
    if (n & (n - 1)) throw new Error('fft length must be a power of two');
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let ur = 1, ui = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = a + len / 2;
                const tr = re[b] * ur - im[b] * ui;
                const ti = re[b] * ui + im[b] * ur;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                const nur = ur * wr - ui * wi;
                ui = ur * wi + ui * wr;
                ur = nur;
            }
        }
    }
}

export const hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

/**
 * One-sided amplitude spectrum of a Hann-windowed block, scaled so a sinusoid
 * of amplitude A reads A at its bin (to within the window's scalloping loss).
 */
export function amplitudeSpectrum(x, fs) {
    const n = x.length;
    const w = hann(n);
    let wsum = 0;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        re[i] = x[i] * w[i];
        wsum += w[i];
    }
    fft(re, im);
    const half = n / 2;
    const freqs = new Float64Array(half);
    const amp = new Float64Array(half);
    for (let k = 0; k < half; k++) {
        freqs[k] = (k * fs) / n;
        amp[k] = (2 * Math.hypot(re[k], im[k])) / wsum;
    }
    return { freqs, amp };
}

/** RMS amplitude across a band of an amplitude spectrum. */
export function bandAmplitude(freqs, amp, f1, f2) {
    let sum = 0;
    for (let k = 0; k < freqs.length; k++) if (freqs[k] >= f1 && freqs[k] <= f2) sum += amp[k] * amp[k];
    return Math.sqrt(sum / 2);
}

/**
 * Mains pickup from the potential-divider effect: common-mode voltage on the
 * body appears differentially in proportion to the electrode impedance
 * mismatch over the amplifier's input impedance. Returns microvolts.
 */
export function mainsPickupUv(contactKOhm, { vcmMv = 50, mismatch = 0.2, zinMOhm = 200 } = {}) {
    return (vcmMv * 1e3 * (contactKOhm * 1e3 * mismatch)) / (zinMOhm * 1e6);
}

/** Thermal noise of the contact resistance over a bandwidth, in microvolts RMS. */
export function thermalNoiseUv(contactKOhm, bandwidthHz = 100, tempK = 300) {
    return Math.sqrt(4 * 1.380649e-23 * tempK * contactKOhm * 1e3 * bandwidthHz) * 1e6;
}

export class EegSynth {
    constructor({ fs = 250, seed = 11 } = {}) {
        this.fs = fs;
        const rand = mulberry32(seed);
        this.normal = gaussian(rand);
        this.n = 0;
        this.eyesClosed = true;
        this.contactKOhm = 150;
        this.mainsHz = 60;
        this.pink = [0, 0, 0];
        this.env = 1;      // slow alpha envelope
        this.phase = 0;    // alpha phase, so frequency can wander
        this.blink = 0;    // samples remaining in a blink
    }

    triggerBlink() {
        this.blink = Math.round(0.35 * this.fs);
    }

    next() {
        const t = this.n / this.fs;
        this.n += 1;
        const white = this.normal();

        // 1/f background (Paul Kellet's economy pink filter), about 6 uV RMS.
        const p = this.pink;
        p[0] = 0.99765 * p[0] + white * 0.099046;
        p[1] = 0.963 * p[1] + white * 0.2965164;
        p[2] = 0.57 * p[2] + white * 1.0526913;
        const background = (p[0] + p[1] + p[2] + white * 0.1848) * 2.4;

        // Alpha near 10 Hz, waxing and waning, stronger with the eyes closed.
        this.env += 0.004 * (1 + 0.6 * this.normal() - this.env);
        this.phase += (2 * Math.PI * (10 + 0.4 * Math.sin(0.7 * t))) / this.fs;
        const alpha = (this.eyesClosed ? 18 : 4) * Math.max(0, this.env) * Math.sin(this.phase);

        const mains = mainsPickupUv(this.contactKOhm) * Math.sin(2 * Math.PI * this.mainsHz * t);
        const thermal = thermalNoiseUv(this.contactKOhm, this.fs / 2) * this.normal();
        const drift = 45 * Math.sin(2 * Math.PI * 0.12 * t) + 30;

        let blink = 0;
        if (this.blink > 0) {
            const total = Math.round(0.35 * this.fs);
            blink = 130 * Math.sin((Math.PI * (total - this.blink)) / total);
            this.blink -= 1;
        }
        return background + alpha + mains + thermal + drift + blink;
    }
}

/** The bench's filter chain: high-pass, low-pass, notch, each switchable. */
export class FilterChain {
    constructor(fs = 250) {
        this.fs = fs;
        this.enabled = { highpass: true, lowpass: true, notch: true };
        this.coeffs = {
            highpass: biquad('highpass', 1, fs),
            lowpass: biquad('lowpass', 40, fs),
            notch: biquad('notch', 60, fs, 30),
        };
        this.sections = Object.fromEntries(Object.entries(this.coeffs).map(([k, c]) => [k, new Biquad(c)]));
    }

    process(x) {
        let y = x;
        for (const k of ['highpass', 'notch', 'lowpass']) {
            // Every section keeps running so switching one in is seamless.
            const out = this.sections[k].process(y);
            if (this.enabled[k]) y = out;
        }
        return y;
    }

    /** Combined magnitude response of the enabled sections at frequency f. */
    response(f) {
        let m = 1;
        for (const k of Object.keys(this.coeffs)) if (this.enabled[k]) m *= magnitudeResponse(this.coeffs[k], f, this.fs);
        return m;
    }
}
