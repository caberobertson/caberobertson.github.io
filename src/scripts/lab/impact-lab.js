/* ==========================================================================
   Impact detector lab: the CrashGuard pipeline from src/lib/sim/detector.js,
   driven at 100 Hz and drawn as a strip chart, with an optional live feed from
   a phone's accelerometer.
   ========================================================================== */
import { Detector, SignalSource, DEFAULTS, sensorCeiling } from '../../lib/sim/detector.js';
import { palette, fit, loopWhileVisible, onRedrawNeeded, mono, reducedMotion, tickStep } from './plot.js';

const G0 = 9.80665;
const CEILING = sensorCeiling();

/** Scrolling strip chart of dynamic acceleration with its reference lines. */
class Scope {
    constructor(canvas, { samples = 800, fs = DEFAULTS.fs, compact = false } = {}) {
        this.canvas = canvas;
        this.N = samples;
        this.fs = fs;
        this.compact = compact;
        this.d = new Float32Array(samples);
        this.raw = new Float32Array(samples);
        this.alt = new Float32Array(samples);
        this.total = 0;
        this.marks = [];
        this.yMax = 8;
        this.threshold = DEFAULTS.threshold;
        this.showAlt = false;
        this.colors = palette();
    }

    push(d, raw, alt = 0) {
        const i = this.total % this.N;
        this.d[i] = d;
        this.raw[i] = raw;
        this.alt[i] = alt;
        this.total += 1;
    }

    mark(label) {
        this.marks.push({ at: this.total, label });
    }

    clear() {
        this.d.fill(0);
        this.raw.fill(0);
        this.alt.fill(0);
        this.marks = [];
    }

    draw(dt = 0.016) {
        const { ctx, w, h } = fit(this.canvas);
        const c = this.colors;
        const pad = this.compact ? { l: 30, r: 8, t: 8, b: 16 } : { l: 40, r: 12, t: 12, b: 22 };
        const pw = w - pad.l - pad.r;
        const ph = h - pad.t - pad.b;
        const shown = Math.min(this.total, this.N);

        // Ease the vertical range toward whatever is worth seeing.
        let peak = this.threshold;
        for (let i = 0; i < shown; i++) peak = Math.max(peak, this.d[i], this.showAlt ? this.alt[i] : 0);
        const target = Math.min(56, Math.max(8, peak * 1.25));
        this.yMax += (target - this.yMax) * Math.min(1, dt * 7);
        const Y = (g) => pad.t + ph - (Math.min(g, this.yMax) / this.yMax) * ph;
        const X = (age) => pad.l + pw - (age / (this.N - 1)) * pw; // age in samples

        ctx.clearRect(0, 0, w, h);
        ctx.font = mono(this.compact ? 9.5 : 10.5);
        ctx.textBaseline = 'middle';

        // Above the ceiling the sensor cannot report anything at all.
        if (CEILING < this.yMax) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(pad.l, pad.t, pw, Y(CEILING) - pad.t);
            ctx.clip();
            ctx.strokeStyle = c.danger;
            ctx.globalAlpha = 0.28;
            ctx.lineWidth = 1;
            for (let x = pad.l - ph; x < pad.l + pw; x += 9) {
                ctx.beginPath();
                ctx.moveTo(x, pad.t + ph);
                ctx.lineTo(x + ph, pad.t);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Grid and vertical axis.
        const step = tickStep(this.yMax, this.compact ? 3 : 5);
        ctx.lineWidth = 1;
        for (let g = 0; g <= this.yMax + 1e-6; g += step) {
            ctx.strokeStyle = c.line;
            ctx.beginPath();
            ctx.moveTo(pad.l, Math.round(Y(g)) + 0.5);
            ctx.lineTo(pad.l + pw, Math.round(Y(g)) + 0.5);
            ctx.stroke();
            ctx.fillStyle = c.dim;
            ctx.textAlign = 'right';
            ctx.fillText(g === 0 ? '0' : `${g} g`, pad.l - 6, Y(g));
        }

        // Time axis.
        if (!this.compact) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const span = this.N / this.fs;
            for (let s = 0; s <= span; s += 2) {
                ctx.fillStyle = c.dim;
                ctx.fillText(s === 0 ? 'now' : `-${s} s`, X(s * this.fs), pad.t + ph + 6);
            }
            ctx.textBaseline = 'middle';
        }

        const refLine = (g, colour, dash, label) => {
            if (g > this.yMax) return;
            ctx.save();
            ctx.strokeStyle = colour;
            ctx.setLineDash(dash);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pad.l, Y(g));
            ctx.lineTo(pad.l + pw, Y(g));
            ctx.stroke();
            ctx.restore();
            if (label) {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = colour;
                ctx.fillText(label, pad.l + 6, Y(g) - 3);
                ctx.textBaseline = 'middle';
            }
        };
        refLine(2, c.dim, [2, 4], this.compact ? '' : '2 g  handling floor');
        refLine(CEILING, c.danger, [6, 4], `${CEILING.toFixed(1)} g  sensor ceiling`);
        refLine(this.threshold, c.accent, [], `threshold ${this.threshold.toFixed(1)} g`);

        const trace = (buf, colour, width, dash = [], alpha = 1) => {
            if (shown < 2) return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(pad.l, pad.t - 2, pw, ph + 4);
            ctx.clip();
            ctx.strokeStyle = colour;
            ctx.lineWidth = width;
            ctx.globalAlpha = alpha;
            ctx.setLineDash(dash);
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let k = 0; k < shown; k++) {
                const i = (this.total - 1 - k + this.N * 2) % this.N;
                const x = X(k);
                const y = Y(buf[i]);
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        };
        trace(this.raw, c.dim, 1, [], 0.55);
        if (this.showAlt) trace(this.alt, c.second, 1.6, [5, 3]);
        trace(this.d, c.ink, 1.7);

        // Trigger markers scroll with the data.
        this.marks = this.marks.filter((m) => this.total - m.at < this.N);
        for (const m of this.marks) {
            const x = X(this.total - m.at);
            ctx.strokeStyle = c.danger;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x, pad.t);
            ctx.lineTo(x, pad.t + ph);
            ctx.stroke();
            ctx.fillStyle = c.danger;
            ctx.textAlign = x > pad.l + pw - 90 ? 'right' : 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(m.label, x + (ctx.textAlign === 'right' ? -5 : 5), pad.t + 2);
            ctx.textBaseline = 'middle';
        }
    }
}

const EVENTS = {
    pothole: { peak: 1.8, durationS: 0.06, dir: 'with' },
    brake: { peak: 0.9, durationS: 0.9, dir: 'sideways', shape: 'hold' },
    glitch: { peak: 20, shape: 'spike', dir: 'sideways' },
};

const fmt = (g) => `${g.toFixed(2)} g`;

/** The full lab: every control, both methods, optional phone input. */
export function initImpactLab(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const $ = (sel) => root.querySelector(sel);
    const scope = new Scope($('[data-scope]'));
    const src = new SignalSource();
    const det = new Detector();
    const alt = new Detector({ method: 'magnitude' });

    const out = {
        d: $('[data-out="d"]'),
        hold: $('[data-out="hold"]'),
        state: $('[data-out="state"]'),
        over: $('[data-out="over"]'),
        alt: $('[data-out="alt"]'),
        altBox: $('[data-alt-box]'),
        status: $('[data-status]'),
        hint: $('[data-hint]'),
    };
    const cancelBtn = $('[data-cancel]');
    const runBtn = $('[data-run]');
    let strength = 12;
    let dir = 'sideways';
    let compare = false;
    let mode = 'sim';
    let queue = [];
    let acc = 0;
    let frames = 0;
    let lastState = '';
    let calledAt = 0;
    let altPeak = 0;
    let last = null;

    const say = (text, tone = '') => {
        out.status.textContent = text;
        out.status.dataset.tone = tone;
    };

    function onFrame(f, fAlt) {
        last = f;
        scope.push(f.d, f.dRaw, fAlt ? fAlt.d : 0);
        if (fAlt) altPeak = fAlt.hold;
        if (f.fired) {
            scope.mark(f.fired === 'threshold' ? 'TRIGGER' : 'TRIGGER  railed axis');
            say(
                f.fired === 'threshold'
                    ? `Crash detected: over ${det.cfg.threshold.toFixed(1)} g for ${det.cfg.confirm} consecutive samples. Calling in ${det.cfg.cancelWindowS} s unless cancelled.`
                    : `Crash detected on the railed-axis check: an axis is pinned at full scale, so the true severity exceeds the recorded peak. Calling in ${det.cfg.cancelWindowS} s unless cancelled.`,
                'alert',
            );
        }
        if (f.state !== lastState) {
            if (f.state === 'ARMED' && lastState === 'CALIBRATING') say('Armed. Gravity vector recorded; the reading is 0.00 g at rest.', 'ok');
            if (f.state === 'CALLED') {
                calledAt = f.n;
                say(`Call placed (simulated). Crash peak ${fmt(f.crashPeak)}, measured over the 400 ms around the trigger.`, 'alert');
            }
            cancelBtn.hidden = f.state !== 'COUNTDOWN';
            lastState = f.state;
        }
        // Keep the demo usable: re-arm a few seconds after a simulated call.
        if (f.state === 'CALLED' && f.n - calledAt > 4 * det.cfg.fs) {
            det.rearm();
            alt.rearm();
            say('Re-armed.', 'ok');
        }
    }

    function stepSample(raw) {
        const f = det.push(raw);
        const fAlt = compare ? alt.push(raw) : null;
        onFrame(f, fAlt);
    }

    function readouts() {
        if (!last) return;
        out.d.textContent = fmt(last.d);
        out.hold.textContent = fmt(last.hold);
        out.state.textContent =
            last.state === 'COUNTDOWN' ? `COUNTDOWN ${last.countdownS.toFixed(1)} s`
            : last.state === 'CALIBRATING' ? `CALIBRATING ${Math.round(last.calProgress * 100)}%`
            : last.state;
        out.state.dataset.tone = last.state === 'COUNTDOWN' || last.state === 'CALLED' ? 'alert' : '';
        out.over.textContent = `${Math.min(last.over, det.cfg.confirm)} / ${det.cfg.confirm}`;
        if (compare) out.alt.textContent = `${fmt(altPeak)} · ${alt.state === 'ARMED' ? 'ARMED' : 'TRIGGERED'}`;
    }

    const loop = loopWhileVisible(root, (dt) => {
        if (mode === 'sim') {
            acc += dt * DEFAULTS.fs;
            while (acc >= 1) {
                stepSample(src.next());
                acc -= 1;
            }
        } else {
            for (const s of queue) stepSample(s);
            queue = [];
        }
        scope.draw(dt);
        if (frames++ % 5 === 0) readouts();
    });

    function setRunning(on) {
        loop.set(on);
        runBtn.setAttribute('aria-pressed', String(!on));
        runBtn.textContent = on ? 'Pause' : 'Run';
    }

    // Pre-roll so the chart is never empty, then honour reduced motion.
    for (let i = 0; i < 260; i++) stepSample(src.next());
    scope.draw();
    readouts();
    onRedrawNeeded(scope.canvas, () => {
        scope.colors = palette();
        scope.draw();
    });
    setRunning(!reducedMotion());

    function fire(kind) {
        if (mode !== 'sim') return;
        if (!loop.enabled) setRunning(true);
        if (kind === 'impact') src.fire({ peak: strength, durationS: 0.12, dir });
        else src.fire(EVENTS[kind]);
    }

    root.querySelectorAll('[data-fire]').forEach((btn) => btn.addEventListener('click', () => fire(btn.dataset.fire)));
    runBtn.addEventListener('click', () => setRunning(!loop.enabled));
    cancelBtn.addEventListener('click', () => {
        if (det.cancel()) {
            alt.rearm();
            cancelBtn.hidden = true;
            lastState = 'ARMED';
            say('Cancelled by the occupant. Re-armed.', 'ok');
        }
    });
    $('[data-recal]').addEventListener('click', () => {
        det.recalibrate();
        alt.recalibrate();
        lastState = 'CALIBRATING';
        say('Calibrating: averaging 100 still samples to record the gravity vector.');
        if (!loop.enabled) setRunning(true);
    });

    const bind = (sel, handler) => {
        const el = $(sel);
        const output = root.querySelector(`[data-for="${el.dataset.name}"]`);
        const apply = () => {
            const text = handler(el);
            if (output && text !== undefined) output.textContent = text;
        };
        el.addEventListener('input', apply);
        apply();
    };

    bind('[data-strength]', (el) => {
        strength = Number(el.value);
        return `${strength} g`;
    });
    bind('[data-dir]', (el) => {
        dir = el.value;
    });
    bind('[data-tilt]', (el) => {
        src.tilt = (Number(el.value) * Math.PI) / 180;
        return `${el.value}°`;
    });
    bind('[data-threshold]', (el) => {
        const t = Number(el.value);
        det.set({ threshold: t });
        alt.set({ threshold: t });
        scope.threshold = t;
        out.hint.hidden = t <= CEILING;
        return `${t.toFixed(1)} g`;
    });
    bind('[data-confirm]', (el) => {
        const k = Number(el.value);
        det.set({ confirm: k });
        alt.set({ confirm: k });
        return `${k} sample${k === 1 ? '' : 's'}`;
    });
    bind('[data-median]', (el) => {
        det.set({ median: el.checked });
        alt.set({ median: el.checked });
    });
    bind('[data-saturation]', (el) => {
        det.set({ saturation: el.checked });
        alt.set({ saturation: el.checked });
    });
    bind('[data-compare]', (el) => {
        compare = el.checked;
        scope.showAlt = compare;
        out.altBox.hidden = !compare;
        if (compare) {
            // Start the second detector from the same calibration.
            alt.recalibrate();
            alt.g0 = det.g0 ? det.g0.slice() : null;
            alt.hist = [0, 0];
            alt.rearm();
        }
    });

    // ---- Phone accelerometer ------------------------------------------------
    const deviceBtn = $('[data-device]');
    const deviceNote = $('[data-device-note]');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (deviceBtn && coarse && typeof DeviceMotionEvent !== 'undefined') {
        deviceBtn.hidden = false;
        if (deviceNote) deviceNote.hidden = true;
        let stamps = [];
        const onMotion = (e) => {
            const g = e.accelerationIncludingGravity;
            if (!g || g.x === null) return;
            queue.push([g.x / G0, g.y / G0, g.z / G0]);
            stamps.push(performance.now());
            if (stamps.length === 40) {
                // Let the time-based constants follow the device's real rate.
                const rate = Math.round((39 * 1000) / (stamps[39] - stamps[0]));
                if (rate > 10 && rate < 500) det.set({ fs: rate });
            }
        };
        const stop = () => {
            window.removeEventListener('devicemotion', onMotion);
            mode = 'sim';
            det.set({ fs: DEFAULTS.fs });
            det.recalibrate();
            lastState = 'CALIBRATING';
            deviceBtn.setAttribute('aria-pressed', 'false');
            deviceBtn.textContent = 'Use this phone’s accelerometer';
            root.querySelectorAll('[data-fire]').forEach((b) => (b.disabled = false));
        };
        deviceBtn.addEventListener('click', async () => {
            if (mode === 'device') {
                stop();
                say('Back on the synthetic signal.');
                return;
            }
            try {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    const answer = await DeviceMotionEvent.requestPermission();
                    if (answer !== 'granted') {
                        say('Motion access was declined, so the lab is staying on the synthetic signal.');
                        return;
                    }
                }
            } catch {
                say('This browser would not grant motion access.');
                return;
            }
            mode = 'device';
            queue = [];
            stamps = [];
            det.recalibrate();
            lastState = 'CALIBRATING';
            scope.clear();
            window.addEventListener('devicemotion', onMotion);
            deviceBtn.setAttribute('aria-pressed', 'true');
            deviceBtn.textContent = 'Stop using the accelerometer';
            root.querySelectorAll('[data-fire]').forEach((b) => (b.disabled = true));
            say('Hold the phone still for a second while it calibrates, then tap it against your palm.');
            if (!loop.enabled) setRunning(true);
            setTimeout(() => {
                if (mode === 'device' && stamps.length === 0) {
                    stop();
                    say('No motion data arrived from this device, so the lab went back to the synthetic signal.');
                }
            }, 2500);
        });
    }
}
