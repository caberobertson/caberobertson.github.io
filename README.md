# caberobertson.github.io

Personal engineering portfolio of **Cabe Robertson**, Electrical Engineering student at New Mexico State University (Communications & Signal Processing), IEEE NMSU Student Chapter Vice President.

**Live site:** https://caberobertson.github.io

Built with [Astro](https://astro.build) and deployed to GitHub Pages as static HTML. No client-side framework; the only JavaScript shipped is one small progressive-enhancement bundle.

## Requirements

Node 22 (Node 20.3+ also works).

```bash
npm install
npm run dev        # local dev server
npm run build      # static output to dist/
npm run preview    # serve the built output
npm run ci         # build + validate HTML + smoke test (what CI runs)
```

## Layout

```
src/
  layouts/BaseLayout.astro     page shell: head, fonts, nav, footer, scripts
  components/
    SiteNav.astro              nav; active state resolved at build time
    SiteFooter.astro
  pages/                       one .astro per route, flat URLs (see below)
  scripts/site.js              theme, mobile nav, palette, slider, reveal
  styles/
    tokens.css                 design tokens (colour, type, spacing, motion)
    global.css                 site-wide component styles
    docs.css                   documentation & recruiter-panel components
public/                        copied verbatim into dist/: resume PDF, photos,
                               plots, CSV templates, and the standalone
                               caption-app / finger-piano / hotdog-dimension
                               pages (self-contained, own CSS)
tests/smoke.js                 DOM smoke test, runs against dist/
```

### URL shape

`astro.config.mjs` sets `build.format: 'file'`, so routes keep the flat `.html`
form the hand-written site used (`/experience.html`, `/crashguard.html`) rather
than Astro's default directory form (`/experience/`). Existing links, anything
already shared, and the site reference printed on the resume all keep working.
The site root canonicalises to `/`, not `/index.html`.

## Design system

Tokens live in `src/styles/tokens.css` and are the single source of truth.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0e100b` | base |
| `--bg-elev` | `#16180f` | elevated panels |
| `--ink` | `#f2f4ea` | primary text (17.2:1) |
| `--ink-dim` | `#a7ad98` | secondary text (8.3:1) |
| `--line` | `#2b2f22` | hairlines and grid rules |
| `--accent` | `#c6ff3a` | single signal accent (16.2:1) |
| `--danger` | `#ff5c4d` | impact/alert only (6.3:1) |

Three type roles, self-hosted via `@fontsource` (never hotlinked): **Space
Grotesk** for display, **Inter** for body/UI, **JetBrains Mono** for metrics,
figure captions, section numbers and spec tables. The mono is the "engineered"
signal and is used deliberately, not decoratively.

The warm "paper" light theme remains an opt-in override; its accent shifts to a
deep olive (`#415c00`, 6.6:1) because the signal green is unreadable on a light
ground.

## Features

- Command palette: `Ctrl`/`⌘` + `K` to navigate, open the resume, toggle theme
- Light/dark theme, persisted, applied before first paint so it never flashes
- Scroll-reveal, typed hero line, scroll-progress bar, all respecting `prefers-reduced-motion`
- Touch and keyboard photo slider; autoplay pauses on hover and on hidden tabs
- JSON-LD `Person` schema, per-page canonical URLs and Open Graph tags
- Accessibility: skip link, one `<h1>` per page, visible focus states, AA contrast

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds, validates,
smoke-tests, and publishes `dist/` to GitHub Pages via the Pages artifact.

> **One-time setting:** the repository's *Settings → Pages → Build and
> deployment → Source* must be **GitHub Actions**, not "Deploy from a branch".
> The site no longer serves hand-written HTML from the repository root.

Every other branch and pull request runs `.github/workflows/ci.yml`, which does
the same build and checks without deploying.
