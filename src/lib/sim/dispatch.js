/* ==========================================================================
   CrashGuard, from impact to an answered call.

   This is the part of CrashGuard the detector exists to serve: an impact
   becomes an emergency call with nobody touching a phone. The chain is the
   one documented on /crashguard.html:

     detect -> warn -> offer the override -> escalate -> locate -> call ->
     document

   The real system speaks through Twilio and answers a dispatcher's questions
   with a Claude agent whose prompt holds only the occupant profile and the
   live crash data. None of that runs here. This file models the two things
   that can be stated exactly and tested:

     1. the timing of the chain, including the ten-second cancel window, and
     2. the rule the agent is held to: answer from the record, in one to
        three short sentences, numbers read digit by digit, and say
        "I don't have that information" for anything the record lacks.

   The answering below is a keyword lookup over the record. It contains no
   language model and should not be mistaken for one. What it shares with the
   real agent is the constraint, which is the point of the demonstration.

   Pure and DOM-free, so tests/sim.test.js can run it under node:test.
   ========================================================================== */

/** Dynamic-acceleration trigger, from the CrashGuard specifications. */
export const THRESHOLD_G = 5.0;

export const TIMING = {
    /** Occupant override window, from the specifications. */
    cancelWindowS: 10,
    /** The buzzer beeps faster in the final three seconds. */
    buzzerFastS: 3,
    /** Model value: how long the simulated call takes to connect. */
    ringS: 2.4,
    /** Model value: pacing between spoken briefing lines. */
    lineS: 1.1,
    /** "After a few exchanges" the system offers the written report. */
    offerReportAfter: 3,
};

export const REFUSAL = "I don't have that information.";

/** The seven steps of the chain, in the write-up's own words. */
export const STAGES = ['Detect', 'Warn', 'Override', 'Escalate', 'Locate', 'Call', 'Document'];

// ---- Speech ----------------------------------------------------------------

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** Read a number digit by digit: "12.0" becomes "one two point zero". */
export function speakNumber(value) {
    return String(value)
        .split('')
        .map((ch) => (ch === '.' ? 'point' : ch === '-' ? 'minus' : (WORDS[ch] ?? ch)))
        .join(' ');
}

/** Read a phone number in its written groups: "575-555-0142". */
export function speakPhone(value) {
    return String(value)
        .split(/\D+/)
        .filter(Boolean)
        .map((group) => speakNumber(group))
        .join(', ');
}

/** Replace every number inside a sentence with its digit-by-digit reading. */
export function speakText(text) {
    return String(text).replace(/\d+(?:\.\d+)?/g, (m) => speakNumber(m));
}

// ---- Geometry: distance and bearing to the closest hospital ---------------

const EARTH_MILES = 3958.8;
const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two { lat, lon } points, in miles. */
export function haversineMiles(a, b) {
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, in degrees clockwise from north. */
export function bearingDeg(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** Eight-point compass name for a bearing. */
export const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// ---- The record ------------------------------------------------------------

/**
 * A fictional occupant and fictional map results. Nothing here describes a
 * real person, address or hospital; the coordinates are a point in Las
 * Cruces chosen only so the distance and bearing have something to compute.
 */
export const SAMPLE = {
    name: 'Jordan Avery',
    bloodType: 'O positive',
    conditions: 'Type 1 diabetes',
    allergies: 'Penicillin',
    medications: 'Insulin',
    contact: 'Sam Avery, sibling',
    contactPhone: '575-555-0142',
    vehicle: 'gray 2019 sedan',
    lat: 32.283,
    lon: -106.748,
    address: '1500 Sample Street',
    city: 'Las Cruces, New Mexico',
    crossStreets: 'Sample Street and Example Avenue',
    hospital: 'Sample General Hospital',
    hospitalLat: 32.3105,
    hospitalLon: -106.779,
};

/** Fields a visitor can edit, in the order the record is shown. */
export const FIELDS = [
    { key: 'name', label: 'Name', group: 'Occupant profile' },
    { key: 'bloodType', label: 'Blood type', group: 'Occupant profile' },
    { key: 'conditions', label: 'Medical conditions', group: 'Occupant profile' },
    { key: 'allergies', label: 'Allergies', group: 'Occupant profile' },
    { key: 'medications', label: 'Medications', group: 'Occupant profile' },
    { key: 'contact', label: 'Emergency contact', group: 'Occupant profile' },
    { key: 'contactPhone', label: 'Contact phone', group: 'Occupant profile' },
    { key: 'vehicle', label: 'Vehicle', group: 'Occupant profile' },
    { key: 'address', label: 'Nearest address', group: 'Map lookup' },
    { key: 'city', label: 'City', group: 'Map lookup' },
    { key: 'crossStreets', label: 'Cross streets', group: 'Map lookup' },
    { key: 'hospital', label: 'Closest hospital', group: 'Map lookup' },
];

const present = (v) => (typeof v === 'string' ? v.trim() !== '' : typeof v === 'number' && Number.isFinite(v));
const text = (v) => (present(v) ? String(v).trim() : null);

/**
 * Everything the agent is given, and nothing else. A field that is empty in
 * the record is null here, which is how a gap is marked unavailable: the
 * agent then says it does not have it.
 */
export function context(record, crash = {}) {
    const fix = present(record.lat) && present(record.lon) ? { lat: record.lat, lon: record.lon } : null;
    const hospitalFix = present(record.hospitalLat) && present(record.hospitalLon) ? { lat: record.hospitalLat, lon: record.hospitalLon } : null;
    const hospital = text(record.hospital);
    return {
        name: text(record.name),
        bloodType: text(record.bloodType),
        conditions: text(record.conditions),
        allergies: text(record.allergies),
        medications: text(record.medications),
        contact: text(record.contact),
        contactPhone: text(record.contactPhone),
        vehicle: text(record.vehicle),
        fix,
        address: text(record.address),
        city: text(record.city),
        crossStreets: text(record.crossStreets),
        hospital,
        hospitalMiles: hospital && fix && hospitalFix ? haversineMiles(fix, hospitalFix) : null,
        hospitalBearing: hospital && fix && hospitalFix ? compass(bearingDeg(fix, hospitalFix)) : null,
        peakG: present(crash.peakG) ? crash.peakG : null,
        elapsedS: present(crash.elapsedS) ? crash.elapsedS : null,
    };
}

const coords = (fix) => `${speakNumber(Math.abs(fix.lat).toFixed(4))} ${fix.lat >= 0 ? 'north' : 'south'}, ${speakNumber(Math.abs(fix.lon).toFixed(4))} ${fix.lon >= 0 ? 'east' : 'west'}`;

// ---- The opening briefing --------------------------------------------------

/**
 * The spoken briefing, in the order the write-up lists it: name, GPS
 * coordinates and nearest address, peak impact force, blood type, medical
 * conditions, primary emergency contact. A missing item is said to be
 * missing; it is never skipped silently and never filled in.
 */
export function briefing(ctx) {
    const line = (textOut, uses = []) => ({ text: speakText(textOut), uses });
    const out = [line('This is an automated crash alert from CrashGuard.')];
    out.push(ctx.name ? line(`The occupant is ${ctx.name}.`, ['name']) : line('The occupant name is not on file.', ['name']));
    if (ctx.fix && ctx.address) {
        out.push({ text: `GPS coordinates are ${coords(ctx.fix)}. ${speakText(`The nearest address is ${ctx.address}${ctx.city ? `, ${ctx.city}` : ''}.`)}`, uses: ['fix', 'address', 'city'] });
    } else if (ctx.fix) {
        out.push({ text: `GPS coordinates are ${coords(ctx.fix)}. No street address is available.`, uses: ['fix', 'address'] });
    } else {
        out.push(line('No location fix is available.', ['fix', 'address']));
    }
    out.push(ctx.peakG !== null ? line(`Peak impact was ${ctx.peakG.toFixed(1)} g.`, ['peak']) : line('Peak impact is not available.', ['peak']));
    out.push(ctx.bloodType ? line(`Blood type is ${ctx.bloodType}.`, ['bloodType']) : line('Blood type is not on file.', ['bloodType']));
    out.push(ctx.conditions ? line(`Medical conditions on file: ${ctx.conditions}.`, ['conditions']) : line('No medical conditions are on file.', ['conditions']));
    if (ctx.contact) {
        const phone = ctx.contactPhone ? ` The number is ${speakPhone(ctx.contactPhone)}.` : '';
        out.push({ text: `${speakText(`The primary emergency contact is ${ctx.contact}.`)}${phone}`, uses: ['contact', 'contactPhone'] });
    } else {
        out.push(line('No emergency contact is on file.', ['contact']));
    }
    return out;
}

// ---- Answering -------------------------------------------------------------

const refuse = (reason, uses = []) => ({ text: REFUSAL, grounded: false, reason, uses });
const say = (topic, textOut, uses) => ({ text: textOut, grounded: true, topic, uses });

/**
 * Topics in priority order. Each has the words that select it and a function
 * that either builds an answer from the context or returns null when the
 * field it needs is missing.
 *
 * The patterns are deliberately narrow. A loose one answers the wrong
 * question: "did the occupant cancel?" once came back as the occupant's
 * name, because the word "occupant" selected the name topic. Anything that
 * does not clearly ask for a field falls through to the refusal, which is
 * the same direction the real agent is told to fail in.
 */
const TOPICS = [
    {
        id: 'report',
        test: /\breport\b|send (me|it|that|us)|text (me|it|us)|e-?mail/,
        build: () => say('report', 'A written incident report is ready. I can send it by text message or email.', []),
    },
    {
        // Things no sensor on the board measures. The honest answer is the refusal.
        id: 'no-sensor',
        test: /conscious|awake|breath|bleed|injur|\bhurt|\bpain|trapped|pinned|\bfire\b|smoke|fuel|leak|airbag|seat ?belt|how many (people|passengers|occupants|persons|were|are)|passenger|anyone else|other (car|vehicle|driver)|speed|how fast|what happened|\bcause|drunk|alcohol|pulse|alive|\bdead|responsive|talking|moving/,
        build: () => null,
    },
    {
        id: 'hospital',
        test: /hospital|\ber\b|emergency room|trauma|medical cent/,
        build: (c) =>
            c.hospital && c.hospitalMiles !== null
                ? say('hospital', `The closest hospital is ${speakText(c.hospital)}, ${speakNumber(c.hospitalMiles.toFixed(1))} miles to the ${c.hospitalBearing}.`, ['hospital', 'fix'])
                : null,
        needs: ['hospital'],
    },
    {
        id: 'crossStreets',
        test: /cross ?streets?|intersection|\bcorner\b/,
        build: (c) => (c.crossStreets ? say('crossStreets', speakText(`The nearest cross streets are ${c.crossStreets}.`), ['crossStreets']) : null),
        needs: ['crossStreets'],
    },
    {
        id: 'contact',
        test: /\bcontact\b|next of kin|who (should|can|do) (we|i) (call|notify)|\bnotify\b/,
        build: (c) => {
            if (!c.contact) return null;
            const phone = c.contactPhone ? ` The number is ${speakPhone(c.contactPhone)}.` : '';
            return say('contact', `${speakText(`The primary emergency contact is ${c.contact}.`)}${phone}`, ['contact', 'contactPhone']);
        },
        needs: ['contact'],
    },
    { id: 'bloodType', test: /blood (type|group)|type of blood/, build: (c) => (c.bloodType ? say('bloodType', speakText(`Blood type is ${c.bloodType}.`), ['bloodType']) : null), needs: ['bloodType'] },
    { id: 'allergies', test: /allerg/, build: (c) => (c.allergies ? say('allergies', speakText(`Allergies on file: ${c.allergies}.`), ['allergies']) : null), needs: ['allergies'] },
    {
        id: 'medications',
        test: /medication|medicine|\bmeds\b|prescri|\bdrugs?\b/,
        build: (c) => (c.medications ? say('medications', speakText(`Medications on file: ${c.medications}.`), ['medications']) : null),
        needs: ['medications'],
    },
    {
        id: 'conditions',
        test: /medical (condition|history|issue|problem)|\bconditions?\b|health (condition|issue|problem)|diabet|asthma|illness/,
        build: (c) => (c.conditions ? say('conditions', speakText(`Medical conditions on file: ${c.conditions}.`), ['conditions']) : null),
        needs: ['conditions'],
    },
    {
        id: 'peak',
        test: /impact|how hard|force|g-force|severity|how bad|how severe|\bg'?s?\b/,
        build: (c) => (c.peakG !== null ? say('peak', `Peak impact was ${speakNumber(c.peakG.toFixed(1))} g.`, ['peak']) : null),
        needs: ['peak'],
    },
    {
        id: 'time',
        test: /when (did|was)|what time|how long (ago|has|since)/,
        build: (c) => (c.elapsedS !== null ? say('time', `The crash was detected ${speakNumber(Math.round(c.elapsedS))} seconds ago.`, ['elapsed']) : null),
        needs: ['elapsed'],
    },
    { id: 'city', test: /\bcity\b|\btown\b|what area/, build: (c) => (c.city ? say('city', speakText(`The crash is in ${c.city}.`), ['city']) : null), needs: ['city'] },
    {
        id: 'coordinates',
        test: /coordinates?|\bgps\b|latitude|longitude/,
        build: (c) => (c.fix ? say('coordinates', `GPS coordinates are ${coords(c.fix)}.`, ['fix']) : null),
        needs: ['fix'],
    },
    {
        id: 'location',
        test: /where|location|address|street/,
        build: (c) => {
            if (c.address) return say('location', speakText(`The vehicle is at ${c.address}${c.city ? `, ${c.city}` : ''}.`), ['address', 'city']);
            if (c.fix) return say('location', `I don't have a street address. GPS coordinates are ${coords(c.fix)}.`, ['address', 'fix']);
            return null;
        },
        needs: ['address', 'fix'],
    },
    // The profile holds a vehicle description and nothing that identifies it.
    { id: 'not-on-file', test: /plate|license|licence|\bvin\b|registration|insurance/, build: () => null },
    {
        id: 'vehicle',
        test: /(what|which) (kind of |type of |sort of )?(vehicle|car|truck)|(vehicle|car) (description|details)|describe the (vehicle|car)|\bmake\b|\bmodel\b|colou?r/,
        build: (c) => (c.vehicle ? say('vehicle', speakText(`The vehicle on file is a ${c.vehicle}.`), ['vehicle']) : null),
        needs: ['vehicle'],
    },
    {
        id: 'name',
        test: /\bname\b|who (is|was) (the|this)|who's (the|this)|identity/,
        build: (c) => (c.name ? say('name', speakText(`The occupant is ${c.name}.`), ['name']) : null),
        needs: ['name'],
    },
];

/**
 * Answer one dispatcher question from the context.
 *
 * Returns { text, grounded, uses, topic | reason }. `uses` names the fields
 * the answer was read from, or the field it looked for and found empty, so a
 * caller can show exactly where an answer came from. A question that matches
 * nothing, or asks about something the system has no way to know, gets the
 * refusal and an empty `uses`.
 */
export function answer(question, ctx) {
    const q = String(question).toLowerCase();
    if (!q.trim()) return refuse('empty');
    for (const topic of TOPICS) {
        if (!topic.test.test(q)) continue;
        const built = topic.build(ctx);
        if (built) return built;
        if (topic.id === 'no-sensor') return refuse('no-sensor');
        if (topic.id === 'not-on-file') return refuse('not-on-file');
        return refuse('missing', topic.needs ?? []);
    }
    return refuse('unknown');
}

// ---- The written report ----------------------------------------------------

/** The incident report's rows. Written, so numbers stay as numerals. */
export function incidentReport(ctx) {
    const na = 'Not available';
    return [
        ['Detected', ctx.elapsedS !== null ? `${Math.round(ctx.elapsedS)} s before this report` : na],
        ['Peak impact', ctx.peakG !== null ? `${ctx.peakG.toFixed(1)} g` : na],
        ['Coordinates', ctx.fix ? `${ctx.fix.lat.toFixed(4)}, ${ctx.fix.lon.toFixed(4)}` : na],
        ['Address', ctx.address ? `${ctx.address}${ctx.city ? `, ${ctx.city}` : ''}` : na],
        ['Cross streets', ctx.crossStreets ?? na],
        ['Nearest hospital', ctx.hospital && ctx.hospitalMiles !== null ? `${ctx.hospital}, ${ctx.hospitalMiles.toFixed(1)} mi ${ctx.hospitalBearing}` : na],
        ['Occupant', ctx.name ?? na],
        ['Blood type', ctx.bloodType ?? na],
        ['Conditions', ctx.conditions ?? na],
        ['Allergies', ctx.allergies ?? na],
        ['Medications', ctx.medications ?? na],
        ['Emergency contact', ctx.contact ? `${ctx.contact}${ctx.contactPhone ? `, ${ctx.contactPhone}` : ''}` : na],
        ['Vehicle', ctx.vehicle ?? na],
    ];
}

// ---- The chain -------------------------------------------------------------

const sys = (kind, textOut) => ({ who: 'system', kind, text: textOut });

/**
 * The chain as a state machine.
 *
 *   ARMED -> WARNING -> (cancel) -> ARMED
 *                    -> DIALING -> BRIEFING -> LISTENING -> ENDED
 *
 * Every method returns the events it caused, oldest first, so a caller can
 * append them to a transcript. `getContext` supplies the record at the
 * moment it is needed, which is what lets an edit to the record change the
 * very next answer.
 */
export class Chain {
    constructor({ getContext, timing = {} } = {}) {
        this.timing = { ...TIMING, ...timing };
        this.getContext = getContext ?? (() => context(SAMPLE, { peakG: this.peakG, elapsedS: this.sinceImpact }));
        this.reset();
    }

    reset() {
        this.state = 'ARMED';
        this.countdown = 0;
        this.peakG = null;
        this.sinceImpact = 0;
        this.buzzed = false;
        this.ring = 0;
        this.located = false;
        this.lines = [];
        this.nextLine = 0;
        this.gap = 0;
        this.exchanges = 0;
        this.offered = false;
        this.reported = false;
    }

    /** How far down the seven stages the chain has reached; -1 while armed. */
    get stage() {
        if (this.state === 'ARMED') return -1;
        if (this.state === 'WARNING') return 2;
        if (this.state === 'DIALING') return this.located ? 4 : 3;
        return this.offered || this.reported ? 6 : 5;
    }

    /** A measured impact, in g. Only an armed system reacts. */
    impact(peakG) {
        if (this.state !== 'ARMED') return [];
        if (!(peakG > THRESHOLD_G)) {
            return [sys('below', `Peak ${peakG.toFixed(1)} g. Under the ${THRESHOLD_G.toFixed(1)} g threshold, so nothing happens.`)];
        }
        this.state = 'WARNING';
        this.countdown = this.timing.cancelWindowS;
        this.peakG = peakG;
        this.sinceImpact = 0;
        this.buzzed = false;
        return [
            sys('detected', `Impact detected. Peak ${peakG.toFixed(1)} g, over the ${THRESHOLD_G.toFixed(1)} g threshold.`),
            sys('warn', `The phone dashboard shows CRASH DETECTED with a ${this.timing.cancelWindowS}-second countdown, and the phone vibrates.`),
        ];
    }

    /** The occupant pressed CANCEL - I'M OK. Only counts inside the window. */
    cancel() {
        if (this.state !== 'WARNING') return [];
        this.reset();
        return [{ who: 'occupant', kind: 'cancelled', text: "CANCEL - I'M OK pressed. The alert is dismissed and the system re-arms. No call is placed." }];
    }

    /** Demo convenience, not a feature of the system: end the wait now. */
    skip() {
        if (this.state === 'WARNING') this.countdown = 0;
    }

    tick(dt) {
        const out = [];
        if (this.state === 'ARMED' || this.state === 'ENDED') return out;
        this.sinceImpact += dt;

        if (this.state === 'WARNING') {
            this.countdown = Math.max(0, this.countdown - dt);
            if (!this.buzzed && this.countdown <= this.timing.buzzerFastS) {
                this.buzzed = true;
                out.push(sys('buzzer', 'Final three seconds. The buzzer on the car beeps faster.'));
            }
            if (this.countdown <= 0) {
                this.state = 'DIALING';
                this.ring = this.timing.ringS;
                this.located = false;
                out.push(sys('escalated', 'The countdown ran out with no cancel. The board pushes a Bluetooth alert to the host, which starts the call.'));
                out.push(sys('dialing', 'Calling the dispatcher. The map lookups run in the background while the phone rings.'));
            }
        } else if (this.state === 'DIALING') {
            this.ring -= dt;
            if (!this.located && this.ring <= this.timing.ringS / 2) {
                this.located = true;
                out.push(sys('located', 'Location resolved from the live GPS fix: address, city, cross streets and closest hospital.'));
            }
            if (this.ring <= 0) {
                this.state = 'BRIEFING';
                this.lines = briefing(this.getContext());
                this.nextLine = 0;
                this.gap = 0;
                out.push(sys('connected', 'The dispatcher answers. The briefing is spoken first.'));
            }
        } else if (this.state === 'BRIEFING') {
            this.gap -= dt;
            while (this.gap <= 0 && this.nextLine < this.lines.length) {
                const line = this.lines[this.nextLine];
                out.push({ who: 'agent', kind: 'briefing', text: line.text, uses: line.uses });
                this.nextLine += 1;
                this.gap += this.timing.lineS;
            }
            if (this.nextLine >= this.lines.length) {
                this.state = 'LISTENING';
                out.push(sys('listening', 'Briefing delivered. The agent is now listening for questions.'));
            }
        }
        return out;
    }

    /** The dispatcher asks something. Only answered once the agent is listening. */
    ask(question) {
        if (this.state !== 'LISTENING') return [];
        const q = String(question).trim();
        if (!q) return [];
        const reply = answer(q, this.getContext());
        const out = [
            { who: 'dispatcher', kind: 'question', text: q },
            { who: 'agent', kind: reply.grounded ? 'answer' : 'refusal', text: reply.text, uses: reply.uses, reason: reply.reason, topic: reply.topic },
        ];
        this.exchanges += 1;
        if (reply.topic === 'report') {
            // A request for the report is recognised at any point in the call.
            this.offered = true;
            this.reported = true;
            out.push(sys('report', 'The report is published to the phone dashboard first, then sent. That path cannot be blocked by a carrier.'));
        } else if (!this.offered && this.exchanges >= this.timing.offerReportAfter) {
            this.offered = true;
            out.push({ who: 'agent', kind: 'offer', text: 'I can send a full written incident report by text message or email.', uses: [] });
        }
        return out;
    }

    hangUp() {
        if (this.state !== 'DIALING' && this.state !== 'BRIEFING' && this.state !== 'LISTENING') return [];
        this.state = 'ENDED';
        return [sys('ended', 'Call ended.')];
    }

    rearm() {
        if (this.state === 'ARMED') return [];
        this.reset();
        return [sys('rearmed', 'Re-armed and monitoring.')];
    }
}
