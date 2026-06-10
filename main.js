/* ==========================================================================
   Cabe Robertson — Portfolio interactions
   Theme toggle · mobile nav · scroll reveal · typed hero · counters ·
   photo slider · command palette · back-to-top · clipboard
   ========================================================================== */
(() => {
    'use strict';

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Theme ---------- */
    const applyTheme = (theme) => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('theme', theme);
        window.dispatchEvent(new CustomEvent('themechange'));
    };

    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) document.documentElement.dataset.theme = storedTheme;

    const toggleTheme = () => {
        const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
        applyTheme(current === 'light' ? 'dark' : 'light');
    };

    $('#theme-toggle')?.addEventListener('click', toggleTheme);

    /* ---------- Mobile nav ---------- */
    const burger = $('#nav-burger');
    const navLinks = $('#nav-links');
    burger?.addEventListener('click', () => {
        const open = navLinks.classList.toggle('open');
        burger.setAttribute('aria-expanded', String(open));
    });

    // Highlight the current page in the nav
    const page = location.pathname.split('/').pop() || 'index.html';
    $$('.nav-links a').forEach((a) => {
        if (a.getAttribute('href') === page) a.classList.add('active');
    });

    /* ---------- Scroll reveal ---------- */
    const revealEls = $$('.reveal');
    if (revealEls.length && 'IntersectionObserver' in window && !reducedMotion) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12 });
        revealEls.forEach((el) => io.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add('in'));
    }

    /* ---------- Typed hero line ---------- */
    const typedTarget = $('#typed-text');
    if (typedTarget) {
        const phrases = JSON.parse(typedTarget.dataset.phrases || '[]');
        if (reducedMotion || !phrases.length) {
            typedTarget.textContent = phrases[0] || '';
        } else {
            let phrase = 0, char = 0, deleting = false;
            const tick = () => {
                const current = phrases[phrase];
                char += deleting ? -1 : 1;
                typedTarget.textContent = current.slice(0, char);
                let delay = deleting ? 32 : 62;
                if (!deleting && char === current.length) { delay = 2100; deleting = true; }
                else if (deleting && char === 0) { deleting = false; phrase = (phrase + 1) % phrases.length; delay = 350; }
                setTimeout(tick, delay);
            };
            tick();
        }
    }

    /* ---------- Animated counters ---------- */
    const counters = $$('[data-count]');
    if (counters.length && 'IntersectionObserver' in window) {
        const animate = (el) => {
            const target = parseFloat(el.dataset.count);
            const prefix = el.dataset.prefix || '';
            const suffix = el.dataset.suffix || '';
            if (reducedMotion) { el.textContent = prefix + target + suffix; return; }
            const duration = 1400;
            const start = performance.now();
            const step = (now) => {
                const p = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = prefix + Math.round(target * eased) + suffix;
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); }
            });
        }, { threshold: 0.4 });
        counters.forEach((el) => io.observe(el));
    } else {
        counters.forEach((el) => {
            el.textContent = (el.dataset.prefix || '') + el.dataset.count + (el.dataset.suffix || '');
        });
    }

    /* ---------- Photo slider ---------- */
    const track = $('.slider-track');
    if (track) {
        const slides = $$('.slide', track);
        const container = $('.slider-container');
        const dotsBox = $('.dots-container');
        let index = 0;
        let autoplay;

        // Build dots to match the number of slides
        slides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
            dot.addEventListener('click', () => goTo(i));
            dotsBox.appendChild(dot);
        });
        const dots = $$('.dot', dotsBox);

        const goTo = (i) => {
            index = (i + slides.length) % slides.length;
            track.style.transform = `translateX(-${index * 100}%)`;
            dots.forEach((d, j) => d.classList.toggle('active', j === index));
        };

        const startAutoplay = () => {
            if (reducedMotion) return;
            clearInterval(autoplay);
            autoplay = setInterval(() => goTo(index + 1), 5000);
        };

        $('.slider-btn.prev')?.addEventListener('click', () => { goTo(index - 1); startAutoplay(); });
        $('.slider-btn.next')?.addEventListener('click', () => { goTo(index + 1); startAutoplay(); });

        container.addEventListener('mouseenter', () => clearInterval(autoplay));
        container.addEventListener('mouseleave', startAutoplay);
        document.addEventListener('visibilitychange', () => {
            document.hidden ? clearInterval(autoplay) : startAutoplay();
        });

        // Touch swipe
        let touchX = null;
        container.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
        container.addEventListener('touchend', (e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 45) goTo(index + (dx < 0 ? 1 : -1));
            touchX = null;
            startAutoplay();
        }, { passive: true });

        // Keyboard support when the slider is focused/hovered
        container.setAttribute('tabindex', '0');
        container.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { goTo(index - 1); startAutoplay(); }
            if (e.key === 'ArrowRight') { goTo(index + 1); startAutoplay(); }
        });

        startAutoplay();
    }

    /* ---------- Back to top ---------- */
    const backBtn = $('#back-to-top');
    if (backBtn) {
        window.addEventListener('scroll', () => {
            backBtn.classList.toggle('visible', window.scrollY > 500);
        }, { passive: true });
        backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));
    }

    /* ---------- Copy-to-clipboard chips ---------- */
    $$('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                const old = btn.textContent;
                btn.textContent = 'copied!';
                setTimeout(() => { btn.textContent = old; }, 1400);
            } catch { /* clipboard unavailable */ }
        });
    });

    /* ---------- Footer year ---------- */
    const yearEl = $('#year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ---------- Command palette ---------- */
    const icon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    const icons = {
        home: icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
        briefcase: icon('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
        cpu: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>'),
        zap: icon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
        mail: icon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
        file: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
        link: icon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
        moon: icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
        github: icon('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>'),
    };

    const commands = [
        { label: 'Go to Home', icon: icons.home, keywords: 'home index about', run: () => location.assign('index.html') },
        { label: 'Go to Experience', icon: icons.briefcase, keywords: 'experience work internship jobs timeline leadership ieee', run: () => location.assign('experience.html') },
        { label: 'Go to Projects', icon: icons.cpu, keywords: 'projects portfolio arduino fpga robot face tracking', run: () => location.assign('projects.html') },
        { label: 'Go to Skills', icon: icons.zap, keywords: 'skills tools languages python matlab vhdl', run: () => location.assign('skills.html') },
        { label: 'Go to Contact', icon: icons.mail, keywords: 'contact connect reach', run: () => location.assign('contact.html') },
        { label: 'Download Resume (PDF)', icon: icons.file, keywords: 'resume cv pdf download', run: () => window.open('Cabe_Robertson_Resume.pdf', '_blank') },
        { label: 'Email Cabe', icon: icons.mail, keywords: 'email mail message caberobertson gmail', run: () => location.assign('mailto:caberobertson@gmail.com') },
        { label: 'Open LinkedIn', icon: icons.link, keywords: 'linkedin social network connect', run: () => window.open('https://www.linkedin.com/in/caberobertson/', '_blank') },
        { label: 'View site source on GitHub', icon: icons.github, keywords: 'github source code repository', run: () => window.open('https://github.com/caberobertson/caberobertson.github.io', '_blank') },
        { label: 'Toggle light / dark theme', icon: icons.moon, keywords: 'theme dark light mode toggle appearance', run: toggleTheme },
    ];

    // Build the palette DOM once and reuse it on every page
    const overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
        <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
            <input type="text" placeholder="Type a command or search…" aria-label="Search commands" />
            <div class="cmdk-list" role="listbox"></div>
            <div class="cmdk-footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> select</span>
                <span><kbd>esc</kbd> close</span>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const input = $('input', overlay);
    const list = $('.cmdk-list', overlay);
    let filtered = commands;
    let selected = 0;

    const render = () => {
        list.innerHTML = '';
        if (!filtered.length) {
            list.innerHTML = '<div class="cmdk-empty">No matching commands</div>';
            return;
        }
        filtered.forEach((cmd, i) => {
            const btn = document.createElement('button');
            btn.className = 'cmdk-item' + (i === selected ? ' selected' : '');
            btn.innerHTML = `<span class="cmdk-icon">${cmd.icon}</span><span>${cmd.label}</span>`;
            btn.addEventListener('click', () => { closePalette(); cmd.run(); });
            list.appendChild(btn);
        });
        list.children[selected]?.scrollIntoView({ block: 'nearest' });
    };

    const openPalette = () => {
        filtered = commands;
        selected = 0;
        input.value = '';
        render();
        overlay.classList.add('open');
        input.focus();
    };

    const closePalette = () => overlay.classList.remove('open');

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        filtered = q
            ? commands.filter((c) => (c.label + ' ' + c.keywords).toLowerCase().includes(q))
            : commands;
        selected = 0;
        render();
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePalette(); });

    document.addEventListener('keydown', (e) => {
        const isOpen = overlay.classList.contains('open');
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            isOpen ? closePalette() : openPalette();
            return;
        }
        if (!isOpen) return;
        if (e.key === 'Escape') closePalette();
        if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, filtered.length - 1); render(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
        if (e.key === 'Enter' && filtered[selected]) { closePalette(); filtered[selected].run(); }
    });

    $('#cmdk-btn')?.addEventListener('click', openPalette);
})();
