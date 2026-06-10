# caberobertson.github.io

Personal portfolio of **Cabe Robertson** — Electrical Engineering student at New Mexico State University (Communications & Signal Processing), IEEE NMSU Student Chapter Vice President.

**Live site:** https://caberobertson.github.io

## Pages

| Page | Description |
|---|---|
| `index.html` | Hero with animated stats, about, education & leadership, photo gallery |
| `experience.html` | Interactive timeline of internships, research, and leadership |
| `projects.html` | Featured engineering projects (computer vision, embedded, FPGA) |
| `skills.html` | Software, hardware/lab, and language skills |
| `contact.html` | Contact cards with copy-to-clipboard |
| `404.html` | Custom "Signal Not Found" error page |

## Features

- **Light/dark theme** with persistence (`localStorage`) and a theme-aware particle constellation background
- **Command palette** — press `Ctrl`/`⌘` + `K` anywhere to navigate, download the resume, or toggle the theme
- **Scroll-reveal animations**, typed hero text, and a scroll-progress bar (all respect `prefers-reduced-motion`)
- **Touch/keyboard-friendly photo slider** with autoplay that pauses on hover and hidden tabs
- **JSON-LD `Person` structured data** for rich search results
- Responsive mobile navigation, SEO/Open Graph metadata, and accessibility touches (skip link, single `<h1>` per page, ARIA labels)

## Stack

Hand-written HTML, CSS, and vanilla JavaScript — no frameworks, no build step. Deployed via GitHub Pages.

```
style.css     — design system (tokens, components, themes)
main.js       — interactions (theme, nav, palette, slider, reveal, progress)
particles.js  — canvas constellation background
```

## Development & CI

Tooling is dev-only (no runtime dependencies). Install and run the checks locally:

```bash
npm install
npm run validate   # html-validate across all pages
npm test           # jsdom smoke test (assets, links, widgets, structured data)
npm run ci         # both of the above
```

Every push and pull request runs the same checks via GitHub Actions
(`.github/workflows/ci.yml`).
