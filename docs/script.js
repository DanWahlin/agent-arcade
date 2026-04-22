/* ============================================================
   Agent Arcade — Starfield + Scroll Animations
   ============================================================ */

(function () {
  'use strict';

  // ---------- Starfield ----------
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  const STAR_COUNT = 120;
  const COLORS = ['#ffffff', '#c8c8ff', '#ffe8a8', '#a8d8ff', '#ffa8ff'];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.6 + 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speed: Math.random() * 0.15 + 0.02,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
      });
    }
  }

  function drawStars(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.phase + t * s.twinkleSpeed));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // Tiny glow for larger stars
      if (s.r > 1) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = alpha * 0.07;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Floating particles ----------
  const particleContainer = document.getElementById('particles');
  const PARTICLE_COUNT = 8;

  function createParticles() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const el = document.createElement('div');
      const size = Math.random() * 3 + 1;
      const isGold = Math.random() > 0.6;
      el.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${isGold ? 'rgba(255,198,41,0.4)' : 'rgba(155,77,255,0.35)'};
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        animation: particleFloat ${8 + Math.random() * 12}s ease-in-out infinite;
        animation-delay: ${-Math.random() * 10}s;
        pointer-events: none;
        filter: blur(${Math.random() > 0.5 ? 1 : 0}px);
      `;
      particleContainer.appendChild(el);
    }
  }

  // Add particle animation
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes particleFloat {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
      25% { transform: translate(${rand(-40, 40)}px, ${rand(-60, 60)}px) scale(1.3); opacity: 0.6; }
      50% { transform: translate(${rand(-30, 30)}px, ${rand(-80, 20)}px) scale(0.8); opacity: 0.4; }
      75% { transform: translate(${rand(-50, 50)}px, ${rand(-40, 40)}px) scale(1.1); opacity: 0.5; }
    }
  `;
  document.head.appendChild(styleSheet);

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ---------- Scroll reveal ----------
  function revealSections() {
    const sections = document.querySelectorAll('.section');
    const windowH = window.innerHeight;
    for (const sec of sections) {
      const rect = sec.getBoundingClientRect();
      if (rect.top < windowH * 0.85) {
        sec.classList.add('visible');
      }
    }
  }

  // ---------- Shooting stars (occasional) ----------
  let lastShootingStar = 0;
  function maybeShootingStar(t) {
    if (t - lastShootingStar < 4000 || Math.random() > 0.002) return;
    lastShootingStar = t;
    const startX = Math.random() * canvas.width * 0.8;
    const startY = Math.random() * canvas.height * 0.4;
    const length = 60 + Math.random() * 80;
    const angle = Math.PI / 5 + Math.random() * 0.4;

    const endX = startX + Math.cos(angle) * length;
    const endY = startY + Math.sin(angle) * length;

    const grad = ctx.createLinearGradient(startX, startY, endX, endY);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---------- GIF Carousel ----------
  const GIF_DATA = [
    { src: 'images/agent-arcade-aliens.gif', label: '👾 Alien Onslaught', duration: 16070 },
    { src: 'images/agent-arcade-ninja.gif',  label: '🥷 Ninja Runner',   duration: 14670 },
    { src: 'images/agent-arcade-galaxy.gif', label: '🚀 Galaxy Blaster', duration: 10070 },
    { src: 'images/agent-arcade-rocks.gif',  label: '☄️ Cosmic Rocks',   duration: 9800 },
  ];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function initGifCarousel() {
    const display = document.getElementById('gif-display');
    const label = document.getElementById('gif-label');
    const indicatorWrap = document.getElementById('gif-indicators');
    if (!display || !label || !indicatorWrap) return;

    const order = shuffle([...Array(GIF_DATA.length).keys()]);
    let currentIdx = 0;

    // Build dot indicators
    order.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'gif-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => goTo(i));
      indicatorWrap.appendChild(dot);
    });

    // Add progress bar after toolbar
    const toolbar = document.querySelector('.gif-toolbar');
    const progressBar = document.createElement('div');
    progressBar.className = 'gif-progress';
    toolbar.parentNode.insertBefore(progressBar, toolbar.nextSibling);

    const FADE_MS = 350;
    let timer = null;

    function showGif(idx) {
      currentIdx = idx;
      const data = GIF_DATA[order[idx]];
      const dur = data.duration;

      // Fade out
      display.classList.remove('visible');
      label.style.opacity = '0';

      // Reset progress
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';

      setTimeout(() => {
        // Force GIF restart by appending a cache-bust then removing it
        display.src = data.src + '?t=' + Date.now();
        label.textContent = data.label;

        const onLoad = () => {
          display.classList.add('visible');
          label.style.opacity = '1';

          // Animate progress bar to match GIF duration
          requestAnimationFrame(() => {
            progressBar.style.transition = `width ${dur}ms linear`;
            progressBar.style.width = '100%';
          });

          display.removeEventListener('load', onLoad);
        };
        display.addEventListener('load', onLoad);

        if (display.complete && display.naturalWidth > 0) {
          display.removeEventListener('load', onLoad);
          onLoad();
        }

        // Update dots
        indicatorWrap.querySelectorAll('.gif-dot').forEach((d, i) => {
          d.classList.toggle('active', i === idx);
        });

        // Schedule next after full GIF plays
        clearTimeout(timer);
        timer = setTimeout(next, dur + FADE_MS);
      }, FADE_MS);
    }

    function next() {
      showGif((currentIdx + 1) % order.length);
    }

    function goTo(idx) {
      clearTimeout(timer);
      showGif(idx);
    }

    // Start
    showGif(0);

    // ---------- Lightbox ----------
    const lightbox = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbLabel = document.getElementById('lightbox-label');

    display.addEventListener('click', () => {
      const data = GIF_DATA[order[currentIdx]];
      lbImg.src = data.src + '?t=' + Date.now();
      lbLabel.textContent = data.label;
      lightbox.classList.add('open');
      clearTimeout(timer); // pause carousel
    });

    function closeLightbox() {
      lightbox.classList.remove('open');
      lbImg.src = '';
      showGif(currentIdx); // resume carousel
    }

    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
    });
  }

  initGifCarousel();

  // ---------- Main loop ----------
  function loop(t) {
    drawStars(t);
    maybeShootingStar(t);
    requestAnimationFrame(loop);
  }

  // ---------- Init ----------
  resize();
  createStars();
  createParticles();
  revealSections();

  window.addEventListener('resize', () => { resize(); createStars(); });
  window.addEventListener('scroll', revealSections, { passive: true });

  // Navbar toggle (mobile)
  const navToggle = document.getElementById('navbar-toggle');
  const navLinks = document.getElementById('navbar-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('open');
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
  }

  // Active nav link highlight on scroll
  const sections = document.querySelectorAll('.section[id]');
  const navItems = document.querySelectorAll('.navbar-links li a[href^="#"]');
  function updateActiveNav() {
    let current = '';
    for (const sec of sections) {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= 120) current = sec.id;
    }
    navItems.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', updateActiveNav, { passive: true });

  requestAnimationFrame(loop);
})();
