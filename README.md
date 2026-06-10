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
- **Scroll-reveal animations**, typed hero text, and animated counters (all respect `prefers-reduced-motion`)
- **Touch/keyboard-friendly photo slider** with autoplay that pauses on hover and hidden tabs
- Responsive mobile navigation, SEO/Open Graph metadata, and accessibility touches (skip link, ARIA labels)

## Stack

Hand-written HTML, CSS, and vanilla JavaScript — no frameworks, no build step. Deployed via GitHub Pages.

```
style.css     — design system (tokens, components, themes)
main.js       — interactions (theme, nav, palette, slider, reveal, counters)
particles.js  — canvas constellation background
```
