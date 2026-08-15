/* ==========================================================================
   Audience lens
   Filters the project list in place and keeps ?lens= in sync, so a recruiter
   can send a colleague the exact view they were looking at.
   ========================================================================== */
(() => {
    'use strict';

    const root = document.querySelector('[data-lens-root]');
    const list = document.querySelector('[data-lens-list]');
    if (!root || !list) return;

    const chips = [...root.querySelectorAll('.lens-chip')];
    const countEl = root.querySelector('[data-lens-count]');
    const empty = document.querySelector('[data-lens-none]');
    const items = [...list.querySelectorAll('[data-audiences]')];
    // Section wrappers whose heading should go when the section empties out.
    const groups = [...list.querySelectorAll('[data-lens-group]')];
    const known = new Set(chips.map((c) => c.dataset.lens));

    const labelOf = (id) => chips.find((c) => c.dataset.lens === id)?.dataset.lensLabel || id;

    const apply = (lens) => {
        const all = lens === 'all';
        let shown = 0;

        items.forEach((el) => {
            const match = all || el.dataset.audiences.split(' ').includes(lens);
            // `hidden`, not a CSS class: one attribute takes the item out of
            // the layout, the accessibility tree and the tab order together,
            // so a filtered-out project cannot be reached by keyboard.
            el.hidden = !match;
            if (match) shown += 1;
        });

        groups.forEach((g) => {
            g.hidden = ![...g.querySelectorAll('[data-audiences]')].some((el) => !el.hidden);
        });

        chips.forEach((c) => {
            // aria-current, not aria-pressed: these are links, and aria-pressed
            // is only valid on something with a button role.
            if (c.dataset.lens === lens) c.setAttribute('aria-current', 'true');
            else c.removeAttribute('aria-current');
        });
        if (empty) empty.hidden = shown > 0;

        if (countEl) {
            countEl.textContent = all
                ? `Showing all ${items.length} projects.`
                : `Showing ${shown} of ${items.length} projects for ${labelOf(lens)}.`;
        }
    };

    const fromUrl = () => {
        const v = new URLSearchParams(location.search).get('lens');
        return v && known.has(v) ? v : 'all';
    };

    chips.forEach((chip) => {
        chip.addEventListener('click', (e) => {
            // Modified clicks keep their normal meaning: open the real URL.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            const lens = chip.dataset.lens;
            history.pushState(
                { lens },
                '',
                lens === 'all' ? location.pathname : `${location.pathname}?lens=${lens}`,
            );
            apply(lens);
        });
    });

    // Back and forward move between lenses rather than out of the page.
    window.addEventListener('popstate', () => apply(fromUrl()));

    apply(fromUrl());
})();
