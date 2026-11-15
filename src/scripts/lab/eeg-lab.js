/* ==========================================================================
   EEG filter bench: a synthetic single-channel recording from
   src/lib/sim/dsp.js, shown raw and filtered in time and in frequency.
   ========================================================================== */
import { EegSynth, FilterChain, amplitudeSpectrum, bandAmplitude, mainsPickupUv } from '../../lib/sim/dsp.js';
import { palette, fit, loopWhileVisible, onRedrawNeeded, mono, reducedMotion } from './plot.js';

const FS = 250;
const WIN = 1000;   // 4 s on screen
const NFFT = 512;
const F_MAX = 80;
const DB_MIN = -20, DB_MAX = 40;

export function initEegLab(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const $ = (sel) => root.querySelector(sel);
    const timeCanvas = $('[data-time]');
    const specCanvas = $('[data-spectrum]');
    const runBtn = $('[data-run]');
    const out = { alpha: $('[data-out="alpha"]'), mains: $('[data-out="mains"]'), pickup: $('[data-out="pickup"]') };

    const synth = new EegSynth({ fs: FS });
    const chain = new FilterChain(FS);
    const raw = new Float32Array(WIN);
    const clean = new Float32Array(WIN);
    let total = 0;
    let acc = 0;
    let sinceSpec = 0;
    let specRaw = null;
    let specClean = null;
    let freqs = null;
    let restart = false; // next spectrum replaces the average instead of blending
    let colors = palette();

    const step = () => {
        const x = synth.next();
        raw[total % WIN] = x;
        clean[total % WIN] = chain.process(x);
        total += 1;
    };

    const latest = (buf, n) => {
        const o = new Float64Array(n);
        for (let i = 0; i < n; i++) o[i] = buf[(total - n + i + WIN * 4) % WIN];
        return o;
    };

    function spectrum() {
        const a = amplitudeSpectrum(latest(raw, NFFT), FS);
        const b = amplitudeSpectrum(latest(clean, NFFT), FS);
        freqs = a.freqs;
        // Average across blocks so the display settles instead of flickering.
        const blend = (prev, next) => (prev && !restart ? prev.map((v, i) => 0.7 * v + 0.3 * next[i]) : next);
        specRaw = blend(specRaw, a.amp);
        specClean = blend(specClean, b.amp);
        restart = false;
        out.alpha.textContent = `${bandAmplitude(freqs, specClean, 8, 12).toFixed(1)} µV`;
        const k60 = Math.round((60 * NFFT) / FS);
        out.mains.textContent = `${Math.max(specClean[k60 - 1], specClean[k60], specClean[k60 + 1]).toFixed(2)} µV`;
    }

    function drawTime() {
        const { ctx, w, h } = fit(timeCanvas);
        const c = colors;
        const pad = { l: 10, r: 10, t: 6, b: 6 };
        const laneH = (h - pad.t - pad.b) / 2;
        const shown = Math.min(total, WIN);
        ctx.clearRect(0, 0, w, h);
        ctx.font = mono(10.5);

        const lane = (buf, top, label, colour, span) => {
            let mean = 0;
            for (let i = 0; i < shown; i++) mean += buf[i];
            mean /= Math.max(1, shown);
            let half = span;
            if (!half) {
                for (let i = 0; i < shown; i++) half = Math.max(half || 0, Math.abs(buf[i] - mean));
                half = Math.max(40, half * 1.1);
            } else mean = 0;
            ctx.strokeStyle = c.line;
            ctx.lineWidth = 1;
            ctx.strokeRect(pad.l + 0.5, top + 0.5, w - pad.l - pad.r - 1, laneH - 7);
            ctx.save();
            ctx.beginPath();
            ctx.rect(pad.l, top, w - pad.l - pad.r, laneH - 6);
            ctx.clip();
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1.3;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const mid = top + (laneH - 6) / 2;
            for (let k = 0; k < shown; k++) {
                const i = (total - shown + k + WIN * 4) % WIN;
                const x = pad.l + (k / (WIN - 1)) * (w - pad.l - pad.r);
                const y = mid - ((buf[i] - mean) / half) * ((laneH - 6) / 2);
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = c.dim;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${label}   ±${Math.round(half)} µV`, pad.l + 7, top + 6);
        };
        lane(raw, pad.t, 'RAW', c.dim, 0);
        lane(clean, pad.t + laneH, 'FILTERED', c.ink, 60);
    }

    function drawSpectrum() {
        const { ctx, w, h } = fit(specCanvas);
        const c = colors;
        const pad = { l: 40, r: 12, t: 10, b: 32 };
        const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
        const X = (f) => pad.l + (f / F_MAX) * pw;
        const Y = (uv) => {
            const db = 20 * Math.log10(Math.max(uv, 1e-3));
            return pad.t + ((DB_MAX - Math.min(DB_MAX, Math.max(DB_MIN, db))) / (DB_MAX - DB_MIN)) * ph;
        };
        ctx.clearRect(0, 0, w, h);
        ctx.font = mono(10.5);

        // Alpha band.
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = c.accent;
        ctx.fillRect(X(8), pad.t, X(12) - X(8), ph);
        ctx.restore();
        ctx.fillStyle = c.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('alpha', X(10), pad.t + 3);

        ctx.lineWidth = 1;
        for (let db = DB_MIN; db <= DB_MAX; db += 20) {
            const y = Math.round(pad.t + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * ph) + 0.5;
            ctx.strokeStyle = c.line;
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(pad.l + pw, y);
            ctx.stroke();
            ctx.fillStyle = c.dim;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${10 ** (db / 20)}`.replace(/^0\./, '.'), pad.l - 6, y);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let f = 0; f <= F_MAX; f += 20) {
            ctx.fillStyle = c.dim;
            ctx.fillText(`${f}`, X(f), pad.t + ph + 6);
        }
        ctx.fillText('frequency, Hz   (vertical: µV, log scale)', pad.l + pw / 2, pad.t + ph + 19);

        // Mains marker.
        ctx.save();
        ctx.strokeStyle = c.danger;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(X(60), pad.t);
        ctx.lineTo(X(60), pad.t + ph);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = c.danger;
        ctx.textAlign = 'left';
        ctx.fillText('60 Hz mains', X(60) + 5, pad.t + 3);

        if (!freqs || !specRaw || !specClean) return;
        const line = (amp, colour, width, alpha) => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(pad.l, pad.t, pw, ph);
            ctx.clip();
            ctx.strokeStyle = colour;
            ctx.lineWidth = width;
            ctx.globalAlpha = alpha;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let k = 1; k < freqs.length && freqs[k] <= F_MAX; k++) {
                if (k === 1) ctx.moveTo(X(freqs[k]), Y(amp[k]));
                else ctx.lineTo(X(freqs[k]), Y(amp[k]));
            }
            ctx.stroke();
            ctx.restore();
        };
        line(specRaw, c.dim, 1.1, 0.8);
        line(specClean, c.ink, 1.7, 1);
    }

    const draw = () => {
        drawTime();
        drawSpectrum();
    };

    const loop = loopWhileVisible(root, (dt) => {
        acc += dt * FS;
        while (acc >= 1) {
            step();
            acc -= 1;
        }
        sinceSpec += dt;
        if (sinceSpec > 0.2) {
            sinceSpec = 0;
            spectrum();
        }
        draw();
    });

    function setRunning(on) {
        loop.set(on);
        runBtn.setAttribute('aria-pressed', String(!on));
        runBtn.textContent = on ? 'Pause' : 'Run';
    }

    // ---- Controls -------------------------------------------------------------
    root.querySelectorAll('[data-filter]').forEach((box) =>
        box.addEventListener('input', () => {
            chain.enabled[box.dataset.filter] = box.checked;
            restart = true;
        }),
    );
    const eyes = $('[data-eyes]');
    eyes.addEventListener('click', () => {
        synth.eyesClosed = !synth.eyesClosed;
        eyes.setAttribute('aria-pressed', String(synth.eyesClosed));
        eyes.textContent = synth.eyesClosed ? 'Eyes closed' : 'Eyes open';
    });
    $('[data-blink]').addEventListener('click', () => {
        synth.triggerBlink();
        if (!loop.enabled) setRunning(true);
    });
    const imp = $('[data-imp]');
    const impOut = $('[data-for="imp"]');
    const applyImp = () => {
        // Log slider: 5 kOhm to 500 kOhm across its travel.
        const k = 5 * 100 ** (Number(imp.value) / 100);
        synth.contactKOhm = k;
        impOut.textContent = `${k < 100 ? k.toFixed(0) : Math.round(k / 10) * 10} kΩ`;
        out.pickup.textContent = `${mainsPickupUv(k).toFixed(1)} µV`;
        restart = true;
    };
    imp.addEventListener('input', applyImp);
    applyImp();
    runBtn.addEventListener('click', () => setRunning(!loop.enabled));

    // Settle the filters and fill the window before the first paint.
    for (let i = 0; i < WIN + 600; i++) step();
    spectrum();
    spectrum();
    draw();
    onRedrawNeeded(specCanvas, () => {
        colors = palette();
        draw();
    });
    setRunning(!reducedMotion());
}
