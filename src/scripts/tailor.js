/* ==========================================================================
   Resume tailor, site page
   No server and no API key. The page builds the full prompt from the job
   details, the resume and this site's own write-ups, the visitor runs it in
   their own Claude chat, and the reply is pasted back here to be edited,
   previewed and compiled. The one-click version lives in a Claude artifact
   built from the same core (see scripts/build-tailor-artifact.mjs).
   ========================================================================== */
import { wrapDocument, extractBody } from '../lib/resumeTemplate.js';
import { buildPrompt, revisionPrompt, parseReply, previewHtml, renderReport } from '../lib/tailorCore.js';

const $ = (id) => document.getElementById(id);
const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } },
};

const state = { context: null, pdfUrl: null };

const loadContext = async () => {
    if (!state.context) {
        const res = await fetch('/resume-context.json');
        if (!res.ok) throw new Error('Could not load the site context file.');
        state.context = await res.json();
    }
    return state.context;
};

const setStatus = (msg, isError = false, id = 'rt-status') => {
    const el = $(id);
    el.textContent = msg;
    el.classList.toggle('is-error', isError);
};

const renderPreview = () => { $('rt-preview').innerHTML = previewHtml($('rt-editor').value); };

const copyText = async (text, okMsg, statusId) => {
    try {
        await navigator.clipboard.writeText(text);
        setStatus(okMsg, false, statusId);
    } catch {
        // Clipboard access can be refused; leave the text selectable instead.
        const box = $('rt-prompt-box');
        box.value = text;
        box.hidden = false;
        box.select();
        setStatus('Could not copy automatically. The text is selected below, copy it by hand.', true, statusId);
    }
};

const FENCE_NOTE = 'If the job posting is attached to this message as photos or screenshots, read it from them. Put your whole reply inside one fenced code block so it can be copied exactly.';

const copyPrompt = async () => {
    const resumeText = $('rt-resume').value.trim();
    if (!resumeText) { setStatus('Add your resume first: paste it, upload it, or load the one from this site.', true); return; }
    try {
        const siteText = $('rt-use-site').checked ? (await loadContext()).site : '';
        const prompt = buildPrompt({
            company: $('rt-company').value.trim(),
            role: $('rt-role').value.trim(),
            postingText: $('rt-posting-text').value.trim(),
            resumeText,
            siteText,
            attachNote: FENCE_NOTE,
        });
        store.set('rt.resume', $('rt-resume').value);
        await copyText(prompt, 'Prompt copied. Paste it into a new Claude chat, attach your photos of the posting, and send.');
    } catch (err) {
        setStatus(err.message || 'Something went wrong.', true);
    }
};

const loadReply = () => {
    const parsed = parseReply($('rt-reply').value);
    if (!parsed) { setStatus('No resume found in that text. Copy the whole reply from Claude and paste it again.', true, 'rt-reply-status'); return; }
    $('rt-editor').value = wrapDocument(parsed.latex);
    renderPreview();
    $('rt-report').replaceChildren();
    if (parsed.report) renderReport($('rt-report'), parsed.report);
    setStatus('Loaded. Edit the LaTeX directly, then compile.', false, 'rt-reply-status');
    $('rt-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const copyRevision = async () => {
    const ask = $('rt-revise').value.trim();
    if (!ask) return;
    await copyText(`${revisionPrompt(extractBody($('rt-editor').value), ask)} ${FENCE_NOTE.split('. ')[1]}`, 'Revision request copied. Send it in the same Claude chat, then paste the new reply above.', 'rt-revise-status');
};

// --------------------------------------------------------------- exports ---

const fileStem = () => {
    const company = $('rt-company').value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const nameMatch = /\\resumeheader\{([^}]*)\}/.exec(extractBody($('rt-editor').value));
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
    setStatus('Compiling the PDF...', false, 'rt-out-status');
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
        setStatus('PDF compiled.', false, 'rt-out-status');
    } catch (err) {
        setStatus(`${err.message || 'Compile failed.'} You can still open the file in Overleaf or download the .tex.`, true, 'rt-out-status');
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
    if (!$('rt-copy-prompt')) return;
    $('rt-resume').value = store.get('rt.resume') || '';

    $('rt-load-mine').addEventListener('click', async () => {
        try { $('rt-resume').value = (await loadContext()).resume; } catch (err) { setStatus(err.message, true); }
    });
    $('rt-resume-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) $('rt-resume').value = await f.text();
    });

    $('rt-copy-prompt').addEventListener('click', copyPrompt);
    $('rt-load-reply').addEventListener('click', loadReply);
    $('rt-revise-btn').addEventListener('click', copyRevision);
    $('rt-revise').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); copyRevision(); } });

    let timer;
    $('rt-editor').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(renderPreview, 200); });
    $('rt-compile').addEventListener('click', compilePdf);
    $('rt-overleaf').addEventListener('click', openInOverleaf);
    $('rt-download').addEventListener('click', () => download(new Blob([$('rt-editor').value], { type: 'application/x-tex' }), `${fileStem()}.tex`));
    $('rt-copy').addEventListener('click', () => copyText($('rt-editor').value, 'LaTeX copied.', 'rt-out-status'));
};

init();
