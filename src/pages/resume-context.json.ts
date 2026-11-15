import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Source text of the hand-written pages, read at build time. The tailoring
// tool sends this to the model alongside the resume so it can draw on detail
// the one-page PDF had no room for.
import experienceSrc from './experience.astro?raw';
import skillsSrc from './skills.astro?raw';
import indexSrc from './index.astro?raw';
import crashguardSrc from './crashguard.astro?raw';
import resumeText from '../data/resume.txt?raw';

/** Reduce an .astro source file to the prose a reader would see. */
const toText = (src: string) =>
    src
        .replace(/^---[\s\S]*?---/, '')
        .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/(p|li|h[1-6]|div|tr|section|span)>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&sect;/g, '')
        .replace(/&rarr;/g, '')
        .replace(/&[a-z]+;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();

export const GET: APIRoute = async () => {
    const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
    const notes = (await getCollection('notes')).filter((n) => !n.data.draft);

    const sections: string[] = [];
    sections.push(`## Experience page\n${toText(experienceSrc)}`);
    sections.push(`## Skills page\n${toText(skillsSrc)}`);
    sections.push(`## Home page\n${toText(indexSrc)}`);
    for (const p of projects) {
        const d = p.data;
        sections.push(
            [
                `## Project: ${d.title}`,
                `Outcome: ${d.outcome}`,
                // period is optional: an entry with no dates on record says so by omission.
                d.period ? `Period: ${d.period}. Status: ${d.status}.` : `Status: ${d.status}.`,
                d.context ? `Context: ${d.context}` : '',
                d.role ? `Role: ${d.role}` : '',
                `Tags: ${d.tags.join(', ')}`,
                d.metrics.length ? `Metrics: ${d.metrics.map((m) => `${m.value} (${m.label})`).join('; ')}` : '',
                p.body ?? '',
            ]
                .filter(Boolean)
                .join('\n'),
        );
    }
    sections.push(`## CrashGuard full write-up\n${toText(crashguardSrc)}`);
    for (const n of notes) {
        sections.push(`## Build log: ${n.data.title}\n${n.data.summary}\n${n.body ?? ''}`);
    }

    return new Response(JSON.stringify({ resume: resumeText.trim(), site: sections.join('\n\n') }), {
        headers: { 'Content-Type': 'application/json' },
    });
};
