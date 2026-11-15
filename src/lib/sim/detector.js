/**
 * CrashGuard impact detection, as a pure model.
 *
 * This mirrors the pipeline documented on /crashguard.html, constant for
 * constant: a +/-16 g accelerometer sampled at 100 Hz, a 100-sample still-boot
 * calibration of the gravity vector, dynamic acceleration by vector
 * subtraction, a median-of-three filter, a 5.0 g threshold confirmed over
 * consecutive samples, an independent railed-axis check, and a 10 s cancel
 * window. It has no DOM and no clock; it is driven one sample at a time, so
 * the same code runs under the unit tests, behind the lab's canvas, and on a
 * phone's real accelerometer.
 *
 * One value here is NOT from the firmware: the page says events are confirmed
 * over "consecutive samples" without publishing how many. DEFAULTS.confirm is
 * the model's choice (three, the smallest count that also rejects a two-sample
 * glitch after the median filter) and the lab exposes it as a control.
 */
import { mulberry32, gaussian } from './rng.js';

export const DEFAULTS = Object.freeze({
    fs: 100,              // Hz
    fullScale: 16,        // g per axis
    threshold: 5.0,       // g of dynamic acceleration
    calSamples: 100,      // still-boot baseline
    confirm: 3,           // consecutive samples (model default, see above)
    railFraction: 0.95,   // of full scale, per axis
    peakHoldS: 3,         // dashboard peak hold
    crashWindowS: 0.4,    // crash peak window, centred on the trigger
    cancelWindowS: 10,    // occupant cancel window
    median: true,
    saturation: true,
    method: 'vector',     // 'vector' (shipped) or 'magnitude' (rejected)
});

export const norm = (v) => Math.hypot(v[0], v[1], v[2]);

/** The ADC: each axis clips independently at full scale. */
export const clipToRange = (v, fullScale = DEFAULTS.fullScale) =>
    v.map((c) => Math.max(-fullScale, Math.min(fullScale, c)));

export const median3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** Shipped method: remove the whole gravity vector, then take the length. */
export const dynamicVector = (a, g0) =>
    Math.hypot(a[0] - g0[0], a[1] - g0[1], a[2] - g0[2]) / norm(g0);

/** Rejected method: subtract only gravity's magnitude. Direction-dependent. */
export const dynamicMagnitude = (a, g0) => Math.abs(norm(a) - norm(g0)) / norm(g0);

/** Largest raw magnitude the part can report: every axis pinned at once. */
export const sensorCeiling = (fullScale = DEFAULTS.fullScale) => fullScale * Math.sqrt(3);

/**
 * Apparent dynamic acceleration from rotating a still board by theta after
 * calibration: the chord between two unit gravity vectors. Tops out at 2 g.
 */
export const rotationFloor = (theta) => 2 * Math.sin(theta / 2);

export class Detector {
    constructor(options = {}) {
        this.cfg = { ...DEFAULTS, ...options };
        this.recalibrate();
    }

    /** Change a setting live without disturbing calibration. */
    set(options) {
        Object.assign(this.cfg, options);
    }

    recalibrate() {
        this.g0 = null;
        this.calSum = [0, 0, 0];
        this.calCount = 0;
        this.n = 0;
        this.hist = [];
        this.recent = [];
        this.rearm();
    }

    rearm() {
        this.state = this.g0 ? 'ARMED' : 'CALIBRATING';
        this.over = 0;
        this.rail = 0;
        this.countdown = 0;
        this.trigger = null;
        this.triggerAt = -1;
        this.crashPeak = 0;
        this.hold = 0;
        this.holdAt = 0;
    }

    /** The occupant pressed CANCEL inside the window. */
    cancel() {
        if (this.state !== 'COUNTDOWN') return false;
        this.rearm();
        return true;
    }

    /**
     * Feed one raw sample, in g, as the sensor would see it before clipping.
     * Returns a frame describing everything the detector concluded from it.
     */
    push(raw) {
        const c = this.cfg;
        const a = clipToRange(raw, c.fullScale);
        this.n += 1;

        if (!this.g0) {
            for (let i = 0; i < 3; i++) this.calSum[i] += a[i];
            this.calCount += 1;
            if (this.calCount >= c.calSamples) {
                this.g0 = this.calSum.map((s) => s / this.calCount);
                this.state = 'ARMED';
                // Calibration is a still boot, so the readings before the
                // first armed sample are zero by definition. Priming the
                // history means the filter is in force from sample one; left
                // empty, a glitch on the first two samples passed unfiltered.
                this.hist = [0, 0];
            }
            return this.frame(a, 0, 0, false, null);
        }

        const dRaw = c.method === 'magnitude' ? dynamicMagnitude(a, this.g0) : dynamicVector(a, this.g0);
        this.hist.push(dRaw);
        if (this.hist.length > 3) this.hist.shift();
        const d = c.median && this.hist.length === 3 ? median3(this.hist[0], this.hist[1], this.hist[2]) : dRaw;

        this.over = d > c.threshold ? this.over + 1 : 0;
        const railed = a.some((v) => Math.abs(v) >= c.railFraction * c.fullScale);
        this.rail = railed ? this.rail + 1 : 0;

        // Dashboard peak: hold the highest recent value, then follow live again.
        if (d >= this.hold || this.n - this.holdAt > c.peakHoldS * c.fs) {
            this.hold = d;
            this.holdAt = this.n;
        }

        // Crash peak: only the window around the trigger counts.
        const half = Math.round((c.crashWindowS * c.fs) / 2);
        this.recent.push(d);
        if (this.recent.length > half) this.recent.shift();

        let fired = null;
        if (this.state === 'ARMED') {
            if (this.over >= c.confirm) fired = 'threshold';
            else if (c.saturation && this.rail >= c.confirm) fired = 'saturation';
            if (fired) {
                this.state = 'COUNTDOWN';
                this.trigger = fired;
                this.triggerAt = this.n;
                this.countdown = Math.round(c.cancelWindowS * c.fs);
                this.crashPeak = Math.max(...this.recent);
            }
        } else if (this.state === 'COUNTDOWN') {
            if (this.n - this.triggerAt <= half) this.crashPeak = Math.max(this.crashPeak, d);
            this.countdown -= 1;
            if (this.countdown <= 0) this.state = 'CALLED';
        }

        return this.frame(a, dRaw, d, railed, fired);
    }

    frame(a, dRaw, d, railed, fired) {
        const c = this.cfg;
        return {
            n: this.n,
            a,
            dRaw,
            d,
            railed,
            fired,
            state: this.state,
            trigger: this.trigger,
            over: this.over,
            rail: this.rail,
            hold: this.hold,
            crashPeak: this.crashPeak,
            countdownS: this.countdown / c.fs,
            calProgress: this.g0 ? 1 : this.calCount / c.calSamples,
        };
    }
}

/**
 * Synthetic accelerometer for the lab: gravity, sensor noise, and injected
 * events. Reports what the proof mass would feel, in g, before the ADC clips
 * it. The board can be tilted after calibration to show the rotation floor.
 */
export class SignalSource {
    constructor({ fs = DEFAULTS.fs, noise = 0.012, seed = 7 } = {}) {
        this.fs = fs;
        this.noise = noise;
        this.normal = gaussian(mulberry32(seed));
        this.tilt = 0;
        this.events = [];
    }

    /** Gravity as the sensor reads it at the current tilt (about the x axis). */
    gravity() {
        return [0, Math.sin(this.tilt), Math.cos(this.tilt)];
    }

    /** Unit vector for a named impact direction, relative to gravity. */
    direction(name) {
        const g = this.gravity();
        if (name === 'with') return g;
        if (name === 'against') return g.map((v) => -v);
        if (name === 'diagonal') return [1, 1, 1].map((v) => v / Math.sqrt(3));
        return [1, 0, 0]; // sideways: perpendicular to gravity at any tilt
    }

    /** Queue an event. shape: 'halfsine' | 'spike' | 'hold'. */
    fire({ peak, durationS = 0.08, dir = 'sideways', shape = 'halfsine' }) {
        const total = shape === 'spike' ? 1 : Math.max(1, Math.round(durationS * this.fs));
        this.events.push({ peak, total, k: 0, shape, dir: this.direction(dir) });
    }

    next() {
        const a = this.gravity().map((g) => g + this.noise * this.normal());
        for (const e of this.events) {
            let s;
            if (e.shape === 'spike') s = 1;
            else if (e.shape === 'hold') {
                // Smooth on, hold, smooth off: braking, not an impact.
                const x = e.k / e.total;
                s = x < 0.15 ? x / 0.15 : x > 0.85 ? (1 - x) / 0.15 : 1;
            } else s = Math.sin((Math.PI * (e.k + 0.5)) / e.total);
            for (let i = 0; i < 3; i++) a[i] += e.peak * s * e.dir[i];
            e.k += 1;
        }
        this.events = this.events.filter((e) => e.k < e.total);
        return a;
    }
}
