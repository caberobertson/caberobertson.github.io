/* Resume tailor, Claude artifact build. Same core as the site page, but the
   request goes to Claude on the viewer's own account through the artifact
   runtime, so there is no key and no copy and paste. */
import { wrapDocument, extractBody } from '../lib/resumeTemplate.js';
import { buildPrompt, revisionPrompt, parseReply, between, previewHtml, renderReport } from '../lib/tailorCore.js';

const CONTEXT = __CONTEXT__;
const $ = (id) => document.getElementById(id);
const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
};

const state = { images: [], turns: null, ctl: null, sample: null, downloads: null };

const setStatus = (msg, isError = false, id = 'status') => {
    const el = $(id);
    el.textContent = msg;
    el.classList.toggle('is-error', isError);
};

const renderPreview = () => { $('preview').innerHTML = previewHtml($('editor').value); };

// ---------------------------------------------------------------- images ---

const MAX_W = 1400;
const TILE_H = 1800;
const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));

/** Scale to a readable width, then slice tall screenshots into tiles so a
    long posting is not squashed into one unreadable strip. */
const prepareImage = async (file) => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_W / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const count = Math.ceil(h / TILE_H);
    const tileH = Math.ceil(h / count);
    const tiles = [];
    let thumb = '';
    for (let i = 0; i < count; i++) {
        const canvas = document.createElement('canvas');
        const th = Math.min(tileH, h - i * tileH);
        canvas.width = w;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, th);
        ctx.drawImage(bitmap, 0, (i * tileH) / scale, bitmap.width, th / scale, 0, 0, w, th);
        if (i === 0) thumb = canvas.toDataURL('image/jpeg', 0.5);
        tiles.push(await toBlob(canvas));
    }
    bitmap.close?.();
    return { thumb, tiles };
};

const renderThumbs = () => {
    const box = $('thumbs');
    box.replaceChildren();
    state.images.forEach((img, i) => {
        const fig = document.createElement('div');
        fig.className = 'thumb';
        const im = document.createElement('img');
        im.src = img.thumb;
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
        try { state.images.push(await prepareImage(f)); } catch { setStatus('Could not read that image. Try a JPEG or PNG.', true); }
    }
    renderThumbs();
};

// ---------------------------------------------------------------- Claude ---

const COPY = {
    not_granted: 'Claude access was declined for this page. Reload and allow it to tailor a resume.',
    rate_limited: 'Your Claude usage limit was reached, or too many requests are running. Wait a bit and try again.',
    cancelled: 'Stopped.',
    prompt_too_large: 'That is too much text for one request. Shorten the posting text or turn off the site material.',
    images_unavailable: 'This view cannot send images to Claude. Paste the posting text instead.',
    image_rejected: 'Claude could not accept one of the images. Remove it or paste the posting text instead.',
};

const setBusy = (busy) => {
    $('generate').hidden = busy;
    $('stop').hidden = !busy;
    $('revise-btn').disabled = busy;
};

const ask = async (turns, images) => {
    state.ctl = new AbortController();
    const opts = {
        modelTier: 'complex',
        cache: false,
        signal: state.ctl.signal,
        onText: ({ text }) => {
            const latex = between(text, 'latex');
            if (!latex) return;
            $('editor').value = wrapDocument(latex.text);
            renderPreview();
            setStatus(latex.done ? 'Writing the match report...' : 'Writing the resume...');
        },
    };
    if (images?.length) opts.images = images;
    const { text, truncated } = await state.sample(turns, opts);
    const parsed = parseReply(text);
    if (!parsed) throw { code: 'no_resume' };
    $('editor').value = wrapDocument(parsed.latex);
    renderPreview();
    $('report').replaceChildren();
    if (parsed.report) renderReport($('report'), parsed.report);
    return { text, truncated };
};

const fail = (e) => {
    if (e?.code === 'no_resume') setStatus('Claude did not return a resume. Try again.', true);
    else setStatus(COPY[e?.code] || 'Claude could not finish this request. Try again in a moment.', true);
};

const generate = async () => {
    const resumeText = $('resume').value.trim();
    const postingText = $('posting-text').value.trim();
    if (!state.images.length && !postingText) { setStatus('Add a photo or screenshot of the job posting, or paste its text.', true); return; }
    if (!resumeText) { setStatus('Add your resume first.', true); return; }

    let images = state.images.flatMap((i) => i.tiles);
    if (images.length) {
        const limits = await state.sample.limits().catch(() => null);
        if (!limits?.images) { setStatus(COPY.images_unavailable, true); return; }
        if (images.length > limits.images.maxCount) {
            setStatus(`Claude takes at most ${limits.images.maxCount} image sections per request and these add up to ${images.length}. Remove an image or paste the text.`, true);
            return;
        }
    }
    store.set('rt.resume', $('resume').value);
    const prompt = buildPrompt({
        company: $('company').value.trim(),
        role: $('role').value.trim(),
        postingText,
        resumeText,
        siteText: $('use-site').checked ? CONTEXT.site : '',
        imageCount: images.length,
    });
    setBusy(true);
    setStatus('Thinking. This usually takes a minute or two...');
    try {
        const turns = [{ role: 'user', content: prompt }];
        const { text, truncated } = await ask(turns, images);
        state.turns = [...turns, { role: 'assistant', content: text }];
        setStatus(truncated ? 'The reply was cut short. The resume may be incomplete.' : 'Done. Edit the LaTeX directly, or ask for a change below.', truncated);
    } catch (e) { fail(e); } finally { setBusy(false); }
};

const revise = async () => {
    const request = $('revise').value.trim();
    if (!request) return;
    if (!state.turns) { setStatus('Tailor a resume first, then ask for changes.', true); return; }
    setBusy(true);
    setStatus('Revising...');
    try {
        const turns = [...state.turns, { role: 'user', content: revisionPrompt(extractBody($('editor').value), request) }];
        const { text, truncated } = await ask(turns);
        state.turns = [...turns, { role: 'assistant', content: text }];
        $('revise').value = '';
        setStatus(truncated ? 'The reply was cut short.' : 'Revision done.', truncated);
    } catch (e) { fail(e); } finally { setBusy(false); }
};

// --------------------------------------------------------------- exports ---

const fileStem = () => {
    const company = $('company').value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const m = /\\resumeheader\{([^}]*)\}/.exec(extractBody($('editor').value));
    const name = (m ? m[1] : 'Resume').trim().replace(/[^A-Za-z0-9]+/g, '_');
    return [name, 'Resume', company].filter(Boolean).join('_');
};

const copyLatex = async () => {
    try {
        await navigator.clipboard.writeText($('editor').value);
        setStatus('LaTeX copied. Paste it into a new Overleaf project to get the PDF.', false, 'out-status');
    } catch {
        $('editor').select();
        setStatus('Could not copy automatically. The text is selected, copy it by hand.', true, 'out-status');
    }
};

const saveTex = async () => {
    const data = $('editor').value;
    try {
        await state.downloads.save({ filename: `${fileStem()}.tex`, data });
        setStatus('Saved.', false, 'out-status');
    } catch (e) {
        if (e?.code === 'rejected_extension' || e?.code === 'extension_not_enabled') {
            try { await state.downloads.save({ filename: `${fileStem()}.tex.txt`, data }); setStatus('Saved as a text file. Rename it to .tex.', false, 'out-status'); return; } catch (e2) { e = e2; }
        }
        if (e?.code !== 'declined') setStatus('Could not save the file here. Use Copy LaTeX instead.', true, 'out-status');
    }
};

// ------------------------------------------------------------------ wire ---

const start = async () => {
    $('resume').value = store.get('rt.resume') || CONTEXT.resume;
    renderPreview();

    $('files').addEventListener('change', async (e) => { await addImages(e.target.files); e.target.value = ''; });
    const drop = $('drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); addImages(e.dataTransfer.files); });
    document.addEventListener('paste', (e) => {
        const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) { e.preventDefault(); addImages(files); }
    });
    $('load-mine').addEventListener('click', () => { $('resume').value = CONTEXT.resume; });
    $('resume-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) $('resume').value = await f.text();
    });
    $('generate').addEventListener('click', generate);
    $('stop').addEventListener('click', () => state.ctl?.abort());
    $('revise-btn').addEventListener('click', revise);
    $('revise').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); revise(); } });
    let timer;
    $('editor').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(renderPreview, 200); });
    $('copy').addEventListener('click', copyLatex);
    $('save').addEventListener('click', saveTex);

    // Capabilities resolve after first paint; the form is usable meanwhile.
    const use = (name) => (window.claude?.use ? window.claude.use(name) : Promise.resolve(null));
    use('downloads').then((d) => { state.downloads = d; $('save').hidden = !d; });
    state.sample = await use('sample');
    if (state.sample) {
        $('generate').disabled = false;
        setStatus('');
    } else {
        setStatus('Claude is not available in this view. Open this page inside the Claude app or claude.ai while signed in.', true);
    }
};

start();
