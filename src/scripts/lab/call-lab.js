/* ==========================================================================
   Crash to call lab: the chain from src/lib/sim/dispatch.js, with a
   transcript, the one decision the occupant gets, and an editable record.

   No canvas and no render loop. The only timer is a 100 ms tick that runs
   while the chain is actually moving (the countdown, the ring, the briefing)
   and stops as soon as it is waiting on a person.
   ========================================================================== */
import { Chain, SAMPLE, FIELDS, context, incidentReport } from '../../lib/sim/dispatch.js';
import { Detector, SignalSource } from '../../lib/sim/detector.js';

const EVENTS = {
    crash: { peak: 12, durationS: 0.12, dir: 'sideways' },
    pothole: { peak: 1.8, durationS: 0.06, dir: 'with' },
};

/**
 * Run one event through the detector model and report what it measured.
 * The figure the dispatcher hears is the detector's crash peak, taken over
 * the 400 ms around the trigger, so it comes from the same pipeline the
 * write-up describes and is not typed in here.
 */
function measure(event) {
    const det = new Detector();
    const src = new SignalSource({ seed: 11 });
    let fired = false;
    let peak = 0;
    let crashPeak = 0;
    for (let i = 0; i < 220; i++) {
        if (i === 130) src.fire(event);
        const f = det.push(src.next());
        peak = Math.max(peak, f.d);
        if (f.fired) fired = true;
        if (fired) crashPeak = f.crashPeak;
    }
    return { fired, peak: fired ? crashPeak : peak };
}

const WHO = { system: 'System', agent: 'Agent', dispatcher: 'Dispatcher', occupant: 'Occupant' };

export function initCallLab(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const $ = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];

    const record = { ...SAMPLE };
    let startedAt = 0;
    const elapsed = () => (startedAt ? (performance.now() - startedAt) / 1000 : null);
    const chain = new Chain({ getContext: () => context(record, { peakG: chain.peakG, elapsedS: elapsed() }) });

    const screen = $('[data-screen]');
    const out = { state: $('[data-out="state"]'), sub: $('[data-out="sub"]'), count: $('[data-out="count"]'), peak: $('[data-out="peak"]') };
    const btn = { cancel: $('[data-cancel]'), skip: $('[data-skip]'), hangup: $('[data-hangup]'), rearm: $('[data-rearm]') };
    const log = $('[data-log]');
    const report = $('[data-report]');
    const reportRows = $('[data-report-rows]');
    const question = $('[data-question]');
    const askBtn = $('[data-ask]');
    const askHint = $('[data-ask-hint]');
    const stages = all('[data-stage]');
    const fires = all('[data-fire]');
    const presets = all('[data-q]');

    // ---- Transcript ----
    function write(events) {
        if (!events.length) return;
        log.querySelector('[data-empty]')?.remove();
        for (const e of events) {
            const line = document.createElement('p');
            line.className = 'log-line';
            line.dataset.who = e.who;
            line.dataset.kind = e.kind;
            const who = document.createElement('span');
            who.className = 'log-who';
            who.textContent = WHO[e.who];
            const text = document.createElement('span');
            text.textContent = e.text;
            line.append(who, text);
            log.append(line);
            // Only lines that read the record move the highlight. The report
            // offer reads nothing, and used to wipe the mark an answer had
            // just left on the field it came from.
            if (e.kind === 'answer' || e.kind === 'refusal' || e.kind === 'briefing') flash(e);
            if (e.kind === 'report') showReport();
        }
        log.scrollTop = log.scrollHeight;
    }

    // ---- Where an answer came from ----
    let flashTimer = 0;
    function flash(e) {
        clearTimeout(flashTimer);
        all('.call-field').forEach((el) => el.classList.remove('is-used', 'is-missing'));
        const cls = e.kind === 'refusal' ? 'is-missing' : 'is-used';
        for (const key of e.uses ?? []) root.querySelector(`[data-field="${key}"]`)?.classList.add(cls);
        flashTimer = setTimeout(() => all('.call-field').forEach((el) => el.classList.remove('is-used', 'is-missing')), 2600);
    }

    function showReport() {
        reportRows.replaceChildren();
        for (const [label, value] of incidentReport(chain.getContext())) {
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = value;
            reportRows.append(dt, dd);
        }
        report.hidden = false;
    }

    // ---- The screen ----
    const SCREENS = {
        ARMED: ['ARMED', 'Monitoring. Press Crash to start the chain.'],
        WARNING: ['!! CRASH DETECTED !!', 'A dispatcher is called when the countdown ends, unless the occupant cancels.'],
        DIALING: ['CALLING DISPATCHER', 'Ringing. The location is being resolved in the background.'],
        BRIEFING: ['ON CALL', 'The agent is speaking the briefing.'],
        LISTENING: ['ON CALL', 'The agent is listening. Ask a question.'],
        ENDED: ['CALL ENDED', 'Press Re-arm to return to monitoring.'],
    };
    let shown = '';

    function render() {
        const s = chain.state;
        if (s !== shown) {
            // State and sub-line are a live region: only write them on a change.
            shown = s;
            screen.dataset.state = s;
            out.state.textContent = SCREENS[s][0];
            out.sub.textContent = SCREENS[s][1];
            btn.cancel.hidden = s !== 'WARNING';
            btn.skip.hidden = s !== 'WARNING';
            btn.hangup.hidden = !(s === 'DIALING' || s === 'BRIEFING' || s === 'LISTENING');
            btn.rearm.hidden = s !== 'ENDED';
            const listening = s === 'LISTENING';
            for (const el of [...presets, question, askBtn]) el.disabled = !listening;
            askHint.hidden = listening;
            for (const el of fires) el.disabled = s !== 'ARMED';
        }
        out.count.textContent = s === 'WARNING' ? String(Math.ceil(chain.countdown)) : '';
        const stage = chain.stage;
        stages.forEach((el, i) => {
            el.toggleAttribute('data-on', i <= stage);
            if (i === stage) el.setAttribute('aria-current', 'step');
            else el.removeAttribute('aria-current');
        });
        out.peak.textContent = chain.peakG === null ? 'none yet' : `${chain.peakG.toFixed(1)} g`;
    }

    // ---- Clock: only while something is in motion ----
    let timer = 0;
    let last = 0;
    const moving = () => chain.state === 'WARNING' || chain.state === 'DIALING' || chain.state === 'BRIEFING';

    function tick() {
        const now = performance.now();
        const dt = Math.min(1.5, (now - last) / 1000);
        last = now;
        write(chain.tick(dt));
        render();
        if (!moving()) stop();
    }

    function start() {
        if (timer) return;
        last = performance.now();
        timer = setInterval(tick, 100);
    }

    function stop() {
        clearInterval(timer);
        timer = 0;
    }

    // ---- Controls ----
    fires.forEach((el) =>
        el.addEventListener('click', () => {
            // The detector model measures the event; the chain decides what
            // to do with the number, exactly as it would with a real reading.
            const events = chain.impact(measure(EVENTS[el.dataset.fire]).peak);
            if (chain.state === 'WARNING') {
                startedAt = performance.now();
                report.hidden = true;
            }
            write(events);
            render();
            if (moving()) start();
        }),
    );

    btn.cancel.addEventListener('click', () => {
        write(chain.cancel());
        startedAt = 0;
        render();
        root.querySelector('[data-fire="crash"]')?.focus();
    });
    btn.skip.addEventListener('click', () => chain.skip());
    btn.hangup.addEventListener('click', () => {
        write(chain.hangUp());
        render();
        btn.rearm.focus();
    });
    btn.rearm.addEventListener('click', () => {
        write(chain.rearm());
        startedAt = 0;
        report.hidden = true;
        render();
        root.querySelector('[data-fire="crash"]')?.focus();
    });

    const ask = (q) => {
        write(chain.ask(q));
        render();
    };
    presets.forEach((el) => el.addEventListener('click', () => ask(el.dataset.q)));
    $('[data-ask-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!question.value.trim()) return;
        ask(question.value);
        question.value = '';
    });

    // ---- The record: an edit is live for the very next answer ----
    const editable = new Set(FIELDS.map((f) => f.key));
    all('[data-key]').forEach((input) => {
        input.addEventListener('input', () => {
            if (editable.has(input.dataset.key)) record[input.dataset.key] = input.value;
        });
    });

    render();
}
