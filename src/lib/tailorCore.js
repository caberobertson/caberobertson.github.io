/* ==========================================================================
   Resume tailor, shared core
   The prompt, the reply parser, the dash scrubber and the quick preview.
   Used by the page on this site and by the Claude artifact build, so both
   ask for the same thing and read the answer the same way.
   ========================================================================== */
import { extractBody, BODY_EXAMPLE } from './resumeTemplate.js';

export const SYSTEM = `You rewrite a candidate's resume for one specific job posting and return it as LaTeX. The result goes straight to a recruiter and an applicant tracking system, so it has to be the strongest truthful version of this candidate for this role.

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

/** Everything the model needs, as one piece of text. */
export const buildPrompt = ({ company, role, postingText, resumeText, siteText, imageCount = 0, attachNote = '' }) => {
    const parts = [SYSTEM, '---'];
    parts.push(`Company: ${company || 'not given, read it from the posting'}`);
    if (role) parts.push(`Role title: ${role}`);
    if (imageCount) parts.push(`The job posting is in the ${imageCount} attached image(s), in reading order.`);
    if (attachNote) parts.push(attachNote);
    if (postingText) parts.push(`<job_posting_text>\n${postingText}\n</job_posting_text>`);
    parts.push(`<resume>\n${resumeText}\n</resume>`);
    if (siteText) parts.push(`<portfolio_site>\n${siteText}\n</portfolio_site>`);
    parts.push('Write the tailored resume for this posting.');
    return parts.join('\n\n');
};

export const revisionPrompt = (currentBody, ask) =>
    `This is the resume body as it stands now, including my own edits:\n<latex>\n${currentBody}\n</latex>\n\nChange request: ${ask}\n\nReturn the full updated body and report in the same two block format.`;

/** The model is told not to use dashes; this makes sure of it. */
export const scrub = (body) =>
    body
        .replace(/\s*(—|---)\s*/g, ', ')
        .replace(/\s+(–|--)\s+/g, ' - ')
        .replace(/–|(?<=[\w)])--(?=[\w(])/g, '-');

export const between = (text, tag) => {
    const open = text.indexOf(`<${tag}>`);
    if (open < 0) return null;
    const start = open + tag.length + 2;
    const close = text.indexOf(`</${tag}>`, start);
    return { text: text.slice(start, close < 0 ? undefined : close), done: close >= 0 };
};


/** Split a reply into { latex, report }. Tolerates a reply pasted from a
    chat window, where the body may arrive inside a code fence instead. */
export const parseReply = (text) => {
    let latex = between(text, 'latex')?.text;
    if (!latex) {
        const fence = /```(?:latex|tex)?\s*\n([\s\S]*?)```/.exec(text);
        if (fence && /\\(resumeheader|section)\b/.test(fence[1])) latex = fence[1];
        else if (/\\resumeheader\b/.test(text)) latex = text.slice(text.indexOf('\\resumeheader')).split(/<report>|\n\{\s*"role"/)[0];
    }
    if (!latex) return null;
    let report = between(text, 'report')?.text;
    if (!report) { const m = /\{\s*"role"[\s\S]*\}/.exec(text); report = m ? m[0] : ''; }
    return { latex: scrub(extractBody(latex)), report };
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

export const previewHtml = (tex) => {
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
    return html || '<p class="rt-empty">The resume preview appears here.</p>';
};


// ---------------------------------------------------------------- report ---

export const renderReport = (box, raw) => {
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

