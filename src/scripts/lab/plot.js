/* ==========================================================================
   Shared canvas plumbing for the labs: theme colours, crisp sizing, and a
   render loop that only runs while its canvas is actually being looked at.
   ========================================================================== */

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Read the design tokens, so a canvas follows the theme like any element. */
export function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    return {
        bg: v('--bg'),
        elev: v('--bg-elev'),
        ink: v('--ink'),
        dim: v('--ink-dim'),
        line: v('--line'),
        accent: v('--accent'),
        fill: v('--accent-fill'),
        danger: v('--danger'),
        second: v('--accent-2'),
    };
}

export const mono = (px) => `${px}px "JetBrains Mono", ui-monospace, Menlo, monospace`;

/**
 * Match the backing store to the CSS box and the display's pixel ratio.
 * Returns a context already scaled to CSS pixels. DPR is capped at 2: beyond
 * that the extra fill costs more than anyone can see on a line plot.
 */
export function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
}

/**
 * Call tick(dt) on animation frames, but only while the element is on screen,
 * the tab is visible, and the loop has not been paused. A lab scrolled out of
 * view costs nothing.
 */
export function loopWhileVisible(el, tick) {
    let raf = 0;
    let last = 0;
    let onScreen = false;
    let running = false;
    const api = {
        enabled: true,
        get running() {
            return running;
        },
        set(on) {
            api.enabled = on;
            update();
        },
    };
    const frame = (t) => {
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        try {
            tick(dt);
        } catch (err) {
            // One broken frame must not leave a lab frozen with no trace of why.
            running = false;
            console.error('lab render loop stopped:', err);
            return;
        }
        if (running) raf = requestAnimationFrame(frame);
    };
    function update() {
        const should = onScreen && !document.hidden && api.enabled;
        if (should && !running) {
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        } else if (!should && running) {
            running = false;
            cancelAnimationFrame(raf);
        }
    }
    new IntersectionObserver(
        (entries) => {
            onScreen = entries[0].isIntersecting;
            update();
        },
        { rootMargin: '80px' },
    ).observe(el);
    document.addEventListener('visibilitychange', update);
    return api;
}

/** Re-run a callback when the theme flips or the element is resized. */
export function onRedrawNeeded(el, cb) {
    window.addEventListener('themechange', cb);
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', cb);
    new ResizeObserver(cb).observe(el);
    // Canvas text falls back to a system face until the webfont arrives.
    document.fonts?.ready.then(cb);
}

/** "Nice" tick step for a linear axis. */
export function tickStep(max, target = 5) {
    const raw = max / target;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}
