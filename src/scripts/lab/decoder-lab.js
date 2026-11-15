/* ==========================================================================
   Decoding lab: Hamming(7,4) syndrome decoding by hand, then the same
   experiment repeated as a Monte Carlo sweep against its exact curves.
   ========================================================================== */
import { encode, decode, exactRates, MonteCarlo, SWEEP } from '../../lib/sim/hamming.js';
import { palette, fit, loopWhileVisible, onRedrawNeeded, mono } from './plot.js';

const NAMES = ['d1', 'd2', 'd3', 'd4', 'p1', 'p2', 'p3'];
const CAP = 200000;        // frames per sweep point before the run stops itself
const PER_TICK = 500;
const Y_MIN = 1e-4;

export function initDecoderLab(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const $ = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];

    // ---- Part A: one word, by hand ------------------------------------------
    const msg = [1, 0, 1, 1];
    let errors = [0, 0, 0, 0, 0, 0, 0];
    const msgBtns = all('[data-msg]');
    const cwCells = all('[data-cw]');
    const rxBtns = all('[data-rx]');
    const fixCells = all('[data-fix]');
    const synCells = all('[data-syn]');
    const hCells = all('[data-h]');
    const verdict = $('[data-out="verdict"]');

    function update() {
        const cw = encode(msg);
        const rx = cw.map((b, k) => b ^ errors[k]);
        const dec = decode(rx);
        const count = errors.reduce((a, b) => a + b, 0);
        const ok = dec.codeword.every((b, k) => b === cw[k]);

        msgBtns.forEach((b, i) => {
            b.textContent = msg[i];
            b.setAttribute('aria-pressed', String(msg[i] === 1));
        });
        cwCells.forEach((c, k) => (c.textContent = cw[k]));
        rxBtns.forEach((b, k) => {
            b.textContent = rx[k];
            b.classList.toggle('is-error', errors[k] === 1);
            b.setAttribute('aria-label', `Received bit ${NAMES[k]}: ${rx[k]}${errors[k] ? ', flipped by the channel' : ''}. Press to flip.`);
        });
        fixCells.forEach((c, k) => {
            c.textContent = dec.codeword[k];
            c.classList.toggle('is-flipped', dec.flipped === k);
            c.classList.toggle('is-wrong', dec.codeword[k] !== cw[k]);
        });
        synCells.forEach((c, j) => (c.textContent = dec.syndrome[j]));
        hCells.forEach((c) => c.classList.toggle('is-match', Number(c.dataset.h.split(',')[1]) === dec.flipped));

        const s = dec.syndrome.join('');
        let text;
        if (count === 0) text = 'No errors. The syndrome is 000, so the decoder leaves the word alone.';
        else if (count === 1) text = `One error. Syndrome ${s} equals the ${NAMES[dec.flipped]} column of H, so the decoder flips ${NAMES[dec.flipped]} back and recovers the message.`;
        else if (dec.flipped < 0) text = `${count} errors that add up to a codeword. The syndrome is 000, so the decoder cannot see anything wrong: an undetected frame error.`;
        else if (count === 2) text = `Two errors. Syndrome ${s} equals the ${NAMES[dec.flipped]} column, a bit the channel never touched. Flipping it leaves three wrong bits and a valid codeword that is not the one sent: a frame error.`;
        else text = ok
            ? `${count} errors, and by luck the decoder landed back on the right codeword.`
            : `${count} errors, beyond what a distance-3 code can repair. The decoder returns a valid codeword, but the wrong one: a frame error.`;
        verdict.textContent = text;
        verdict.dataset.tone = ok ? 'ok' : 'alert';
    }

    msgBtns.forEach((b, i) => b.addEventListener('click', () => {
        msg[i] ^= 1;
        update();
    }));
    rxBtns.forEach((b, k) => b.addEventListener('click', () => {
        errors[k] ^= 1;
        update();
    }));
    $('[data-clear]').addEventListener('click', () => {
        errors = [0, 0, 0, 0, 0, 0, 0];
        update();
    });
    update();

    // ---- Part B: the sweep ----------------------------------------------------
    const chart = $('[data-chart]');
    const runBtn = $('[data-mc-run]');
    const outFrames = $('[data-out="frames"]');
    const outSpot = $('[data-out="spot"]');
    const exact = Array.from({ length: 101 }, (_, i) => {
        const p = 0.005 + (i / 100) * 0.495;
        return { p, ...exactRates(p) };
    });
    let mc = new MonteCarlo(SWEEP, 2026);
    let colors = palette();

    function drawChart() {
        const { ctx, w, h } = fit(chart);
        const c = colors;
        const pad = { l: 46, r: 14, t: 12, b: 34 };
        const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
        const X = (p) => pad.l + (p / 0.5) * pw;
        const Y = (v) => pad.t + (Math.log10(Math.max(v, Y_MIN)) / Math.log10(Y_MIN)) * ph;

        ctx.clearRect(0, 0, w, h);
        ctx.font = mono(10.5);
        ctx.lineWidth = 1;

        for (let e = 0; e >= -4; e--) {
            const y = Math.round(Y(10 ** e)) + 0.5;
            ctx.strokeStyle = c.line;
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(pad.l + pw, y);
            ctx.stroke();
            ctx.fillStyle = c.dim;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(e === 0 ? '1' : `1e${e}`, pad.l - 6, y);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let p = 0; p <= 0.5001; p += 0.1) {
            ctx.fillStyle = c.dim;
            ctx.fillText(p.toFixed(1), X(p), pad.t + ph + 6);
        }
        ctx.fillText('channel bit-error probability p', pad.l + pw / 2, pad.t + ph + 20);

        const curve = (key, colour, dash) => {
            ctx.save();
            ctx.strokeStyle = colour;
            ctx.setLineDash(dash);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            exact.forEach((pt, i) => {
                const v = key === 'p' ? pt.p : pt[key];
                if (i === 0) ctx.moveTo(X(pt.p), Y(v));
                else ctx.lineTo(X(pt.p), Y(v));
            });
            ctx.stroke();
            ctx.restore();
        };
        curve('p', c.dim, [2, 4]);
        curve('fer', c.accent, []);
        curve('ber', c.danger, [6, 4]);

        // Simulated points: circles for frames, crosses for bits.
        for (const r of mc.results()) {
            if (!r.frames) continue;
            if (r.fer > 0) {
                ctx.strokeStyle = c.accent;
                ctx.fillStyle = c.bg;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(X(r.p), Y(r.fer), 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            if (r.ber > 0) {
                const x = X(r.p), y = Y(r.ber);
                ctx.strokeStyle = c.danger;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(x - 4, y - 4);
                ctx.lineTo(x + 4, y + 4);
                ctx.moveTo(x + 4, y - 4);
                ctx.lineTo(x - 4, y + 4);
                ctx.stroke();
            }
        }
    }

    function report() {
        const total = mc.totalFrames;
        outFrames.textContent = total.toLocaleString('en-US');
        const spot = mc.results().find((r) => r.p === 0.05);
        const ex = exactRates(0.05);
        outSpot.textContent = spot && spot.frames
            ? `${(spot.fer * 100).toFixed(2)}% simulated, ${(ex.fer * 100).toFixed(2)}% exact`
            : `${(ex.fer * 100).toFixed(2)}% exact`;
    }

    const loop = loopWhileVisible(root, () => {
        if (mc.frames[0] >= CAP) {
            setRunning(false);
            return;
        }
        mc.step(PER_TICK);
        drawChart();
        report();
    });

    function setRunning(on) {
        loop.set(on);
        runBtn.setAttribute('aria-pressed', String(on));
        runBtn.textContent = on ? 'Pause' : mc.frames[0] >= CAP ? 'Done' : mc.frames[0] ? 'Resume' : 'Run the sweep';
        runBtn.disabled = !on && mc.frames[0] >= CAP;
    }

    runBtn.addEventListener('click', () => setRunning(!loop.enabled));
    $('[data-mc-reset]').addEventListener('click', () => {
        mc = new MonteCarlo(SWEEP, 2026 + Math.floor(mc.totalFrames) % 9973);
        runBtn.disabled = false;
        setRunning(false);
        drawChart();
        report();
    });

    onRedrawNeeded(chart, () => {
        colors = palette();
        drawChart();
    });
    // A first pass is simulated up front so the chart is never empty; after
    // that the sweep waits for the visitor to run it.
    mc.step(PER_TICK);
    setRunning(false);
    drawChart();
    report();
}
