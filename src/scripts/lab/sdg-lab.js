/* ==========================================================================
   Synthetic data lab: draw randomized scenes from src/lib/sim/sdg.js, with
   the ground-truth boxes and the record a dataset writer would emit.
   ========================================================================== */
import { generateSample, renderSample, boundingBoxes, annotation } from '../../lib/sim/sdg.js';
import { fit, onRedrawNeeded, mono } from './plot.js';

const MAIN = 384;   // render resolution of the selected sample
const THUMB = 112;  // render resolution of each batch thumbnail
// Overlay colours are fixed, not themed: they sit on a rendered image that is
// mid grey in both themes, so the page palette is the wrong reference.
const BOX = '#c6ff3a';
const BOX_INK = '#0e100b';

function recordText(a) {
    const rows = a.annotations.map(
        (x, i, all) => `    { "id": ${x.id}, "category": "${x.category}", "bbox": [${x.bbox.join(', ')}] }${i < all.length - 1 ? ',' : ''}`,
    );
    return [
        '{',
        `  "image": "${a.image}",`,
        `  "width": ${a.width}, "height": ${a.height},`,
        `  "light": { "azimuth_deg": ${a.light.azimuth_deg}, "elevation_deg": ${a.light.elevation_deg} },`,
        '  "annotations": [',
        ...rows,
        '  ]',
        '}',
    ].join('\n');
}

export function initSdgLab(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const $ = (sel) => root.querySelector(sel);
    const view = $('[data-view]');
    const thumbs = [...root.querySelectorAll('[data-thumb]')];
    const record = $('[data-record]');
    const out = { seed: $('[data-out="seed"]'), count: $('[data-out="count"]'), light: $('[data-out="light"]') };
    const flags = { layout: true, size: true, light: true, surface: true };
    const offscreen = document.createElement('canvas');
    let base = 1;
    let selected = 0;
    let labels = true;
    let current = null;

    function paint(canvas, sample, size) {
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d').putImageData(new ImageData(renderSample(sample, size), size, size), 0, 0);
    }

    function drawView() {
        if (!current) return;
        const { ctx, w, h } = fit(view);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreen, 0, 0, w, h);

        // Where the light comes from, as a dot on a small dial.
        const cx = w - 26, cy = 26, r = 14;
        ctx.fillStyle = 'rgba(14, 16, 11, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(242, 244, 234, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        const reach = r * Math.cos(current.light.elevation);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(cx + reach * Math.cos(current.light.azimuth), cy + reach * Math.sin(current.light.azimuth), 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (!labels) return;
        ctx.font = mono(10.5);
        ctx.textBaseline = 'top';
        boundingBoxes(current).forEach((b, i) => {
            const x = b.x * w, y = b.y * h, bw = b.w * w, bh = b.h * h;
            ctx.strokeStyle = BOX_INK;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, bw, bh);
            ctx.strokeStyle = BOX;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y, bw, bh);
            const text = `crater ${i}`;
            const tw = ctx.measureText(text).width + 8;
            const ty = y - 15 < 0 ? y + 1 : y - 15;
            ctx.fillStyle = BOX;
            ctx.fillRect(x - 0.75, ty, tw, 14);
            ctx.fillStyle = BOX_INK;
            ctx.fillText(text, x + 3, ty + 2);
        });
    }

    function select(i) {
        selected = i;
        current = generateSample(base + i, flags);
        paint(offscreen, current, MAIN);
        thumbs.forEach((t, k) => t.setAttribute('aria-pressed', String(k === i)));
        const deg = (rad) => Math.round((rad * 180) / Math.PI);
        out.seed.textContent = String(current.seed).padStart(6, '0');
        out.count.textContent = String(current.craters.length);
        out.light.textContent = `az ${deg(current.light.azimuth)}°, el ${deg(current.light.elevation)}°`;
        record.textContent = recordText(annotation(current, 512));
        drawView();
    }

    function batch() {
        thumbs.forEach((t, i) => {
            const sample = generateSample(base + i, flags);
            paint(t.querySelector('canvas'), sample, THUMB);
            t.setAttribute('aria-label', `Sample ${base + i}: ${sample.craters.length} crater${sample.craters.length === 1 ? '' : 's'}`);
        });
        select(Math.min(selected, thumbs.length - 1));
    }

    thumbs.forEach((t, i) => t.addEventListener('click', () => select(i)));
    $('[data-new]').addEventListener('click', () => {
        base += thumbs.length;
        selected = 0;
        batch();
    });
    root.querySelectorAll('[data-flag]').forEach((box) =>
        box.addEventListener('input', () => {
            flags[box.dataset.flag] = box.checked;
            batch();
        }),
    );
    $('[data-labels]').addEventListener('input', (e) => {
        labels = e.target.checked;
        drawView();
    });

    batch();
    onRedrawNeeded(view, drawView);
}
