/* ==========================================================================
   Unit tests for the lab models in src/lib/sim.

   The interactive labs are only worth publishing if the mathematics under
   them is right, so every claim a lab makes on screen is asserted here first:
   the rotation floor, the sensor ceiling, glitch rejection, the code's
   distance properties, the filters' responses. Run with `node --test`.
   ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Detector, SignalSource, DEFAULTS, clipToRange, median3, dynamicVector,
    dynamicMagnitude, sensorCeiling, rotationFloor, norm,
} from '../src/lib/sim/detector.js';
import {
    G, H, encode, syndrome, decode, errorPosition, ENC, decodeInt, popcount,
    exactRates, closedFormFer, MonteCarlo, toBits, DATA_MASK,
} from '../src/lib/sim/hamming.js';
import {
    biquad, Biquad, magnitudeResponse, fft, amplitudeSpectrum, EegSynth,
    FilterChain, mainsPickupUv, thermalNoiseUv,
} from '../src/lib/sim/dsp.js';
import {
    generateSample, heightfield, renderSample, boundingBoxes, annotation,
    lightVector, craterProfile, RANGES, NOMINAL,
} from '../src/lib/sim/sdg.js';
import { mulberry32, substream } from '../src/lib/sim/rng.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} +/- ${tol}, got ${a}`);

/** Calibrate a detector on a still board, returning it armed. */
function armed(options = {}, tilt = 0) {
    const det = new Detector(options);
    const src = new SignalSource({ noise: 0, seed: 1 });
    src.tilt = tilt;
    for (let i = 0; i < DEFAULTS.calSamples; i++) det.push(src.next());
    assert.equal(det.state, 'ARMED');
    return { det, src };
}

/** Run for a number of samples, returning every frame. */
const run = (det, src, samples) => Array.from({ length: samples }, () => det.push(src.next()));

// ---- Detector ---------------------------------------------------------------

test('calibration takes exactly 100 samples and recovers the gravity vector', () => {
    const det = new Detector();
    const src = new SignalSource({ noise: 0 });
    src.tilt = 0.6;
    for (let i = 0; i < 99; i++) assert.equal(det.push(src.next()).state, 'CALIBRATING');
    assert.equal(det.push(src.next()).state, 'ARMED');
    const g = src.gravity();
    det.g0.forEach((v, i) => close(v, g[i], 1e-12));
});

test('dynamic acceleration reads 0.00 g at rest in any mounting orientation', () => {
    for (const tilt of [0, 0.4, Math.PI / 2, 2.2, Math.PI]) {
        const { det, src } = armed({}, tilt);
        for (const f of run(det, src, 50)) close(f.d, 0, 1e-12, `tilt ${tilt}:`);
    }
});

test('rotating a still board after calibration reads 2 sin(theta/2), at most 2 g', () => {
    for (const deg of [10, 45, 90, 135, 180]) {
        const { det, src } = armed();
        src.tilt = (deg * Math.PI) / 180;
        const f = run(det, src, 5).at(-1);
        close(f.d, rotationFloor(src.tilt), 1e-12, `${deg} deg:`);
        assert.ok(f.d <= 2 + 1e-12);
        assert.equal(f.state, 'ARMED', 'handling must never raise an alert at 5.0 g');
    }
    close(rotationFloor(Math.PI), 2, 1e-12);
});

test('the sensor ceiling is 16*sqrt(3), about 27.7 g', () => {
    close(sensorCeiling(), 27.7128, 1e-3);
    assert.deepEqual(clipToRange([40, -40, 3]), [16, -16, 3]);
    assert.ok(norm(clipToRange([1e3, 1e3, 1e3])) <= sensorCeiling() + 1e-9);
});

test('a 50 g threshold can never fire: no input reaches it through the ADC', () => {
    const { det, src } = armed({ threshold: 50, saturation: false });
    for (const dir of ['sideways', 'with', 'against', 'diagonal']) {
        src.fire({ peak: 500, durationS: 0.2, dir });
        for (const f of run(det, src, 40)) {
            assert.ok(f.d < 50, `read ${f.d} g`);
            assert.equal(f.state, 'ARMED');
        }
    }
    // The dynamic reading can exceed the raw ceiling only by gravity's 1 g.
    assert.ok(det.hold <= sensorCeiling() + 1);
});

test('the railed-axis check catches an impact the threshold path cannot see', () => {
    const { det, src } = armed({ threshold: 50 });
    src.fire({ peak: 40, durationS: 0.1, dir: 'sideways' });
    const frames = run(det, src, 30);
    const fired = frames.find((f) => f.fired);
    assert.ok(fired, 'expected a trigger');
    assert.equal(fired.fired, 'saturation');
    assert.ok(fired.d < 50);
});

test('a 12 g impact triggers on the threshold path after the confirm count', () => {
    const { det, src } = armed();
    src.fire({ peak: 12, durationS: 0.08, dir: 'sideways' });
    const frames = run(det, src, 30);
    const fired = frames.find((f) => f.fired);
    assert.equal(fired.fired, 'threshold');
    assert.equal(fired.over, DEFAULTS.confirm);
    assert.equal(fired.state, 'COUNTDOWN');
});

test('a pothole and hard braking stay under the threshold', () => {
    const { det, src } = armed();
    src.fire({ peak: 1.8, durationS: 0.06, dir: 'with' });
    src.fire({ peak: 0.9, durationS: 0.8, dir: 'sideways', shape: 'hold' });
    for (const f of run(det, src, 120)) assert.equal(f.state, 'ARMED');
    assert.ok(det.hold > 1.5 && det.hold < 5);
});

test('median-of-three rejects a one-sample glitch completely', () => {
    const { det, src } = armed({ saturation: false });
    src.fire({ peak: 20, shape: 'spike', dir: 'sideways' });
    const frames = run(det, src, 10);
    assert.ok(Math.max(...frames.map((f) => f.dRaw)) > 15, 'the raw trace must show the spike');
    assert.ok(Math.max(...frames.map((f) => f.d)) < 0.01, 'the filtered trace must not');
    assert.equal(det.state, 'ARMED');
});

test('without the filter and with confirm = 1, the same glitch is a false alarm', () => {
    const { det, src } = armed({ median: false, confirm: 1, saturation: false });
    src.fire({ peak: 20, shape: 'spike', dir: 'sideways' });
    assert.ok(run(det, src, 10).some((f) => f.fired === 'threshold'));
});

test('a two-sample glitch survives the median but not a confirm count of three', () => {
    const { det, src } = armed({ saturation: false });
    src.fire({ peak: 20, durationS: 0.02, shape: 'hold', dir: 'sideways' });
    const frames = run(det, src, 10);
    assert.ok(Math.max(...frames.map((f) => f.over)) < 3);
    assert.equal(det.state, 'ARMED');
    assert.equal(median3(0, 20, 20), 20);
});

test('subtracting only the magnitude misses a 6 g impact that opposes gravity', () => {
    const g0 = [0, 0, 1];
    const hit = [0, 0, 1 - 6];
    close(dynamicVector(hit, g0), 6, 1e-12);
    close(dynamicMagnitude(hit, g0), 4, 1e-12);
    close(dynamicMagnitude([6, 0, 1], g0), Math.sqrt(37) - 1, 1e-12);

    const vector = armed({ method: 'vector' });
    const magnitude = armed({ method: 'magnitude' });
    for (const { det, src } of [vector, magnitude]) {
        src.fire({ peak: 6, durationS: 0.2, dir: 'against' });
        run(det, src, 40);
    }
    assert.equal(vector.det.state, 'COUNTDOWN');
    assert.equal(magnitude.det.state, 'ARMED');
});

test('the vector method reads the same impact identically at every mounting angle', () => {
    const peaks = ['sideways', 'with', 'against'].map((dir) => {
        const { det, src } = armed({ threshold: 99, saturation: false });
        src.fire({ peak: 6, durationS: 0.2, dir });
        return Math.max(...run(det, src, 40).map((f) => f.d));
    });
    peaks.forEach((p) => close(p, peaks[0], 1e-9));
});

test('cancel inside the window re-arms; letting it expire places the call', () => {
    const a = armed();
    a.src.fire({ peak: 12, dir: 'sideways' });
    run(a.det, a.src, 30);
    assert.equal(a.det.state, 'COUNTDOWN');
    assert.ok(a.det.cancel());
    assert.equal(a.det.state, 'ARMED');
    assert.equal(a.det.cancel(), false, 'nothing to cancel once armed');

    const b = armed();
    b.src.fire({ peak: 12, dir: 'sideways' });
    const frames = run(b.det, b.src, DEFAULTS.cancelWindowS * DEFAULTS.fs + 40);
    const firedAt = frames.findIndex((f) => f.fired);
    const calledAt = frames.findIndex((f) => f.state === 'CALLED');
    assert.equal(calledAt - firedAt, DEFAULTS.cancelWindowS * DEFAULTS.fs, 'exactly ten seconds of samples');
});

test('crash peak covers only the 400 ms window around the trigger', () => {
    const { det, src } = armed();
    src.fire({ peak: 3, durationS: 0.1, dir: 'sideways' }); // an earlier bump
    run(det, src, 150);
    src.fire({ peak: 9, durationS: 0.08, dir: 'sideways' });
    run(det, src, 60);
    assert.equal(det.state, 'COUNTDOWN');
    assert.ok(det.crashPeak > 8 && det.crashPeak <= 9.01, `crash peak ${det.crashPeak}`);
});

test('dashboard peak holds for three seconds, then follows the live reading', () => {
    const { det, src } = armed();
    src.fire({ peak: 3, durationS: 0.1, dir: 'sideways' });
    run(det, src, 30);
    const held = det.hold;
    assert.ok(held > 2.5);
    run(det, src, 250);
    close(det.hold, held, 1e-12, 'still held inside three seconds:');
    run(det, src, 60);
    assert.ok(det.hold < 0.1, 'released after three seconds');
});

// ---- Hamming(7,4) -----------------------------------------------------------

test('G and H are orthogonal: every codeword has a zero syndrome', () => {
    for (let m = 0; m < 16; m++) assert.deepEqual(syndrome(encode(toBits(m, 4))), [0, 0, 0]);
    for (const g of G) for (const h of H) assert.equal(g.reduce((acc, v, i) => acc ^ (v & h[i]), 0), 0);
});

test('the code is systematic and its minimum distance is 3', () => {
    let dmin = 7;
    for (let m = 1; m < 16; m++) {
        assert.equal(ENC[m] & DATA_MASK, m);
        dmin = Math.min(dmin, popcount(ENC[m]));
    }
    assert.equal(dmin, 3);
});

test('every single-bit error on every codeword is corrected', () => {
    for (let m = 0; m < 16; m++) {
        const c = encode(toBits(m, 4));
        for (let k = 0; k < 7; k++) {
            const r = c.slice();
            r[k] ^= 1;
            const out = decode(r);
            assert.equal(out.flipped, k);
            assert.deepEqual(out.codeword, c);
            assert.equal(decodeInt(ENC[m] ^ (1 << k)), ENC[m]);
        }
    }
});

test('every double-bit error decodes to the wrong codeword', () => {
    for (let a = 0; a < 7; a++) {
        for (let b = a + 1; b < 7; b++) {
            const residual = decodeInt((1 << a) | (1 << b));
            assert.notEqual(residual, 0);
            assert.equal(popcount(residual), 3, 'lands on a weight-3 codeword');
        }
    }
});

test('the syndrome of a single error is the matching column of H', () => {
    for (let k = 0; k < 7; k++) {
        const e = toBits(1 << k, 7);
        assert.deepEqual(syndrome(e), H.map((row) => row[k]));
        assert.equal(errorPosition(syndrome(e)), k);
    }
});

test('enumerated frame error rate equals the closed form', () => {
    for (const p of [0, 0.001, 0.01, 0.05, 0.1, 0.25, 0.5]) {
        close(exactRates(p).fer, closedFormFer(p), 1e-12, `p=${p}:`);
    }
    assert.equal(exactRates(0).ber, 0);
    assert.ok(exactRates(0.01).ber < 0.01, 'coding gain at low p');
    close(exactRates(0.5).ber, 0.5, 1e-12, 'a useless channel gives a coin flip:');
});

test('Monte Carlo converges on the exact rates', () => {
    const mc = new MonteCarlo([0.02, 0.1, 0.3], 99);
    mc.step(200000);
    for (const r of mc.results()) {
        const exact = exactRates(r.p);
        close(r.fer, exact.fer, 4 * Math.sqrt((exact.fer * (1 - exact.fer)) / r.frames) + 1e-9, `FER p=${r.p}:`);
        close(r.ber, exact.ber, 0.004, `BER p=${r.p}:`);
    }
    assert.equal(mc.totalFrames, 600000);
});

// ---- DSP --------------------------------------------------------------------

test('the 60 Hz notch removes mains and leaves alpha alone', () => {
    const c = biquad('notch', 60, 250, 30);
    assert.ok(magnitudeResponse(c, 60, 250) < 1e-6);
    close(magnitudeResponse(c, 10, 250), 1, 0.01);
    close(magnitudeResponse(c, 50, 250), 1, 0.12);
});

test('the band edges sit at -3 dB and the passband is flat', () => {
    close(magnitudeResponse(biquad('highpass', 1, 250), 1, 250), Math.SQRT1_2, 1e-3);
    close(magnitudeResponse(biquad('lowpass', 40, 250), 40, 250), Math.SQRT1_2, 1e-3);
    const chain = new FilterChain(250);
    close(chain.response(10), 1, 0.02);
    assert.ok(chain.response(0.05) < 0.01, 'drift is rejected');
    assert.ok(chain.response(60) < 1e-6);
});

test('a biquad run in the time domain matches its computed response', () => {
    const fs = 250, f = 20;
    const section = new Biquad(biquad('lowpass', 40, fs));
    let peak = 0;
    for (let n = 0; n < 2000; n++) {
        const y = section.process(Math.sin((2 * Math.PI * f * n) / fs));
        if (n > 1000) peak = Math.max(peak, Math.abs(y));
    }
    close(peak, magnitudeResponse(biquad('lowpass', 40, fs), f, fs), 0.01);
});

test('fft finds a sinusoid in the right bin and obeys Parseval', () => {
    const n = 256;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 12 * i) / n));
    const energy = re.reduce((a, v) => a + v * v, 0);
    const im = new Float64Array(n);
    fft(re, im);
    const mag = Array.from(re, (v, k) => Math.hypot(v, im[k]));
    assert.equal(mag.indexOf(Math.max(...mag.slice(0, n / 2))), 12);
    close(mag.reduce((a, v) => a + v * v, 0) / n, energy, 1e-9);
    assert.throws(() => fft(new Float64Array(100), new Float64Array(100)));
});

test('the amplitude spectrum reads a sinusoid at its true amplitude', () => {
    const fs = 250, n = 512, k = 20;
    const f = (k * fs) / n;
    const x = Float64Array.from({ length: n }, (_, i) => 15 * Math.sin((2 * Math.PI * f * i) / fs));
    const { freqs, amp } = amplitudeSpectrum(x, fs);
    close(amp[k], 15, 0.01);
    close(freqs[k], f, 1e-12);
});

test('the filter chain strips mains and drift from the synthetic EEG', () => {
    const fs = 250, n = 1024;
    const synth = new EegSynth({ fs, seed: 5 });
    synth.contactKOhm = 400;
    const chain = new FilterChain(fs);
    const raw = new Float64Array(n), clean = new Float64Array(n);
    for (let i = 0; i < 2000; i++) chain.process(synth.next()); // settle
    for (let i = 0; i < n; i++) {
        raw[i] = synth.next();
        clean[i] = chain.process(raw[i]);
    }
    const at = (spec, f) => spec.amp[Math.round((f * n) / fs)];
    const a = amplitudeSpectrum(raw, fs), b = amplitudeSpectrum(clean, fs);
    assert.ok(at(a, 60) > 10, `raw mains ${at(a, 60)} uV`);
    assert.ok(at(b, 60) < 0.5, `filtered mains ${at(b, 60)} uV`);
    const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
    assert.ok(Math.abs(mean(raw)) > 5, 'raw carries an offset');
    assert.ok(Math.abs(mean(clean)) < 3, 'high-pass removes it');
});

test('alpha is stronger with the eyes closed', () => {
    const alpha = (closed) => {
        const synth = new EegSynth({ seed: 3 });
        synth.eyesClosed = closed;
        synth.contactKOhm = 5;
        const x = new Float64Array(2048);
        for (let i = 0; i < 500; i++) synth.next();
        for (let i = 0; i < x.length; i++) x[i] = synth.next();
        const { amp } = amplitudeSpectrum(x, 250);
        return Math.max(...Array.from(amp).slice(70, 95)); // 8.5 to 11.6 Hz
    };
    assert.ok(alpha(true) > 2.5 * alpha(false));
});

test('mains pickup scales with contact impedance; thermal noise with its root', () => {
    close(mainsPickupUv(500), 25, 1e-9);
    close(mainsPickupUv(50) / mainsPickupUv(5), 10, 1e-9);
    close(thermalNoiseUv(400) / thermalNoiseUv(100), 2, 1e-9);
    assert.ok(thermalNoiseUv(500) < 1, 'thermal noise is not what limits a dry electrode');
});

// ---- Synthetic data ---------------------------------------------------------

test('a seed reproduces its sample exactly', () => {
    assert.deepEqual(generateSample(42), generateSample(42));
    assert.notDeepEqual(generateSample(42), generateSample(43));
    assert.deepEqual(Array.from(renderSample(generateSample(7), 48)), Array.from(renderSample(generateSample(7), 48)));
    assert.equal(mulberry32(1)(), mulberry32(1)());
    assert.notEqual(substream(1, 1)(), substream(1, 2)());
});

test('every randomized parameter stays inside its declared range', () => {
    for (let seed = 0; seed < 300; seed++) {
        const s = generateSample(seed);
        assert.ok(s.craters.length >= RANGES.count[0] && s.craters.length <= RANGES.count[1]);
        for (const c of s.craters) {
            assert.ok(c.r >= RANGES.radius[0] && c.r <= RANGES.radius[1]);
            assert.ok(c.depth >= RANGES.depth[0] && c.depth <= RANGES.depth[1]);
            assert.ok(c.x > 0 && c.x < 1 && c.y > 0 && c.y < 1);
        }
        const deg = (s.light.elevation * 180) / Math.PI;
        assert.ok(deg >= RANGES.elevationDeg[0] && deg <= RANGES.elevationDeg[1]);
        close(Math.hypot(...lightVector(s.light)), 1, 1e-12);
    }
});

test('switching a group off freezes that group and nothing else', () => {
    const all = { layout: true, size: true, light: true, surface: true };
    for (let seed = 0; seed < 40; seed++) {
        const full = generateSample(seed, all);
        const noLight = generateSample(seed, { ...all, light: false });
        assert.equal(noLight.light.azimuth, NOMINAL.azimuth);
        assert.deepEqual(noLight.craters, full.craters);
        assert.deepEqual(noLight.surface, full.surface);

        const noSize = generateSample(seed, { ...all, size: false });
        assert.ok(noSize.craters.every((c) => c.r === NOMINAL.radius));
        assert.deepEqual(noSize.craters.map((c) => [c.x, c.y]), full.craters.map((c) => [c.x, c.y]), 'positions must not move');
        assert.deepEqual(noSize.light, full.light);
    }
});

test('with only lighting randomized, every sample is the same scene under a different sun', () => {
    const onlyLight = { layout: false, size: false, light: true, surface: false };
    const first = generateSample(1, onlyLight);
    assert.equal(first.craters.length, NOMINAL.count);
    const azimuths = new Set();
    for (let seed = 2; seed < 30; seed++) {
        const s = generateSample(seed, onlyLight);
        assert.deepEqual(s.craters, first.craters);
        assert.deepEqual(s.surface, first.surface);
        azimuths.add(s.light.azimuth);
    }
    assert.ok(azimuths.size > 20, 'and the light really does vary');
});

test('one ground-truth box per crater, inside the frame, containing its crater', () => {
    for (let seed = 0; seed < 100; seed++) {
        const s = generateSample(seed);
        const boxes = boundingBoxes(s);
        assert.equal(boxes.length, s.craters.length);
        boxes.forEach((b, i) => {
            assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1 + 1e-12 && b.y + b.h <= 1 + 1e-12);
            const c = s.craters[i];
            assert.ok(c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h);
        });
        const record = annotation(s, 512);
        assert.equal(record.annotations.length, s.craters.length);
        assert.ok(record.annotations.every((a) => a.category === 'crater' && a.bbox.every(Number.isInteger)));
        assert.doesNotThrow(() => JSON.stringify(record));
    }
});

test('a crater is a depression with a raised rim', () => {
    assert.equal(craterProfile(0), -1 + 0.25 * Math.exp(-((1 / 0.22) ** 2)));
    assert.ok(craterProfile(1) > 0.2, 'rim stands proud');
    assert.ok(Math.abs(craterProfile(2.5)) < 1e-6, 'undisturbed ground far away');
    const sample = { seed: 1, craters: [{ x: 0.5, y: 0.5, r: 0.1, depth: 1 }], light: { azimuth: 0, elevation: 0.6 }, surface: { tone: 0.5, roughness: 0, seams: 2 } };
    const S = 128, h = heightfield(sample, S);
    const at = (x, y) => h[Math.floor(y * S) * S + Math.floor(x * S)];
    assert.ok(at(0.5, 0.5) < at(0.9, 0.12) - 0.02, 'floor is below the surrounding ground');
    assert.ok(at(0.6, 0.5) > at(0.9, 0.12), 'rim is above it');
});

test('the wall facing the light is brighter than the wall facing away', () => {
    const sample = { seed: 1, craters: [{ x: 0.5, y: 0.5, r: 0.12, depth: 1 }], light: { azimuth: 0, elevation: 0.5 }, surface: { tone: 0.5, roughness: 0, seams: 2 } };
    const S = 128, px = renderSample(sample, S);
    const lum = (x, y) => px[(Math.floor(y * S) * S + Math.floor(x * S)) * 4];
    // Light arrives from +x, so the inner wall on the -x side faces it.
    assert.ok(lum(0.5 - 0.08, 0.5) > lum(0.5 + 0.08, 0.5) + 30);
    assert.equal(px.length, S * S * 4);
    assert.ok(px.every((v, i) => (i % 4 === 3 ? v === 255 : v >= 0 && v <= 255)));
});

test('an even-length pulse keeps its true peak through the median filter', () => {
    // The lab fires 120 ms impacts (12 samples) for this reason: two equal
    // samples sit at the crest, so median-of-three reports the real maximum.
    const { det, src } = armed({ threshold: 99, saturation: false });
    src.fire({ peak: 6, durationS: 0.12, dir: 'sideways' });
    const peak = Math.max(...run(det, src, 30).map((f) => f.d));
    close(peak, 6 * Math.sin((Math.PI * 5.5) / 12), 1e-9);
    assert.ok(peak > 5.9);
});
