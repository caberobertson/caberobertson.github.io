/* ==========================================================================
   Constellation background — theme-aware, retina-sharp, perf-friendly.
   Reads --particle-color from CSS so it follows light/dark theme switches.
   ========================================================================== */
(() => {
    'use strict';

    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvas.remove();
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mouse = { x: null, y: null, radius: 150 };
    let particles = [];
    let width = 0, height = 0, dpr = 1;
    let rgb = '0, 168, 255';
    let running = true;

    const readThemeColor = () => {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--particle-color').trim();
        if (v) rgb = v;
    };

    const particleCount = () => Math.min(110, Math.floor((width * height) / 14000));
    const connectionDistance = () => (width < 600 ? 110 : 150);

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = Math.random() * 2 + 1;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x > width) this.x = 0;
            if (this.x < 0) this.x = width;
            if (this.y > height) this.y = 0;
            if (this.y < 0) this.y = height;

            if (mouse.x !== null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                if (dx * dx + dy * dy < mouse.radius * mouse.radius) {
                    // Gently drift away from the cursor
                    this.x -= dx * 0.015;
                    this.y -= dy * 0.015;
                }
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const target = particleCount();
        while (particles.length < target) particles.push(new Particle());
        particles.length = target;
    };

    const animate = () => {
        if (!running) return;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = `rgba(${rgb}, 0.5)`;

        const maxDist = connectionDistance();
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();

            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distSq = dx * dx + dy * dy;
                if (distSq < maxDist * maxDist) {
                    const dist = Math.sqrt(distSq);
                    ctx.strokeStyle = `rgba(${rgb}, ${(1 - dist / maxDist) * 0.6})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener('mouseout', () => { mouse.x = null; mouse.y = null; });
    window.addEventListener('resize', resize);
    window.addEventListener('themechange', readThemeColor);

    document.addEventListener('visibilitychange', () => {
        const wasRunning = running;
        running = !document.hidden;
        if (running && !wasRunning) animate();
    });

    readThemeColor();
    resize();
    animate();
})();
