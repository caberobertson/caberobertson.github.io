/* ==========================================================================
   Resume tailor
   Reads a job posting (photos, screenshots, or pasted text), a resume, and
   optionally this site's own write-ups, then asks Claude for a one-page
   LaTeX resume aimed at that posting. Everything runs in the browser with
   the visitor's own API key; nothing is contacted until a button is pressed.
   ========================================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { wrapDocument, extractBody, BODY_EXAMPLE } from '../lib/resumeTemplate.js';

const $ = (id) => document.getElementById(id);
const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- prompt ---

const SYSTEM = `You rewrite a candidate's resume for one specific job posting and return it as LaTeX. The result goes straight to a recruiter and an applicant tracking system, so it has to be the strongest truthful version of this candidate for this role.

How to work:
1. Read the posting (it may arrive as photos or screenshots). Pull out the role title, the required and preferred qualifications, the tools and methods it names, and the order of its priorities.
2. Read the resume and any portfolio context. The portfolio is the candidate's own website, so its facts are as usable as the resume's. Where the two disagree, the more specific or more recent statement wins.
3. Rebuild the resume around the posting. Lead with the experience and projects that match it best, drop or shrink what does not help, and reorder sections to suit the role. Use the posting's own wording for a skill wherever the candidate really has that skill, because tracking systems match on exact terms. Keep every number the candidate already has and prefer bullets that end in a measured result.
4. Infer skills. Candidates leave out things their work plainly required. If someone wrote direct I2C burst reads to fix a sensor library, they can read a datasheet, debug at the register level, and write embedded C, whether or not the resume says so. Add skills like that when the posting values them, in the skills section or inside the bullet that proves them. The test for each one: would an engineer who read the evidence expect this person to answer interview questions on it? Report every inferred skill with its evidence so the candidate can remove any they would not defend.

Limits on what you may write:
- Never invent or alter employers, job titles, dates, degrees, GPAs, awards, certifications, clearances, or numbers.
- Never add a tool or method that nothing in the material supports. If the posting requires something the candidate shows no sign of, leave it out of the resume and list it as a gap with a concrete suggestion.

Writing style, which the candidate cares about a great deal:
- Write like a careful engineer. Each bullet starts with a past tense verb (present tense for ongoing work) and says what was done and what came of it.
- No em dashes and no en dashes anywhere. Date ranges use a plain hyphen with spaces, for example "Jul 2026 - Present". Elsewhere use commas or split the sentence.
- No contrast framing of the form "not X but Y", "rather than X, Y", or "more than just X".
- None of these words: leveraged, spearheaded, utilized, passionate, cutting-edge, seamless, robust, innovative, dynamic, synergy, delve, showcasing, demonstrating, fostering, pivotal, comprehensive.
- No trailing clauses that only praise the work, and no lists of three adjectives.
- No first person. No periods at the end of bullets.

LaTeX rules:
- Write only the document body. The preamble is fixed and already defines everything you need.
- Use only these macros: \\resumeheader{name}{contact line}, \\section{Title}, \\entry{left}{right}, \\plainline{left}{right}, \\skillline{Label}{items}, the bullets environment with \\item, plus \\textbf, \\textit, and \\href{url}{text}.
- Escape special characters: \\&, \\%, \\$, \\#, \\_. No math mode, no other commands, no comments.
- It must fit on one US letter page at 10pt with half inch margins. That is about 56 lines in total, counting section titles, and a bullet longer than about 130 characters wraps onto another line. Fill the page without overflowing it.

An example of the body format (the content is made up):
${BODY_EXAMPLE}

Respond with exactly two blocks and nothing else:
<latex>
the document body
</latex>
<report>
{"role": "job title from the posting", "keywords_matched": ["posting terms now on the resume"], "inferred_skills": [{"skill": "name", "evidence": "what in the material supports it"}], "gaps": [{"requirement": "posting requirement with no support", "suggestion": "how the candidate could cover it"}], "changes": ["short plain statements of the main edits"]}
</report>
The report must be valid JSON and follows the same writing style rules.`;

// ----------------------------------------------------------------- state ---

const state = {
    images: [],          // { name, dataUrl, tiles: [base64 jpeg] }
    resumePdf: null,     // { name, data } when the resume is an uploaded PDF
    context: null,       // { resume, site } from /resume-context.json
    conversation: null,  // messages of the last successful run, for revisions
    useBeta: true,
    stream: null,
    pdfUrl: null,
};

const loadContext = async () => {
    if (!state.context) {
        const res = await fetch('/resume-context.json');
        if (!res.ok) throw new Error('Could not load the site context file.');
        state.context = await res.json();
    }
    return state.context;
};

// ---------------------------------------------------------------- images ---

const MAX_W = 1400;
const TILE_H = 1800;

/** Scale to a readable width, then slice tall screenshots into tiles so a
    long posting is not squashed into one unreadable strip. */
const prepareImage = async (file) => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_W / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const tiles = [];
    const count = Math.ceil(h / TILE_H);
    const tileH = Math.ceil(h / count);
    for (let i = 0; i < count; i++) {
        const canvas = document.createElement('canvas');
        const th = Math.min(tileH, h - i * tileH);
        canvas.width = w;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, th);
        ctx.drawImage(bitmap, 0, (i * tileH) / scale, bitmap.width, th / scale, 0, 0, w, th);
        tiles.push(canvas.toDataURL('image/jpeg', 0.9));
    }
    bitmap.close?.();
    return { name: file.name || 'pasted image', dataUrl: tiles[0], tiles: tiles.map((t) => t.split(',')[1]) };
};

const renderThumbs = () => {
    const box = $('rt-thumbs');
    box.replaceChildren();
    state.images.forEach((img, i) => {
        const fig = document.createElement('div');
        fig.className = 'rt-thumb';
        const im = document.createElement('img');
        im.src = img.dataUrl;
        im.alt = `Job posting image ${i + 1}`;
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = 'Remove';
        rm.setAttribute('aria-label', `Remove image ${i + 1}`);
        rm.addEventListener('click', () => { state.images.splice(i, 1); renderThumbs(); });
        fig.append(im, rm);
        box.append(fig);
    });
};

const addImages = async (files) => {
    for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        try {
            state.images.push(await prepareImage(f));
        } catch {
            setStatus(`Could not read ${f.name || 'that image'}. Try a JPEG or PNG.`, true);
        }
    }
    renderThumbs();
};

// ---------------------------------------------------------------- status ---

const setStatus = (msg, isError = false) => {
    const el = $('rt-status');
    el.textContent = msg;
    el.classList.toggle('is-error', isError);
};

const setBusy = (busy) => {
    $('rt-generate').hidden = busy;
    $('rt-stop').hidden = !busy;
    $('rt-revise-btn').disabled = busy;
};

// --------------------------------------------------------------- preview ---

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Read n balanced {..} groups starting at pos. Returns [args, endPos]. */
const readArgs = (s, pos, n) => {
    const args = [];
    let i = pos;
    for (let k = 0; k < n; k++) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] !== '{') return [args, i];
        let depth = 0;
        const start = i + 1;
        for (; i < s.length; i++) {
            if (s[i] === '\\') { i++; continue; }
            if (s[i] === '{') depth++;
            else if (s[i] === '}' && --depth === 0) break;
        }
        args.push(s.slice(start, i));
        i++;
    }
    return [args, i];
};

const inline = (src) => {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '\\') {
            const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
            const name = m[1];
            i += m[0].length;
            if (name === 'textbf' || name === 'textit' || name === 'emph') {
                const [[a = ''], end] = readArgs(src, i, 1);
                const tag = name === 'textbf' ? 'strong' : 'em';
                out += `<${tag}>${inline(a)}</${tag}>`;
                i = end;
            } else if (name === 'href') {
                const [[url = '', text = ''], end] = readArgs(src, i, 2);
                const safe = /^(https?:|mailto:)/.test(url) ? url : '#';
                out += `<a href="${esc(safe)}" target="_blank" rel="noopener">${inline(text)}</a>`;
                i = end;
            } else if (name === '\\') {
                out += '<br>';
            } else if ('&%$#_{}'.includes(name)) {
                out += esc(name);
            } else if (name === ',' || name === ' ') {
                out += ' ';
            }
            // Any other command is dropped; its braces fall through as text.
        } else if (c === '~') { out += '&nbsp;'; i++; }
        else if (c === '{' || c === '}') { i++; }
        else if (c === '%') { while (i < src.length && src[i] !== '\n') i++; }
        else { out += esc(c); i++; }
    }
    return out;
};

const renderPreview = (tex) => {
    const body = extractBody(tex);
    let html = '';
    let i = 0;
    let para = '';
    const flush = () => { if (para.trim()) html += `<p>${inline(para.trim())}</p>`; para = ''; };
    while (i < body.length) {
        const rest = body.slice(i);
        let m;
        if ((m = /^\\(resumeheader|entry|plainline|skillline)\b/.exec(rest))) {
            flush();
            const [[a = '', b = ''], end] = readArgs(body, i + m[0].length, 2);
            if (m[1] === 'resumeheader') html += `<header><div class="rt-name">${inline(a)}</div><div class="rt-contact">${inline(b)}</div></header>`;
            else if (m[1] === 'skillline') html += `<p><strong>${inline(a)}:</strong> ${inline(b)}</p>`;
            else html += `<div class="rt-row${m[1] === 'entry' ? ' rt-entry' : ''}"><span>${inline(a)}</span><span>${inline(b)}</span></div>`;
            i = end;
        } else if ((m = /^\\section\*?/.exec(rest))) {
            flush();
            const [[a = ''], end] = readArgs(body, i + m[0].length, 1);
            html += `<h3>${inline(a)}</h3>`;
            i = end;
        } else if ((m = /^\\begin\{(bullets|itemize)\}(\[[^\]]*\])?/.exec(rest))) {
            flush();
            const close = rest.search(/\\end\{(bullets|itemize)\}/);
            const inner = rest.slice(m[0].length, close < 0 ? undefined : close);
            const items = inner.split(/\\item\b/).slice(1).map((t) => `<li>${inline(t.trim())}</li>`).join('');
            html += `<ul>${items}</ul>`;
            i += close < 0 ? rest.length : close + rest.slice(close).indexOf('}') + 1;
        } else if (rest.startsWith('\n\n')) { flush(); i += 2; }
        else { para += body[i]; i++; }
    }
    flush();
    $('rt-preview').innerHTML = html || '<p class="rt-empty">The resume preview appears here.</p>';
};

// ---------------------------------------------------------------- output ---

/** The model is told not to use dashes; this makes sure of it. */
const scrub = (body) =>
    body
        .replace(/\s*(—|---)\s*/g, ', ')
        .replace(/\s+(–|--)\s+/g, ' - ')
        .replace(/–|(?<=[\w)])--(?=[\w(])/g, '-');

const between = (text, tag) => {
    const open = text.indexOf(`<${tag}>`);
    if (open < 0) return null;
    const start = open + tag.length + 2;
    const close = text.indexOf(`</${tag}>`, start);
    return { text: text.slice(start, close < 0 ? undefined : close), done: close >= 0 };
};

const setEditor = (body) => {
    $('rt-editor').value = wrapDocument(body);
    renderPreview($('rt-editor').value);
};

const renderReport = (raw) => {
    const box = $('rt-report');
    box.replaceChildren();
    let data;
    try { data = JSON.parse(raw.trim().replace(/^```(?:json)?|```$/g, '')); } catch { data = null; }
    if (!data) {
        const pre = document.createElement('pre');
        pre.textContent = raw.trim();
        box.append(pre);
        return;
    }
    const block = (title, node) => {
        if (!node) return;
        const h = document.createElement('h3');
        h.textContent = title;
        box.append(h, node);
    };
    const list = (rows, fmt) => {
        if (!rows?.length) return null;
        const ul = document.createElement('ul');
        ul.className = 'doc-list';
        for (const r of rows) {
            const li = document.createElement('li');
            fmt(li, r);
            ul.append(li);
        }
        return ul;
    };
    const pair = (li, head, tail) => {
        const s = document.createElement('strong');
        s.textContent = head;
        li.append(s, tail ? `: ${tail}` : '');
    };
    if (data.keywords_matched?.length) {
        const tags = document.createElement('div');
        tags.className = 'tags tags--accent';
        for (const k of data.keywords_matched) {
            const t = document.createElement('span');
            t.className = 'tag';
            t.textContent = k;
            tags.append(t);
        }
        block(`Posting keywords now on the resume${data.role ? ` (${data.role})` : ''}`, tags);
    }
    block('Skills inferred from your experience', list(data.inferred_skills, (li, r) => pair(li, r.skill, r.evidence)));
    block('Gaps the posting asks for', list(data.gaps, (li, r) => pair(li, r.requirement, r.suggestion)));
    block('What changed', list(data.changes, (li, r) => li.append(String(r))));
    if (data.inferred_skills?.length) {
        const note = document.createElement('p');
        note.className = 'rt-note';
        note.textContent = 'Inferred skills are educated guesses from your work. Delete any you could not talk through in an interview.';
        box.append(note);
    }
};

// ------------------------------------------------------------------- API ---

const buildFirstMessage = async () => {
    const company = $('rt-company').value.trim();
    const role = $('rt-role').value.trim();
    const postingText = $('rt-posting-text').value.trim();
    const resumeText = $('rt-resume').value.trim();
    const useSite = $('rt-use-site').checked;

    if (!state.images.length && !postingText) throw new Error('Add a photo or screenshot of the job posting, or paste its text.');
    if (!resumeText && !state.resumePdf) throw new Error('Add your resume: paste it, upload it, or load the one from this site.');

    const content = [];
    for (const img of state.images) {
        for (const data of img.tiles) {
            content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
        }
    }
    if (state.resumePdf) {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: state.resumePdf.data } });
    }

    const parts = [];
    parts.push(`Company: ${company || 'not given, read it from the posting'}`);
    if (role) parts.push(`Role title: ${role}`);
    parts.push(state.images.length ? 'The job posting is in the attached image(s), in reading order.' : 'The job posting is the text below.');
    if (postingText) parts.push(`<job_posting_text>\n${postingText}\n</job_posting_text>`);
    if (state.resumePdf) parts.push('The candidate\'s resume is the attached PDF.');
    if (resumeText) parts.push(`<resume>\n${resumeText}\n</resume>`);
    if (useSite) {
        const ctx = await loadContext();
        parts.push(`<portfolio_site>\n${ctx.site}\n</portfolio_site>`);
    }
    parts.push('Write the tailored resume for this posting.');
    content.push({ type: 'text', text: parts.join('\n\n') });
    return { role: 'user', content };
};

const explain = (err) => {
    if (err instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it and try again.';
    if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use the selected model.';
    if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a minute and try again.';
    if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.';
    if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your connection.';
    if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ''}: ${err.message}`;
    return err?.message || 'Something went wrong.';
};

const callClaude = async (messages) => {
    const apiKey = $('rt-key').value.trim();
    if (!apiKey) throw new Error('Enter your Anthropic API key first.');
    store.set('rt.key', $('rt-remember').checked ? apiKey : '');
    store.set('rt.model', $('rt-model').value);

    // The key belongs to the person typing it and never leaves their browser
    // except to api.anthropic.com, which is what this flag acknowledges.
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const base = {
        model: $('rt-model').value,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: SYSTEM,
        messages,
    };

    const run = async (useBeta) => {
        // If a safety classifier declines the request, the fallback setting
        // lets the API finish it on another model inside the same call.
        const stream = useBeta
            ? client.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
            : client.messages.stream(base);
        state.stream = stream;
        let seen = false;
        stream.on('text', (_delta, snapshot) => {
            seen = true;
            const latex = between(snapshot, 'latex');
            if (latex) {
                setEditor(latex.text);
                setStatus(latex.done ? 'Writing the match report...' : 'Writing the resume...');
            }
        });
        try {
            return await stream.finalMessage();
        } catch (err) {
            err.rtSawOutput = seen;
            throw err;
        }
    };

    let message;
    try {
        message = await run(state.useBeta);
    } catch (err) {
        // The fallback option is a beta feature. If this account or model
        // rejects the request shape outright, run once more without it.
        if (state.useBeta && err instanceof Anthropic.BadRequestError && !err.rtSawOutput) {
            state.useBeta = false;
            message = await run(false);
        } else {
            throw err;
        }
    } finally {
        state.stream = null;
    }

    if (message.stop_reason === 'refusal') throw new Error('The model declined this request. Try again or remove unusual content from the posting.');
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const latex = between(text, 'latex');
    if (!latex) throw new Error('The model did not return a resume. Try again.');
    setEditor(scrub(latex.text));
    const report = between(text, 'report');
    if (report) renderReport(report.text);
    if (message.stop_reason === 'max_tokens') setStatus('The reply was cut off at the length limit. The resume may be incomplete.', true);
    return message;
};

const generate = async () => {
    setBusy(true);
    setStatus('Reading the posting and your resume...');
    $('rt-report').replaceChildren();
    try {
        const first = await buildFirstMessage();
        const message = await callClaude([first]);
        state.conversation = [first, { role: 'assistant', content: message.content }];
        $('rt-output').hidden = false;
        if (message.stop_reason !== 'max_tokens') setStatus('Done. Edit the LaTeX directly, or ask for a revision below.');
        store.set('rt.resume', $('rt-resume').value);
    } catch (err) {
        setStatus(explain(err), true);
    } finally {
        setBusy(false);
    }
};

const revise = async () => {
    const ask = $('rt-revise').value.trim();
    if (!ask) return;
    if (!state.conversation) { setStatus('Generate a resume first, then ask for changes.', true); return; }
    setBusy(true);
    setStatus('Revising...');
    const current = extractBody($('rt-editor').value);
    const turn = {
        role: 'user',
        content: `This is the resume body as it stands now, including my own edits:\n<latex>\n${current}\n</latex>\n\nChange request: ${ask}\n\nReturn the full updated body and report in the same two block format.`,
    };
    try {
        const message = await callClaude([...state.conversation, turn]);
        state.conversation.push(turn, { role: 'assistant', content: message.content });
        $('rt-revise').value = '';
        if (message.stop_reason !== 'max_tokens') setStatus('Revision done.');
    } catch (err) {
        setStatus(explain(err), true);
    } finally {
        setBusy(false);
    }
};

// --------------------------------------------------------------- exports ---

const fileStem = () => {
    const company = $('rt-company').value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nameMatch = /\\resumeheader\{([^}]*)\}/.exec($('rt-editor').value);
    const name = (nameMatch ? nameMatch[1] : 'Resume').trim().replace(/[^A-Za-z0-9]+/g, '_');
    return [name, 'Resume', company].filter(Boolean).join('_');
};

const download = (blob, filename) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

const compilePdf = async () => {
    const tex = $('rt-editor').value;
    if (!tex.trim()) return;
    const btn = $('rt-compile');
    btn.disabled = true;
    setStatus('Compiling the PDF...');
    try {
        const res = await fetch('https://latex.ytotech.com/builds/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ compiler: 'pdflatex', resources: [{ main: true, content: tex }] }),
        });
        const type = res.headers.get('Content-Type') || '';
        if (!res.ok || !type.includes('pdf')) {
            let detail = '';
            try { detail = (await res.json()).logs || ''; } catch { /* not JSON */ }
            const line = /^!.*$/m.exec(detail);
            throw new Error(line ? `LaTeX error: ${line[0]}` : `The compile service answered ${res.status}.`);
        }
        const blob = await res.blob();
        if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
        state.pdfUrl = URL.createObjectURL(blob);
        $('rt-pdf').src = state.pdfUrl;
        $('rt-pdf-wrap').hidden = false;
        const save = $('rt-pdf-save');
        save.href = state.pdfUrl;
        save.download = `${fileStem()}.pdf`;
        setStatus('PDF compiled.');
    } catch (err) {
        setStatus(`${err.message || 'Compile failed.'} You can still open the file in Overleaf or download the .tex.`, true);
    } finally {
        btn.disabled = false;
    }
};

const openInOverleaf = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.overleaf.com/docs';
    form.target = '_blank';
    const add = (name, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.append(input);
    };
    add('snip', $('rt-editor').value);
    add('snip_name', fileStem());
    add('engine', 'pdflatex');
    document.body.append(form);
    form.submit();
    form.remove();
};

// ------------------------------------------------------------------ wire ---

const init = () => {
    if (!$('rt-generate')) return;

    $('rt-key').value = store.get('rt.key') || '';
    $('rt-remember').checked = Boolean(store.get('rt.key'));
    const model = store.get('rt.model');
    if (model && [...$('rt-model').options].some((o) => o.value === model)) $('rt-model').value = model;
    $('rt-resume').value = store.get('rt.resume') || '';

    for (const id of ['rt-files', 'rt-camera']) {
        $(id).addEventListener('change', async (e) => { await addImages(e.target.files); e.target.value = ''; });
    }
    const drop = $('rt-drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); addImages(e.dataTransfer.files); });
    document.addEventListener('paste', (e) => {
        const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) { e.preventDefault(); addImages(files); }
    });

    $('rt-load-mine').addEventListener('click', async () => {
        try {
            $('rt-resume').value = (await loadContext()).resume;
            state.resumePdf = null;
            $('rt-resume-file-name').textContent = '';
        } catch (err) { setStatus(err.message, true); }
    });
    $('rt-resume-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(f);
            });
            state.resumePdf = { name: f.name, data: String(dataUrl).split(',')[1] };
            $('rt-resume-file-name').textContent = `Using ${f.name}. Anything typed in the box is sent along with it.`;
        } else {
            $('rt-resume').value = await f.text();
            state.resumePdf = null;
            $('rt-resume-file-name').textContent = '';
        }
    });

    $('rt-generate').addEventListener('click', generate);
    $('rt-stop').addEventListener('click', () => state.stream?.abort());
    $('rt-revise-btn').addEventListener('click', revise);
    $('rt-revise').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); revise(); } });

    let timer;
    $('rt-editor').addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => renderPreview($('rt-editor').value), 200);
    });
    $('rt-compile').addEventListener('click', compilePdf);
    $('rt-overleaf').addEventListener('click', openInOverleaf);
    $('rt-download').addEventListener('click', () => download(new Blob([$('rt-editor').value], { type: 'application/x-tex' }), `${fileStem()}.tex`));
    $('rt-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('rt-editor').value); setStatus('LaTeX copied.'); } catch { setStatus('Copy failed. Select the text and copy it by hand.', true); }
    });
};

init();
