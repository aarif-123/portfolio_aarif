/* ==========================================================================
   IMMERSIVE SCI-FI PORTFOLIO — app.js
   Three.js particle systems, wireframe geometry, cinematic scroll effects,
   custom cursor, typing animation, sound toggle, and more.
   Three.js is loaded via CDN as global `THREE`. No ES module imports.
   ========================================================================== */

(function () {
  'use strict';

  /* -----------------------------------------------------------------------
     0. CONSTANTS & PALETTE
     ----------------------------------------------------------------------- */
  const COLORS = {
    cyan:    0x00f0ff,
    violet:  0x00ff66,
    magenta: 0x05e687,
    dark:    0x0a0a12,
    white:   0xffffff,
  };

  const HEX = {
    cyan:   '#00f0ff',
    violet: '#00ff66',
    magenta:'#05e687',
  };

  const IS_MOBILE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
    navigator.userAgent
  ) || window.innerWidth < 768;

  const PARTICLE_COUNT_PRIMARY   = IS_MOBILE ? 800  : 2000;
  const PARTICLE_COUNT_SECONDARY = IS_MOBILE ? 200  : 500;
  const CONNECTION_THRESHOLD     = IS_MOBILE ? 100   : 150;
  const CONNECTION_MAX_LINES     = IS_MOBILE ? 300   : 600;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* -----------------------------------------------------------------------
     1. LOADING SCREEN
     ----------------------------------------------------------------------- */
  class LoadingScreen {
    constructor() {
      this.overlay = document.getElementById('loading-screen');
      this.bar     = document.querySelector('.loader-bar-fill');
      this.pct     = document.querySelector('.loader-percentage');
      this.text    = document.querySelector('.loader-status');
      this.progress = 0;
      this.done     = false;
      this.startTime = Date.now();

      this.phrases = [
        'INITIALIZING NEURAL INTERFACE...',
        'LOADING QUANTUM MATRIX...',
        'CALIBRATING PARTICLE ENGINES...',
        'SYNCHRONIZING WARP FIELDS...',
        'ESTABLISHING HOLOGRAPHIC LINK...',
        'RENDERING DIMENSIONAL MESH...',
        'ONLINE.',
      ];
      this.phraseIdx = 0;
      this._cyclePhrases();
    }

    _cyclePhrases() {
      if (!this.text) return;
      this._phraseTimer = setInterval(() => {
        if (this.done) { clearInterval(this._phraseTimer); return; }
        this.phraseIdx = (this.phraseIdx + 1) % this.phrases.length;
        this.text.textContent = this.phrases[this.phraseIdx];
      }, 600);
    }

    setProgress(value) {
      this.progress = Math.min(value, 100);
      if (this.bar) this.bar.style.width = this.progress + '%';
      if (this.pct) this.pct.textContent = Math.round(this.progress) + '%';
    }

    /** Smoothly increment progress toward target */
    animateTo(target, duration = 400) {
      const start = this.progress;
      const startT = performance.now();
      const tick = (now) => {
        const t = Math.min((now - startT) / duration, 1);
        this.setProgress(start + (target - start) * t);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    hide() {
      this.done = true;
      const elapsed = Date.now() - this.startTime;
      const minDisplay = 2000;
      const remaining = Math.max(0, minDisplay - elapsed);

      this.animateTo(100, remaining * 0.8);

      setTimeout(() => {
        this.setProgress(100);
        if (this.text) this.text.textContent = 'ONLINE.';
        setTimeout(() => {
          if (this.overlay) {
            this.overlay.style.opacity = '0';
            this.overlay.style.pointerEvents = 'none';
            setTimeout(() => {
              if (this.overlay) this.overlay.style.display = 'none';
            }, 800);
          }
        }, 400);
      }, remaining);
    }
  }

  const loader = new LoadingScreen();
  loader.animateTo(20);

  /* -----------------------------------------------------------------------
     2. UTILITY HELPERS
     ----------------------------------------------------------------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function throttle(fn, ms) {
    let last = 0;
    return function () {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, arguments); }
    };
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* -----------------------------------------------------------------------
     3. MOUSE TRACKER (normalised -1..1 and pixel coords)
     ----------------------------------------------------------------------- */
  const mouse = {
    x: 0, y: 0,           // normalised -1..1
    px: 0, py: 0,          // pixel
    sx: 0, sy: 0,          // smoothed normalised
    clicked: false,
    clickX: 0, clickY: 0,  // normalised click pos
  };

  window.addEventListener('mousemove', (e) => {
    mouse.px = e.clientX;
    mouse.py = e.clientY;
    mouse.x  = (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y  = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  window.addEventListener('click', (e) => {
    mouse.clicked = true;
    mouse.clickX = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.clickY = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  /* -----------------------------------------------------------------------
     4. THREE.JS SCENE SETUP
     ----------------------------------------------------------------------- */
  class SceneManager {
    constructor() {
      this.scene    = new THREE.Scene();
      this.clock    = new THREE.Clock();
      this.width    = window.innerWidth;
      this.height   = window.innerHeight;

      // PerspectiveCamera for depth
      this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 1, 4000);
      this.camera.position.set(0, 0, 600);

      // Renderer
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.renderer.setPixelRatio(DPR);
      this.renderer.setSize(this.width, this.height);
      this.renderer.setClearColor(0x000000, 0);

      const container = document.getElementById('three-canvas-container');
      if (container) container.appendChild(this.renderer.domElement);

      // Camera target for parallax
      this.cameraTarget = { x: 0, y: 0 };

      // Scroll normalised 0..1
      this.scrollT = 0;

      // Visibility API
      this.isVisible = true;
      document.addEventListener('visibilitychange', () => {
        this.isVisible = !document.hidden;
        if (this.isVisible) this.clock.start();
      });

      this._bindResize();
    }

    _bindResize() {
      window.addEventListener('resize', throttle(() => {
        this.width  = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
      }, 200));
    }

    updateCamera() {
      // Smooth lerp mouse parallax
      mouse.sx = lerp(mouse.sx, mouse.x, 0.05);
      mouse.sy = lerp(mouse.sy, mouse.y, 0.05);

      this.camera.position.x = lerp(this.camera.position.x, mouse.sx * 30, 0.04);
      this.camera.position.y = lerp(this.camera.position.y, mouse.sy * 20, 0.04);

      // Scroll-based camera changes
      this.camera.position.z = lerp(this.camera.position.z, 600 - this.scrollT * 80, 0.03);
      this.camera.rotation.z = lerp(this.camera.rotation.z, this.scrollT * 0.04, 0.02);

      this.camera.lookAt(this.scene.position);
    }

    render() {
      this.renderer.render(this.scene, this.camera);
    }
  }

  loader.animateTo(35);

  /* -----------------------------------------------------------------------
     5. PARTICLE SYSTEM
     ----------------------------------------------------------------------- */
  class ParticleSystem {
    constructor(scene) {
      this.scene = scene;
      this._createPrimary();
      this._createSecondary();
    }

    /* -- Primary particles ------------------------------------------------ */
    _createPrimary() {
      const count = PARTICLE_COUNT_PRIMARY;
      this.count = count;
      const geo = new THREE.BufferGeometry();

      const positions = new Float32Array(count * 3);
      const colors    = new Float32Array(count * 3);
      const sizes     = new Float32Array(count);
      const speeds    = new Float32Array(count);
      const phases    = new Float32Array(count);

      const cCyan   = new THREE.Color(COLORS.cyan);
      const cViolet = new THREE.Color(COLORS.violet);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3]     = rand(-1000, 1000);
        positions[i3 + 1] = rand(-800, 800);
        positions[i3 + 2] = rand(-600, 600);

        const mix = Math.random();
        const c = cCyan.clone().lerp(cViolet, mix);
        colors[i3]     = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;

        sizes[i]  = rand(1.0, 4.0);
        speeds[i] = rand(0.15, 0.6);
        phases[i] = rand(0, Math.PI * 2);
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

      this.primaryPositions = positions;
      this.primarySpeeds    = speeds;
      this.primaryPhases    = phases;
      this.primarySizes     = sizes;

      const mat = new THREE.PointsMaterial({
        size: 2.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      this.primaryPoints = new THREE.Points(geo, mat);
      this.scene.add(this.primaryPoints);
    }

    /* -- Secondary (depth) particles -------------------------------------- */
    _createSecondary() {
      const count = PARTICLE_COUNT_SECONDARY;
      this.secondaryCount = count;
      const geo = new THREE.BufferGeometry();

      const positions = new Float32Array(count * 3);
      const colors    = new Float32Array(count * 3);
      const cCyan = new THREE.Color(COLORS.cyan);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3]     = rand(-1200, 1200);
        positions[i3 + 1] = rand(-900, 900);
        positions[i3 + 2] = rand(-800, 200);

        colors[i3]     = cCyan.r;
        colors[i3 + 1] = cCyan.g;
        colors[i3 + 2] = cCyan.b;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

      this.secondaryPositions = positions;

      const mat = new THREE.PointsMaterial({
        size: 5,
        vertexColors: true,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      this.secondaryPoints = new THREE.Points(geo, mat);
      this.scene.add(this.secondaryPoints);
    }

    /* -- Burst on click --------------------------------------------------- */
    burst(nx, ny) {
      const burstCount = IS_MOBILE ? 30 : 60;
      const geo = new THREE.BufferGeometry();
      const positions  = new Float32Array(burstCount * 3);
      const velocities = new Float32Array(burstCount * 3);
      const colors     = new Float32Array(burstCount * 3);
      const cCyan   = new THREE.Color(COLORS.cyan);
      const cMagenta = new THREE.Color(COLORS.magenta);

      // Convert normalised click to world-ish coords
      const ox = nx * 500;
      const oy = ny * 400;

      for (let i = 0; i < burstCount; i++) {
        const i3 = i * 3;
        positions[i3]     = ox;
        positions[i3 + 1] = oy;
        positions[i3 + 2] = 0;

        const angle = rand(0, Math.PI * 2);
        const speed = rand(3, 10);
        velocities[i3]     = Math.cos(angle) * speed;
        velocities[i3 + 1] = Math.sin(angle) * speed;
        velocities[i3 + 2] = rand(-3, 3);

        const c = cCyan.clone().lerp(cMagenta, Math.random());
        colors[i3]     = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geo, mat);
      this.scene.add(points);

      // Animate burst
      let life = 1.0;
      const animateBurst = () => {
        life -= 0.018;
        if (life <= 0) {
          this.scene.remove(points);
          geo.dispose();
          mat.dispose();
          return;
        }
        const pos = geo.attributes.position.array;
        for (let i = 0; i < burstCount; i++) {
          const i3 = i * 3;
          pos[i3]     += velocities[i3];
          pos[i3 + 1] += velocities[i3 + 1];
          pos[i3 + 2] += velocities[i3 + 2];
          // Slow down
          velocities[i3]     *= 0.96;
          velocities[i3 + 1] *= 0.96;
          velocities[i3 + 2] *= 0.96;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = life;
        requestAnimationFrame(animateBurst);
      };
      animateBurst();
    }

    /* -- Per-frame update ------------------------------------------------- */
    update(elapsed, scrollT) {
      const pos = this.primaryPositions;
      const spd = this.primarySpeeds;
      const pha = this.primaryPhases;

      // Mouse world-space approximation
      const mwx = mouse.sx * 500;
      const mwy = mouse.sy * 400;

      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;

        // Drift upward
        pos[i3 + 1] += spd[i] * (0.6 + scrollT * 0.4);

        // Sinusoidal sway
        pos[i3] += Math.sin(elapsed * 0.3 + pha[i]) * 0.15;

        // Reset if out of bounds
        if (pos[i3 + 1] > 850) {
          pos[i3 + 1] = -850;
          pos[i3]     = rand(-1000, 1000);
          pos[i3 + 2] = rand(-600, 600);
        }

        // Mouse repulsion (subtle)
        const dx = pos[i3]     - mwx;
        const dy = pos[i3 + 1] - mwy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200 * 1.2;
          pos[i3]     += (dx / dist) * force;
          pos[i3 + 1] += (dy / dist) * force;
        }
      }

      this.primaryPoints.geometry.attributes.position.needsUpdate = true;

      // Secondary particles: gentle drift
      const spos = this.secondaryPositions;
      for (let i = 0; i < this.secondaryCount; i++) {
        const i3 = i * 3;
        spos[i3 + 1] += 0.08;
        spos[i3]     += Math.sin(elapsed * 0.15 + i) * 0.06;
        if (spos[i3 + 1] > 950) {
          spos[i3 + 1] = -950;
          spos[i3]     = rand(-1200, 1200);
        }
      }
      this.secondaryPoints.geometry.attributes.position.needsUpdate = true;

      // Click burst
      if (mouse.clicked) {
        this.burst(mouse.clickX, mouse.clickY);
        mouse.clicked = false;
      }
    }
  }

  loader.animateTo(50);

  /* -----------------------------------------------------------------------
     6. CONSTELLATION LINES (connecting nearby particles)
     ----------------------------------------------------------------------- */
  class ConstellationLines {
    constructor(scene, particleSystem) {
      this.scene = scene;
      this.particleSystem = particleSystem;
      this.frameSkip = IS_MOBILE ? 5 : 3;
      this.frameCount = 0;

      // Pre-allocate line geometry
      const maxSegments = CONNECTION_MAX_LINES;
      this.maxVerts = maxSegments * 2;
      const positions = new Float32Array(this.maxVerts * 3);
      const colors    = new Float32Array(this.maxVerts * 3);

      this.lineGeo = new THREE.BufferGeometry();
      this.lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.lineGeo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
      this.lineGeo.setDrawRange(0, 0);

      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.lines = new THREE.LineSegments(this.lineGeo, mat);
      this.scene.add(this.lines);
    }

    update() {
      this.frameCount++;
      if (this.frameCount % this.frameSkip !== 0) return;

      const pPos = this.particleSystem.primaryPositions;
      const count = this.particleSystem.count;
      const threshold = CONNECTION_THRESHOLD;
      const threshSq = threshold * threshold;

      const lPos = this.lineGeo.attributes.position.array;
      const lCol = this.lineGeo.attributes.color.array;

      let idx = 0;
      const maxVerts = this.maxVerts;
      const step = IS_MOBILE ? 8 : 4; // sample subset for speed

      for (let i = 0; i < count && idx < maxVerts; i += step) {
        const ax = pPos[i * 3];
        const ay = pPos[i * 3 + 1];
        const az = pPos[i * 3 + 2];

        for (let j = i + step; j < count && idx < maxVerts; j += step) {
          const dx = ax - pPos[j * 3];
          const dy = ay - pPos[j * 3 + 1];
          const dz = az - pPos[j * 3 + 2];
          const dSq = dx * dx + dy * dy + dz * dz;

          if (dSq < threshSq) {
            const opacity = 1 - Math.sqrt(dSq) / threshold;

            // Point A (Cyan)
            lPos[idx * 3]     = ax;
            lPos[idx * 3 + 1] = ay;
            lPos[idx * 3 + 2] = az;
            lCol[idx * 3]     = 0.0;
            lCol[idx * 3 + 1] = 0.94 * opacity;
            lCol[idx * 3 + 2] = 1.0 * opacity;
            idx++;

            // Point B (Neon-Green)
            lPos[idx * 3]     = pPos[j * 3];
            lPos[idx * 3 + 1] = pPos[j * 3 + 1];
            lPos[idx * 3 + 2] = pPos[j * 3 + 2];
            lCol[idx * 3]     = 0.0;
            lCol[idx * 3 + 1] = 1.0 * opacity;
            lCol[idx * 3 + 2] = 0.4 * opacity;
            idx++;
          }
        }
      }

      this.lineGeo.setDrawRange(0, idx);
      this.lineGeo.attributes.position.needsUpdate = true;
      this.lineGeo.attributes.color.needsUpdate    = true;
    }
  }

  /* -----------------------------------------------------------------------
     7. GEOMETRIC WIREFRAME OBJECTS
     ----------------------------------------------------------------------- */
  class WireframeObjects {
    constructor(scene) {
      this.scene = scene;
      this.objects = [];
      this._create();
    }

    _create() {
      const configs = [
        { geo: new THREE.IcosahedronGeometry(80, 1), color: COLORS.cyan,    pos: [-350, 150, -200], speed: [0.002, 0.003, 0.001] },
        { geo: new THREE.TorusGeometry(60, 20, 12, 40), color: COLORS.violet, pos: [400, -100, -300], speed: [0.003, 0.001, 0.002] },
        { geo: new THREE.OctahedronGeometry(70, 0), color: COLORS.magenta,  pos: [-200, -250, -100], speed: [0.001, 0.004, 0.002] },
        { geo: new THREE.TetrahedronGeometry(55, 1), color: COLORS.cyan,    pos: [300, 200, -400],  speed: [0.002, 0.002, 0.003] },
      ];

      configs.forEach((cfg) => {
        const mat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          wireframe: true,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(cfg.geo, mat);
        mesh.position.set(...cfg.pos);
        mesh.userData = {
          basePos: cfg.pos.slice(),
          rotSpeed: cfg.speed,
          baseScale: 1,
          pulseOffset: Math.random() * Math.PI * 2,
        };
        this.scene.add(mesh);
        this.objects.push(mesh);
      });
    }

    update(elapsed, scrollT) {
      this.objects.forEach((mesh, i) => {
        const d = mesh.userData;

        // Rotation
        mesh.rotation.x += d.rotSpeed[0];
        mesh.rotation.y += d.rotSpeed[1];
        mesh.rotation.z += d.rotSpeed[2];

        // Breathing scale
        const breathe = 1 + Math.sin(elapsed * 0.5 + d.pulseOffset) * 0.06;
        mesh.scale.setScalar(breathe);

        // Scroll-based visibility: different shapes fade in/out per section
        const sectionIdx = Math.floor(scrollT * 5);
        const localT = (scrollT * 5) - sectionIdx;
        let targetOpacity = 0.08;

        // Make each shape more prominent in its "section"
        if (i === sectionIdx % this.objects.length) {
          targetOpacity = 0.16;
        }
        mesh.material.opacity = lerp(mesh.material.opacity, targetOpacity, 0.03);

        // Subtle float
        mesh.position.y = d.basePos[1] + Math.sin(elapsed * 0.3 + i) * 15;
      });
    }
  }

  /* -----------------------------------------------------------------------
     8. SCROLL MANAGER — tracks scroll position & section
     ----------------------------------------------------------------------- */
  class ScrollManager {
    constructor() {
      this.scrollY    = 0;
      this.scrollT    = 0; // 0..1 normalised over full page
      this.maxScroll  = 1;
      this.currentSection = 0;
      this.sections = ['hero', 'about', 'skills', 'projects', 'experience', 'contact'];

      this._update = throttle(() => {
        this.scrollY   = window.scrollY || window.pageYOffset;
        this.maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
        this.scrollT   = clamp(this.scrollY / this.maxScroll, 0, 1);

        // Determine current section
        for (let i = this.sections.length - 1; i >= 0; i--) {
          const el = document.getElementById(this.sections[i]);
          if (el && this.scrollY >= el.offsetTop - window.innerHeight * 0.4) {
            this.currentSection = i;
            break;
          }
        }
      }, 50);

      window.addEventListener('scroll', this._update, { passive: true });
      this._update();
    }
  }

  /* -----------------------------------------------------------------------
     9. SCROLL REVEAL (IntersectionObserver)
     ----------------------------------------------------------------------- */
  class ScrollReveal {
    constructor() {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('active');
              this._staggerChildren(entry.target);
              // Don't unobserve — allow re-triggering if desired
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
      );

      document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-up').forEach((el) => this.observer.observe(el));
    }

    _staggerChildren(parent) {
      const children = parent.querySelectorAll('.reveal-stagger');
      children.forEach((child, i) => {
        child.style.transitionDelay = (i * 0.1) + 's';
        child.classList.add('active');
      });
    }
  }

  /* -----------------------------------------------------------------------
     10. NAVIGATION
     ----------------------------------------------------------------------- */
  class Navigation {
    constructor(scrollManager) {
      this.scrollManager = scrollManager;
      this.nav       = document.getElementById('main-nav');
      this.links     = document.querySelectorAll('.nav-link, .mobile-nav-link');
      this.hamburger = document.getElementById('nav-hamburger');
      this.navMenu   = document.getElementById('mobile-menu');

      this._bindSmoothScroll();
      this._bindHamburger();
      this._bindActiveHighlight();
    }

    _bindSmoothScroll() {
      this.links.forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const id = link.getAttribute('href').slice(1);
          const target = document.getElementById(id);
          if (!target) return;

          // Close mobile menu
          if (this.navMenu) {
            this.navMenu.setAttribute('hidden', '');
            this.navMenu.classList.remove('active');
          }
          if (this.hamburger) {
            this.hamburger.classList.remove('active', 'open');
            this.hamburger.setAttribute('aria-expanded', 'false');
          }

          const top = target.offsetTop;
          window.scrollTo({ top, behavior: 'smooth' });
        });
      });
    }

    _bindHamburger() {
      if (!this.hamburger || !this.navMenu) return;
      this.hamburger.addEventListener('click', () => {
        const isOpen = this.hamburger.classList.toggle('active');
        this.hamburger.classList.toggle('open');
        this.hamburger.setAttribute('aria-expanded', isOpen);
        if (isOpen) {
          this.navMenu.removeAttribute('hidden');
          this.navMenu.classList.add('active');
        } else {
          this.navMenu.setAttribute('hidden', '');
          this.navMenu.classList.remove('active');
        }
      });
    }

    _bindActiveHighlight() {
      const update = throttle(() => {
        const idx = this.scrollManager.currentSection;
        this.links.forEach((link) => link.classList.remove('active'));
        const activeLink = document.querySelector(
          `a[href="#${this.scrollManager.sections[idx]}"]`
        );
        if (activeLink) activeLink.classList.add('active');

        // Nav background on scroll
        if (this.nav) {
          if (this.scrollManager.scrollY > 80) {
            this.nav.classList.add('scrolled');
          } else {
            this.nav.classList.remove('scrolled');
          }
        }
      }, 100);
      window.addEventListener('scroll', update, { passive: true });
    }
  }

  /* -----------------------------------------------------------------------
     11. TYPING EFFECT
     ----------------------------------------------------------------------- */
  class TypingEffect {
    constructor(selector) {
      this.el = document.querySelector(selector);
      if (!this.el) return;
      this.phrases = [
        'Generative AI & Agentic AI Engineer',
        'Machine Learning Engineer',
        'Data Engineer',
        'AI/ML Specialist',
      ];
      this.phraseIdx   = 0;
      this.charIdx     = 0;
      this.isDeleting  = false;
      this.text        = '';
      this.typeSpeed   = 80;
      this.deleteSpeed = 40;
      this.pauseEnd    = 2000;
      this.pauseStart  = 500;

      this._tick();
    }

    _tick() {
      if (!this.el) return;
      const current = this.phrases[this.phraseIdx];

      if (!this.isDeleting) {
        this.text = current.substring(0, this.charIdx + 1);
        this.charIdx++;
        this.el.innerHTML = this.text + '<span class="cursor">|</span>';

        if (this.charIdx === current.length) {
          this.isDeleting = true;
          setTimeout(() => this._tick(), this.pauseEnd);
          return;
        }
        setTimeout(() => this._tick(), this.typeSpeed + rand(-20, 20));
      } else {
        this.text = current.substring(0, this.charIdx - 1);
        this.charIdx--;
        this.el.innerHTML = this.text + '<span class="cursor">|</span>';

        if (this.charIdx === 0) {
          this.isDeleting = false;
          this.phraseIdx = (this.phraseIdx + 1) % this.phrases.length;
          setTimeout(() => this._tick(), this.pauseStart);
          return;
        }
        setTimeout(() => this._tick(), this.deleteSpeed);
      }
    }
  }

  /* -----------------------------------------------------------------------
     12. SKILL BARS ANIMATION
     ----------------------------------------------------------------------- */
  class SkillBars {
    constructor() {
      this.bars = document.querySelectorAll('.progress-fill');
      this.observed = false;
      if (!this.bars.length) return;

      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this._animateBar(entry.target);
              this.observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      this.bars.forEach((bar) => this.observer.observe(bar));

      // Percentage count-up
      this.percentEls = document.querySelectorAll('.skill-percent, [data-percent]');
      this.percentObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this._countUp(entry.target);
              this.percentObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      this.percentEls.forEach((el) => this.percentObserver.observe(el));
    }

    _animateBar(bar) {
      const target = bar.getAttribute('data-progress') || bar.getAttribute('data-width') || '80';
      bar.style.transition = 'width 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      // Slight delay for stagger effect
      const delay = bar.closest('.skill-item, .skill')
        ? Array.from(bar.closest('.skills-container, .skills-grid, .skills-list')?.children || [])
            .indexOf(bar.closest('.skill-item, .skill')) * 150
        : 0;
      setTimeout(() => {
        bar.style.width = target + '%';
      }, delay);
    }

    _countUp(el) {
      const target = parseInt(el.getAttribute('data-percent') || el.textContent, 10) || 0;
      const duration = 1400;
      const start = performance.now();
      el.textContent = '0%';

      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const val = Math.round(easeOutCubic(t) * target);
        el.textContent = val + '%';
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  /* -----------------------------------------------------------------------
     13. PROJECT CARD TILT EFFECT
     ----------------------------------------------------------------------- */
  class TiltCards {
    constructor() {
      this.cards = document.querySelectorAll('.project-card, .card');
      this.cards.forEach((card) => this._bind(card));
    }

    _bind(card) {
      let glowEl = card.querySelector('.card-glow');
      if (!glowEl) {
        glowEl = document.createElement('div');
        glowEl.classList.add('card-glow');
        glowEl.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;' +
          'border-radius:inherit;opacity:0;transition:opacity 0.3s;' +
          'background:radial-gradient(circle at 50% 50%, rgba(0,240,255,0.12) 0%, transparent 70%);';
        card.style.position = card.style.position || 'relative';
        card.style.overflow = 'hidden';
        card.appendChild(glowEl);
      }

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rotateX = ((y - cy) / cy) * -8;
        const rotateY = ((x - cx) / cx) * 8;

        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
        card.style.transition = 'transform 0.1s ease';

        // Move glow
        glowEl.style.opacity = '1';
        glowEl.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(0,240,255,0.15) 0%, transparent 60%)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
        card.style.transition = 'transform 0.5s ease';
        glowEl.style.opacity = '0';
      });
    }
  }

  /* -----------------------------------------------------------------------
     14. CUSTOM CURSOR
     ----------------------------------------------------------------------- */
  class CustomCursor {
    constructor() {
      if (IS_MOBILE) return;

      this.outer = document.createElement('div');
      this.outer.classList.add('cursor-outer');
      this.inner = document.createElement('div');
      this.inner.classList.add('cursor-inner');

      this.outer.style.cssText =
        'position:fixed;top:0;left:0;width:36px;height:36px;border:1.5px solid ' + HEX.cyan + ';' +
        'border-radius:50%;pointer-events:none;z-index:99999;' +
        'transition:width 0.3s, height 0.3s, border-color 0.3s;' +
        'transform:translate(-50%,-50%);mix-blend-mode:difference;will-change:transform;';

      this.inner.style.cssText =
        'position:fixed;top:0;left:0;width:6px;height:6px;background:' + HEX.cyan + ';' +
        'border-radius:50%;pointer-events:none;z-index:100000;' +
        'transform:translate(-50%,-50%);will-change:transform;' +
        'transition:background 0.3s, width 0.3s, height 0.3s;';

      document.body.appendChild(this.outer);
      document.body.appendChild(this.inner);

      this.ox = 0; this.oy = 0;
      this.ix = 0; this.iy = 0;

      this._bindHover();
      this._loop();
    }

    _bindHover() {
      const interactives = 'a, button, .project-card, .card, input, textarea, .nav-toggle, .hamburger, .sound-toggle';
      document.querySelectorAll(interactives).forEach((el) => {
        el.addEventListener('mouseenter', () => {
          this.outer.style.width  = '52px';
          this.outer.style.height = '52px';
          this.outer.style.borderColor = HEX.magenta;
          this.inner.style.background  = HEX.magenta;
          this.inner.style.width  = '8px';
          this.inner.style.height = '8px';
        });
        el.addEventListener('mouseleave', () => {
          this.outer.style.width  = '36px';
          this.outer.style.height = '36px';
          this.outer.style.borderColor = HEX.cyan;
          this.inner.style.background  = HEX.cyan;
          this.inner.style.width  = '6px';
          this.inner.style.height = '6px';
        });
      });
    }

    _loop() {
      this.ox = lerp(this.ox, mouse.px, 0.12);
      this.oy = lerp(this.oy, mouse.py, 0.12);
      this.ix = lerp(this.ix, mouse.px, 0.6);
      this.iy = lerp(this.iy, mouse.py, 0.6);

      this.outer.style.transform = `translate(${this.ox}px, ${this.oy}px) translate(-50%, -50%)`;
      this.inner.style.transform = `translate(${this.ix}px, ${this.iy}px) translate(-50%, -50%)`;

      requestAnimationFrame(() => this._loop());
    }
  }

  /* -----------------------------------------------------------------------
     15. PARALLAX ELEMENTS
     ----------------------------------------------------------------------- */
  class ParallaxScroll {
    constructor() {
      this.elements = document.querySelectorAll('[data-parallax]');
      if (!this.elements.length) return;
      window.addEventListener('scroll', throttle(() => this._update(), 30), { passive: true });
    }

    _update() {
      const scrollY = window.scrollY || window.pageYOffset;
      this.elements.forEach((el) => {
        const speed = parseFloat(el.getAttribute('data-parallax')) || 0.3;
        const rect = el.getBoundingClientRect();
        const centre = rect.top + rect.height / 2;
        const offset = (centre - window.innerHeight / 2) * speed;
        el.style.transform = `translateY(${-offset}px)`;
      });
    }
  }

  /* -----------------------------------------------------------------------
     16. TIMELINE ANIMATION (Experience Section)
     ----------------------------------------------------------------------- */
  class TimelineAnimation {
    constructor() {
      this.line   = document.querySelector('.timeline-line, .timeline::before');
      this.items  = document.querySelectorAll('.timeline-item, .experience-item');
      this.dots   = document.querySelectorAll('.timeline-dot');
      if (!this.items.length) return;

      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('active', 'revealed');
              // Pulse dot
              const dot = entry.target.querySelector('.timeline-dot');
              if (dot) dot.classList.add('pulse');
            }
          });
        },
        { threshold: 0.25 }
      );
      this.items.forEach((item) => this.observer.observe(item));

      // Draw timeline line on scroll
      this._trackLine();
    }

    _trackLine() {
      const timeline = document.querySelector('.timeline, .experience-timeline');
      if (!timeline) return;

      window.addEventListener(
        'scroll',
        throttle(() => {
          const rect = timeline.getBoundingClientRect();
          const visible = clamp(
            (window.innerHeight - rect.top) / (rect.height + window.innerHeight),
            0, 1
          );
          timeline.style.setProperty('--timeline-progress', (visible * 100) + '%');
        }, 60),
        { passive: true }
      );
    }
  }

  /* -----------------------------------------------------------------------
     16.5. MISSION LOG TABS
     ----------------------------------------------------------------------- */
  class MissionTabs {
    constructor() {
      this.buttons = document.querySelectorAll('.mission-tab-btn');
      this.panels  = document.querySelectorAll('.mission-panel');
      if (!this.buttons.length) return;
      
      // Ensure the initial active panel has display block inline to keep inline and class styles synced
      this.panels.forEach((panel) => {
        if (panel.classList.contains('active')) {
          panel.style.display = 'block';
        } else {
          panel.style.display = 'none';
        }
      });

      this.buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-tab');
          this._switchTab(tab, btn);
        });
      });
    }

    _switchTab(tabName, activeBtn) {
      this.buttons.forEach((btn) => btn.classList.remove('active'));
      activeBtn.classList.add('active');
      
      this.panels.forEach((panel) => {
        const id = panel.getAttribute('id');
        if (id === `panel-${tabName}`) {
          panel.style.display = 'block';
          // Trigger a reflow
          void panel.offsetHeight;
          requestAnimationFrame(() => {
            panel.classList.add('active');
          });
        } else {
          panel.classList.remove('active');
          panel.style.display = 'none';
        }
      });
    }
  }

  /* -----------------------------------------------------------------------
     17. CONTACT FORM VALIDATION & EFFECTS
     ----------------------------------------------------------------------- */
  class ContactForm {
    constructor() {
      this.form = document.getElementById('contact-form');
      if (!this.form) return;
      this._bindValidation();
      this._bindFocusEffects();
    }

    _bindValidation() {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        let valid = true;

        this.form.querySelectorAll('[required]').forEach((input) => {
          if (!input.value.trim()) {
            valid = false;
            input.classList.add('error');
            this._shake(input);
          } else {
            input.classList.remove('error');
          }

          // Email validation
          if (input.type === 'email' && input.value) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!re.test(input.value)) {
              valid = false;
              input.classList.add('error');
              this._shake(input);
            }
          }
        });

        if (valid) {
          const btn = this.form.querySelector('button[type="submit"], .submit-btn');
          if (btn) {
            btn.textContent = 'SENT ✓';
            btn.classList.add('success');
            // Particle burst on submit via click event is already handled by particle system
          }
        }
      });
    }

    _shake(el) {
      el.style.animation = 'none';
      void el.offsetHeight; // trigger reflow
      el.style.animation = 'shake 0.4s ease';
    }

    _bindFocusEffects() {
      this.form.querySelectorAll('input, textarea').forEach((input) => {
        input.addEventListener('focus', () => {
          input.parentElement?.classList.add('focused');
          input.style.boxShadow = '0 0 15px rgba(0,240,255,0.25)';
        });
        input.addEventListener('blur', () => {
          input.parentElement?.classList.remove('focused');
          input.style.boxShadow = 'none';
          // Floating label check
          if (input.value.trim()) {
            input.classList.add('has-value');
          } else {
            input.classList.remove('has-value');
          }
        });
      });
    }
  }

  /* -----------------------------------------------------------------------
     18. SOUND TOGGLE (Web Audio API ambient)
     ----------------------------------------------------------------------- */
  class SoundToggle {
    constructor() {
      this.btn = document.getElementById('sound-toggle');
      this.ctx = null;
      this.isPlaying = false;
      this.nodes = [];
      this.audio = null;
      this.apiKey = 'ec9fc27069fc4759a5adb430f3469ed5d826a9ed';
      this.model = 'aura-asteria-en'; // Female, Professional, English US

      if (!this.btn) return;
      this.btn.addEventListener('click', () => this.toggle());

      // Pre-load synthesis voices for fallback
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }

    toggle() {
      if (this.isPlaying) {
        this._stop();
      } else {
        this._start();
      }
    }

    _start() {
      if (this.isPlaying) return;

      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Create ambient drone with multiple oscillators
      const masterGain = this.ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(this.ctx.destination);

      // Fade in
      masterGain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 1);

      const freqs = [55, 82.41, 110, 164.81]; // low ambient tones
      freqs.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const oscGain = this.ctx.createGain();
        oscGain.gain.value = i === 0 ? 0.5 : 0.15;

        // Subtle frequency drift
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.05 + i * 0.02;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 1.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();

        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();

        this.nodes.push(osc, lfo, oscGain, lfoGain);
      });

      this.masterGain = masterGain;
      this.nodes.push(masterGain);
      this.isPlaying = true;
      this.btn.classList.add('active');
      this.btn.setAttribute('aria-pressed', 'true');

      // Speak introduction via Deepgram TTS API
      this._speakIntroDeepgram();
    }

    async _speakIntroDeepgram() {
      const introText = `
        Hello, and welcome.

I'm Aarif's AI assistant, and it's a pleasure to meet you.

Before you explore this portfolio, let me introduce you to the person behind it.

Meet Mohammed Aarif. ,,,

A builder, an AI enthusiast, and a lifelong learner who is passionate about transforming ideas into impactful technology.,,,

For Aarif, engineering is more than writing code. It's about solving problems, creating value, and continuously pushing the boundaries of what's possible.,,,

His journey spans Artificial Intelligence, Machine Learning, Software Engineering, and innovative research.,, From developing intelligent AI systems to building scalable applications,,, he enjoys turning complex challenges into practical solutions.

But what truly defines Aarif is his mindset.

He believes that every project is an opportunity to learn, every challenge is a chance to grow, and every idea has the potential to make a difference.

This portfolio is a reflection of that journey.

A collection of projects, experiences, and ideas that showcase not only what he has built, but also the passion that drives him forward.

So, take your time, explore his work, and discover the story behind the technology. ,,,

Thank you for visiting. ,,,

And once again, welcome to Mohammed Aarif's portfolio.


`;

      try {
        this.btn.classList.add('loading-audio');
        
        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${this.model}`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: introText })
        });

        if (!response.ok) {
          throw new Error(`Deepgram TTS failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        this.btn.classList.remove('loading-audio');

        if (!this.isPlaying) return; // User stopped it during the fetch

        const audioUrl = URL.createObjectURL(blob);
        this.audio = new Audio(audioUrl);
        
        this.audio.play();

        this.audio.onended = () => {
          this.audio = null;
        };

      } catch (err) {
        console.error('[Portfolio Voice] Deepgram TTS integration failed, using local fallback:', err);
        this.btn.classList.remove('loading-audio');
        
        // Fallback to HTML5 SpeechSynthesis if API fails
        this._speakIntroFallback(introText);
      }
    }

    _speakIntroFallback(text) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 0.95;
      utterance.rate = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('Female'))) || 
                    voices.find(v => v.lang.startsWith('en')) || 
                    voices[0];
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    }

    _stop() {
      // Stop Deepgram audio if playing
      if (this.audio) {
        try {
          this.audio.pause();
        } catch (e) {}
        this.audio = null;
      }

      // Stop SpeechSynthesis fallback if running
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      // Stop ambient drone
      if (this.masterGain) {
        this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
        setTimeout(() => {
          this.nodes.forEach((n) => { try { n.stop && n.stop(); n.disconnect(); } catch (e) {} });
          this.nodes = [];
        }, 600);
      }

      this.isPlaying = false;
      this.btn.classList.remove('active');
      this.btn.classList.remove('loading-audio');
      this.btn.setAttribute('aria-pressed', 'false');
    }
  }

  /* -----------------------------------------------------------------------
     19. SCROLL-BASED SCENE CHANGES
     ----------------------------------------------------------------------- */
  class SceneColorManager {
    constructor(renderer) {
      this.renderer = renderer;
      // Subtle background tints per section
      this.tints = [
        new THREE.Color(0x020a0a), // hero — deep green-black
        new THREE.Color(0x02080a), // about — deep cyan-black
        new THREE.Color(0x030a06), // skills — matrix-green
        new THREE.Color(0x010808), // projects — deep cyan
        new THREE.Color(0x020508), // experience — deep blue
        new THREE.Color(0x020a06), // contact — matrix-green
      ];
      this.currentColor = this.tints[0].clone();
    }

    update(sectionIdx) {
      const target = this.tints[clamp(sectionIdx, 0, this.tints.length - 1)];
      this.currentColor.lerp(target, 0.02);
      // Apply as subtle overlay via CSS (renderer stays transparent)
      const container = document.getElementById('three-canvas-container');
      if (container) {
        const r = Math.round(this.currentColor.r * 255);
        const g = Math.round(this.currentColor.g * 255);
        const b = Math.round(this.currentColor.b * 255);
        container.style.backgroundColor = `rgb(${r},${g},${b})`;
      }
    }
  }

  /* -----------------------------------------------------------------------
     20. SMOOTH SCROLL PROGRESS INDICATOR
     ----------------------------------------------------------------------- */
  class ScrollProgressBar {
    constructor() {
      this.bar = document.querySelector('.scroll-progress');
      if (!this.bar) {
        this.bar = document.createElement('div');
        this.bar.classList.add('scroll-progress');
        this.bar.style.cssText =
          'position:fixed;top:0;left:0;height:2px;background:linear-gradient(90deg,' +
          HEX.cyan + ',' + HEX.violet + ',' + HEX.magenta +
          ');z-index:10000;transition:width 0.1s;width:0%;';
        document.body.appendChild(this.bar);
      }

      window.addEventListener(
        'scroll',
        throttle(() => {
          const max = document.body.scrollHeight - window.innerHeight;
          const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
          this.bar.style.width = pct + '%';
        }, 50),
        { passive: true }
      );
    }
  }

  /* -----------------------------------------------------------------------
     20.5. HUD MANAGER
     ----------------------------------------------------------------------- */
  class HUDManager {
    constructor() {
      this.coordsEl = document.getElementById('hud-coords');
      this.fpsEl    = document.getElementById('hud-fps');
      this.sectorEl = document.getElementById('hud-sector');
      this.loadEl   = document.getElementById('hud-node-load');
      this.agentsEl = document.getElementById('hud-agents');
      this.sectors = ['ALPHA-7', 'BETA-3', 'GAMMA-9', 'DELTA-1', 'EPSILON-5', 'ZETA-2'];
      this.lastTime = performance.now();
      this.frames = 0;
      this.fps = 60;
    }

    update(sectionIdx) {
      // Update coords based on mouse
      if (this.coordsEl) {
        this.coordsEl.textContent = `X:${mouse.x.toFixed(2)} Y:${mouse.y.toFixed(2)}`;
      }

      // Update FPS
      this.frames++;
      const now = performance.now();
      if (now - this.lastTime >= 1000) {
        this.fps = this.frames;
        this.frames = 0;
        this.lastTime = now;
        if (this.fpsEl) this.fpsEl.textContent = this.fps + ' FPS';
      }

      // Update sector based on section
      if (this.sectorEl) {
        this.sectorEl.textContent = this.sectors[clamp(sectionIdx, 0, this.sectors.length - 1)];
      }

      // Fluctuate CPU/Memory loads dynamically
      if (this.loadEl && Math.random() < 0.08) {
        const cpu = Math.floor(rand(18, 55));
        const mem = (3.0 + rand(0, 0.4)).toFixed(1);
        this.loadEl.textContent = `CPU: ${cpu}% // MEM: ${mem}GB`;
      }

      // Alternate active agent statuses
      if (this.agentsEl && Math.random() < 0.03) {
        const states = ['ACTIVE', 'IDLE', 'RUNNING', 'PROCESSING', 'EVALUATING'];
        const stateA = states[Math.floor(Math.random() * states.length)];
        const stateB = states[Math.floor(Math.random() * states.length)];
        this.agentsEl.textContent = `AGENT_AETHER: ${stateA} // AGENT_AAROGYA: ${stateB}`;
      }
    }
  }

  /* -----------------------------------------------------------------------
     20.7. TERMINAL LOGGER (Model training simulation)
     ----------------------------------------------------------------------- */
  class TerminalLogger {
    constructor(selector) {
      this.el = document.querySelector(selector);
      if (!this.el) return;
      
      this.logs = [
        { type: 'cmd', text: '> INITIALIZING MODEL ENGINE...' },
        { type: 'success', text: '✓ NEURAL CORE IDENTIFIED ON DEVICE: GPU_A100' },
        { type: 'info', text: '> LAYER CONFIGURES: [1024, 512, 256, 128]' },
        { type: 'warning', text: '! WARNING: MODEL CONVERGENCE SET TO DYNAMIC' },
        { type: 'cmd', text: '> PRE-TRAINING INITIAL SHAPE VERIFICATION...' },
        { type: 'success', text: '✓ DIMS COMPARATIVE CHECKS COMPLETE' },
        { type: 'info', text: '> Epoch 1/10: [=====>] Loss: 0.84 - Acc: 0.72' },
        { type: 'info', text: '> Epoch 2/10: [==========>] Loss: 0.51 - Acc: 0.83' },
        { type: 'info', text: '> Epoch 3/10: [===============>] Loss: 0.32 - Acc: 0.91' },
        { type: 'success', text: '✓ GRAPH_RAG ALIGNMENT: 90.8%' },
        { type: 'cmd', text: '> INJECTING SEMANTIC VECTOR MAPS...' },
        { type: 'info', text: '> RETRIEVING NODES FROM KNOWLEDGE GRAPH...' },
        { type: 'success', text: '✓ 142k ASSOCIATIVE ENTITIES LINKED' },
        { type: 'info', text: '> INITIALIZING EVAL MONITOR AGENT...' },
        { type: 'warning', text: '! SYSTEM: MONITOR ACTIVE ON SUB-NODES' },
        { type: 'success', text: '✓ ALL AI COGNITIVE ENGINES OPERATIONAL' },
        { type: 'cmd', text: '> COMMENCING TRAINING STEP CYCLE...' },
        { type: 'info', text: '> Epoch 4/10: [====================>] Loss: 0.18 - Acc: 0.96' },
        { type: 'info', text: '> Epoch 5/10: [====================>] Loss: 0.12 - Acc: 0.98' },
        { type: 'success', text: '✓ MINIMUM LOSS THRESHOLD MET. EXPORTED.' }
      ];
      this.logIdx = 0;
      this.maxLines = 11;
      
      this._printNextLog();
    }

    _printNextLog() {
      if (!this.el) return;
      const log = this.logs[this.logIdx];
      
      const p = document.createElement('p');
      p.className = `term-line ${log.type}`;
      p.textContent = log.text;
      
      this.el.appendChild(p);
      this.el.scrollTop = this.el.scrollHeight;
      
      if (this.el.children.length > this.maxLines) {
        this.el.removeChild(this.el.firstChild);
      }
      
      this.logIdx = (this.logIdx + 1) % this.logs.length;
      
      const nextDelay = log.text.includes('Epoch') ? rand(1500, 2500) : rand(400, 1000);
      setTimeout(() => this._printNextLog(), nextDelay);
    }
  }

  /* -----------------------------------------------------------------------
     21. SECTION HEADER GLITCH EFFECT
     ----------------------------------------------------------------------- */
  class GlitchText {
    constructor() {
      this.elements = document.querySelectorAll('.glitch, [data-glitch]');
      this.elements.forEach((el) => {
        el.setAttribute('data-text', el.textContent);
      });
    }
  }

  /* -----------------------------------------------------------------------
     22. MAGNETIC BUTTONS
     ----------------------------------------------------------------------- */
  class MagneticButtons {
    constructor() {
      if (IS_MOBILE) return;
      this.buttons = document.querySelectorAll('.magnetic, .cta-btn, .hero-btn');
      this.buttons.forEach((btn) => this._bind(btn));
    }

    _bind(btn) {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top  - rect.height / 2;
        btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate(0, 0)';
        btn.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      });

      btn.addEventListener('mouseenter', () => {
        btn.style.transition = 'transform 0.15s ease';
      });
    }
  }

  /* -----------------------------------------------------------------------
     23. TEXT SPLIT / REVEAL FOR HEADINGS
     ----------------------------------------------------------------------- */
  class TextReveal {
    constructor() {
      this.elements = document.querySelectorAll('.text-reveal, .section-title');
      this.elements.forEach((el) => {
        // Wrap each character in a span for reveal
        if (el.getAttribute('data-split') === 'true' || el.classList.contains('text-reveal')) {
          const text = el.textContent;
          el.innerHTML = '';
          text.split('').forEach((char, i) => {
            const span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.style.cssText =
              'display:inline-block;opacity:0;transform:translateY(30px);' +
              'transition:opacity 0.4s ease ' + (i * 0.03) + 's, ' +
              'transform 0.4s ease ' + (i * 0.03) + 's;';
            el.appendChild(span);
          });

          // Reveal on intersection
          const obs = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  el.querySelectorAll('span').forEach((s) => {
                    s.style.opacity = '1';
                    s.style.transform = 'translateY(0)';
                  });
                }
              });
            },
            { threshold: 0.3 }
          );
          obs.observe(el);
        }
      });
    }
  }

  /* -----------------------------------------------------------------------
     24. COUNTER ANIMATIONS (stats, numbers)
     ----------------------------------------------------------------------- */
  class CounterAnimation {
    constructor() {
      this.counters = document.querySelectorAll('[data-count]');
      if (!this.counters.length) return;

      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this._animate(entry.target);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      this.counters.forEach((el) => obs.observe(el));
    }

    _animate(el) {
      const target = parseInt(el.getAttribute('data-count'), 10) || 0;
      const suffix = el.getAttribute('data-suffix') || '';
      const duration = 2000;
      const start = performance.now();

      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const val = Math.round(easeOutCubic(t) * target);
        el.textContent = val + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  /* -----------------------------------------------------------------------
     25. SMOOTH SCROLL ANCHOR OFFSET
     ----------------------------------------------------------------------- */
  class SmoothScrollOffset {
    constructor() {
      // Handle hash on load
      if (window.location.hash) {
        setTimeout(() => {
          const el = document.querySelector(window.location.hash);
          if (el) {
            window.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
          }
        }, 100);
      }
    }
  }

  /* -----------------------------------------------------------------------
     26. FLOATING PARTICLES AROUND HERO CTA
     ----------------------------------------------------------------------- */
  class HeroParticles {
    constructor() {
      const hero = document.getElementById('hero');
      if (!hero) return;
      // Add subtle CSS particle dots around hero
      for (let i = 0; i < 15; i++) {
        const dot = document.createElement('div');
        dot.classList.add('hero-float-particle');
        dot.style.cssText =
          'position:absolute;width:' + rand(2, 5) + 'px;height:' + rand(2, 5) + 'px;' +
          'border-radius:50%;background:' + (Math.random() > 0.5 ? HEX.cyan : HEX.violet) + ';' +
          'opacity:' + rand(0.15, 0.5) + ';' +
          'left:' + rand(5, 95) + '%;top:' + rand(5, 95) + '%;' +
          'animation:float-particle ' + rand(4, 9) + 's ease-in-out ' + rand(0, 3) + 's infinite alternate;' +
          'pointer-events:none;';
        hero.appendChild(dot);
      }

      // Inject keyframe if not present
      if (!document.getElementById('float-particle-kf')) {
        const style = document.createElement('style');
        style.id = 'float-particle-kf';
        style.textContent = `
          @keyframes float-particle {
            0% { transform: translate(0, 0) scale(1); }
            100% { transform: translate(${rand(-30,30)}px, ${rand(-40,40)}px) scale(${rand(0.5,1.5)}); }
          }
        `;
        document.head.appendChild(style);
      }
    }
  }

  /* -----------------------------------------------------------------------
     26.5. HOLOGRAPHIC AVATAR 3D MODEL
     ----------------------------------------------------------------------- */
  class HolographicAvatar {
    constructor() {
      this.container = document.querySelector('.avatar-geometric');
      if (!this.container) return;

      this.canvasContainer = this.container.querySelector('.avatar-canvas-container');
      this.imgContainer = this.container.querySelector('.avatar-img-container');
      if (!this.canvasContainer || !this.imgContainer) return;

      this.width = 240;
      this.height = 240;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
      this.camera.position.z = 220;

      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.renderer.setSize(this.width, this.height);
      this.renderer.setPixelRatio(DPR);
      this.renderer.domElement.style.position = 'absolute';
      this.renderer.domElement.style.top = '50%';
      this.renderer.domElement.style.left = '50%';
      this.renderer.domElement.style.transform = 'translate(-50%, -50%)';
      this.renderer.domElement.style.zIndex = '1';
      this.renderer.domElement.style.pointerEvents = 'none';
      this.canvasContainer.appendChild(this.renderer.domElement);

      this.meshGroup = new THREE.Group();
      this.scene.add(this.meshGroup);

      this._createModel();
      this._bindMouse();
      this._animate();
    }

    _createModel() {
      // Ring 1 (cyan wireframe ring)
      const ring1Geom = new THREE.RingGeometry(65, 68, 32);
      const ring1Mat = new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
        wireframe: true
      });
      this.ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
      this.meshGroup.add(this.ring1);

      // Ring 2 (green dotted orbit ring)
      const ring2Geom = new THREE.RingGeometry(75, 76, 24);
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: COLORS.violet, // green
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
        wireframe: true
      });
      this.ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
      this.ring2.rotation.x = Math.PI / 4;
      this.meshGroup.add(this.ring2);

      // Cyber hexagon mesh
      const hexGeom = new THREE.CylinderGeometry(58, 58, 6, 6, 1, true);
      const hexMat = new THREE.MeshBasicMaterial({
        color: COLORS.magenta, // green-cyan
        wireframe: true,
        transparent: true,
        opacity: 0.25
      });
      this.hexMesh = new THREE.Mesh(hexGeom, hexMat);
      this.hexMesh.rotation.x = Math.PI / 2;
      this.meshGroup.add(this.hexMesh);

      // Orbiting particles
      const partGeo = new THREE.BufferGeometry();
      const partCount = 25;
      const pos = new Float32Array(partCount * 3);
      const angles = [];
      for(let i=0; i<partCount; i++) {
        const angle = (i / partCount) * Math.PI * 2;
        const r = 85;
        pos[i*3] = Math.cos(angle) * r;
        pos[i*3+1] = rand(-15, 15);
        pos[i*3+2] = Math.sin(angle) * r;
        angles.push(angle);
      }
      partGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const partMat = new THREE.PointsMaterial({
        color: COLORS.cyan,
        size: 3,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
      this.orbitParticles = new THREE.Points(partGeo, partMat);
      this.orbitParticles.userData = { angles };
      this.meshGroup.add(this.orbitParticles);
    }

    _bindMouse() {
      this.mouseTarget = { x: 0, y: 0 };
      const aboutImage = document.querySelector('.about-image');
      if (!aboutImage) return;

      aboutImage.addEventListener('mousemove', (e) => {
        const rect = aboutImage.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // 3D rotation targets for WebGL meshes
        this.mouseTarget.x = x * 0.4;
        this.mouseTarget.y = y * 0.4;

        // Apply 3D tilt transformation to the HTML image container
        const tiltX = y * 12; // tilt angle limit
        const tiltY = x * 12;
        this.imgContainer.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.05)`;
        this.imgContainer.style.boxShadow = `0 15px 35px rgba(0, 240, 255, 0.4), 0 0 25px rgba(0, 255, 102, 0.3)`;
      });

      aboutImage.addEventListener('mouseleave', () => {
        this.mouseTarget.x = 0;
        this.mouseTarget.y = 0;
        
        // Reset HTML image container tilt smoothly
        this.imgContainer.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
        this.imgContainer.style.boxShadow = '0 0 15px rgba(0, 240, 255, 0.4)';
      });
    }

    _animate() {
      requestAnimationFrame(() => this._animate());

      // Rotate group towards mouse targets
      this.meshGroup.rotation.y += (this.mouseTarget.x - this.meshGroup.rotation.y) * 0.05;
      this.meshGroup.rotation.x += (this.mouseTarget.y - this.meshGroup.rotation.x) * 0.05;

      // Procedural animations
      if (this.ring1) {
        this.ring1.rotation.z += 0.005;
      }
      if (this.ring2) {
        this.ring2.rotation.z -= 0.008;
      }
      if (this.hexMesh) {
        this.hexMesh.rotation.y += 0.003;
      }

      if (this.orbitParticles) {
        const posAttr = this.orbitParticles.geometry.attributes.position;
        const arr = posAttr.array;
        const angles = this.orbitParticles.userData.angles;
        const time = performance.now() * 0.001;
        for(let i=0; i<angles.length; i++) {
          angles[i] += 0.01;
          const r = 85 + Math.sin(time + i) * 6;
          arr[i*3] = Math.cos(angles[i]) * r;
          arr[i*3+2] = Math.sin(angles[i]) * r;
        }
        posAttr.needsUpdate = true;
      }

      this.meshGroup.position.y = Math.sin(performance.now() * 0.002) * 5;
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* -----------------------------------------------------------------------
     MAIN INITIALIZATION
     ----------------------------------------------------------------------- */
  loader.animateTo(65);

  let sceneManager, particles, constellations, wireframes, scrollMgr, sceneColors, hud;

  function initThreeJS() {
    sceneManager   = new SceneManager();
    particles      = new ParticleSystem(sceneManager.scene);
    constellations = new ConstellationLines(sceneManager.scene, particles);
    wireframes     = new WireframeObjects(sceneManager.scene);
    scrollMgr      = new ScrollManager();
    sceneColors    = new SceneColorManager(sceneManager.renderer);
    hud            = new HUDManager();

    loader.animateTo(85);

    // Animation loop
    function animate() {
      if (!sceneManager.isVisible) {
        requestAnimationFrame(animate);
        return;
      }

      const elapsed = sceneManager.clock.getElapsedTime();
      const scrollT = scrollMgr.scrollT;
      sceneManager.scrollT = scrollT;

      // Update systems
      particles.update(elapsed, scrollT);
      constellations.update();
      wireframes.update(elapsed, scrollT);
      sceneColors.update(scrollMgr.currentSection);
      if (hud) hud.update(scrollMgr.currentSection);

      // Camera
      sceneManager.updateCamera();
      sceneManager.render();

      requestAnimationFrame(animate);
    }

    animate();
    loader.animateTo(95);
  }

  function initUI() {
    new ScrollReveal();
    new Navigation(scrollMgr);
    new TypingEffect('#typing-text');
    new SkillBars();
    new TiltCards();
    new CustomCursor();
    new ParallaxScroll();
    new TimelineAnimation();
    try {
      new MissionTabs();
    } catch (err) {
      console.warn('[Portfolio] MissionTabs init failed.', err);
    }
    new ContactForm();
    new SoundToggle();
    new ScrollProgressBar();
    new GlitchText();
    new MagneticButtons();
    new TextReveal();
    new CounterAnimation();
    new SmoothScrollOffset();
    new HeroParticles();
    try {
      new HolographicAvatar();
    } catch (err) {
      console.warn('[Portfolio] HolographicAvatar init failed.', err);
    }
    try {
      new TerminalLogger('#about-terminal');
    } catch (err) {
      console.warn('[Portfolio] TerminalLogger init failed.', err);
    }
    try {
      new AIAgentWidget();
    } catch (err) {
      console.warn('[Portfolio] AIAgentWidget init failed.', err);
    }
  }

  /* -----------------------------------------------------------------------
     27. AI AGENT COMPANION SHELL
     ----------------------------------------------------------------------- */
  class AIAgentWidget {
    constructor() {
      this.widget = document.getElementById('ai-agent-widget');
      if (!this.widget) return;

      this.toggleBtn = document.getElementById('ai-agent-toggle');
      this.chatbox   = document.getElementById('ai-agent-chatbox');
      this.closeBtn  = document.getElementById('chatbox-close');
      this.messages  = document.getElementById('chatbox-messages');
      this.form      = document.getElementById('chatbox-input-form');
      this.input     = document.getElementById('chatbox-input');
      this.quickTags = this.widget.querySelectorAll('.quick-tag');

      this.responses = {
        '/skills': `COGNITIVE ARSENAL RETRIEVED:\n\n• Languages: Python, Java, JavaScript, SQL\n• AI/ML: Generative AI, Agentic AI, LLMs, GraphRAG, Prompt Engineering, Evaluation\n• Deep Learning: NLP, PyTorch, Transformers\n• Data: PySpark ETL, Delta Lake, Medallion Architecture, SQL Optimization\n• Backend & DevOps: FastAPI, Redis, Docker, Azure Databricks, Supabase pgvector, Prometheus, Grafana`,
        '/academics': `ACADEMIC RECORD SUMMARY:\n\n1. B.Tech in CSE (AI/ML) | Lovely Professional University\n   • CGPA: 8.21 | Aug 2023 - Present\n\n2. Intermediate (PCM) | S.B.N Public School\n   • Score: 83% | Mar 2022 - May 2023\n\n3. Matriculation | S.S.N Public School\n   • Score: 92% | Mar 2020 - May 2021`,
        '/projects': `SELECTED WORK BLUEPRINTS:\n\n1. AETHER AI ASSISTANT\n   • GraphRAG system utilizing async FastAPI & Redis.\n   • Code: github.com/aarif-123/GraphRag-Research-Assistant\n\n2. AAROGYA CHATBOT\n   • RAG healthcare chatbot with pgvector & Prometheus observability.\n   • Code: github.com/aarif-123/HUMAN-NUTRITION-RAG\n\n3. BANKING DATA LAKEHOUSE\n   • PySpark ETL medallion architecture data pipeline.\n   • Code: github.com/aarif-123/banking-data-lakehouse\n\n4. SMS SPAM CLASSIFICATION\n   • Fine-tuned transformer models for message classification.\n   • Code: github.com/aarif-123/sms-classificarion\n\n5. HOUSE PRICE PREDICTION\n   • XGBoost regression model deployed on Vercel.\n   • Code: github.com/aarif-123/House-Price-prediciton\n   • Live: vercel.com/aarif-123s-projects?repo=https://github.com/aarif-123/House-Price-prediciton`,
        '/achievements': `MILESTONES & HACKATHONS RETRIEVED:\n\n1. AUTONOMOUS DRONE PATENT\n   • Patent filed: "Autonomous Drone System for the Maintenance of Street Cameras"\n   • Employs Edge AI and Computer Vision models for camera servicing.\n\n2. SMART INDIA HACKATHON WINNER\n   • Developed neural psychological assessment systems for early detection of suicidal tendencies. First place victory in national SIH.`,
        '/certifications': `CORE CERTIFICATIONS RETRIEVED:\n\n1. GRAPH & ML SPECIALIST\n   • Neo4j Graph Databases Fundamentals & IIT Kharagpur ML Certified.\n\n2. DSA & SOFTWARE ENGINEERING\n   • LeetCode 200+ Solved Challenges & CipherSchool Java Core.`,
        '/contact': `ESTABLISH REAL-TIME CONNECTION:\n\n• Email: mohdaarif92422@gmail.com\n• LinkedIn: linkedin.com/in/mohdaarif01\n• GitHub: github.com/aarif-123\n• Mobile: +91 9257129010`
      };

      this._bindEvents();
    }

    _bindEvents() {
      this.toggleBtn.addEventListener('click', () => {
        const isHidden = this.chatbox.hasAttribute('hidden');
        if (isHidden) {
          this.chatbox.removeAttribute('hidden');
          this.toggleBtn.style.opacity = '0';
          this.toggleBtn.style.pointerEvents = 'none';
          this.input.focus();
        }
      });

      this.closeBtn.addEventListener('click', () => {
        this.chatbox.setAttribute('hidden', '');
        this.toggleBtn.style.opacity = '1';
        this.toggleBtn.style.pointerEvents = 'auto';
      });

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = this.input.value.trim();
        if (!text) return;
        this._handleUserMsg(text);
        this.input.value = '';
      });

      this.quickTags.forEach((tag) => {
        tag.addEventListener('click', () => {
          const cmd = tag.getAttribute('data-cmd');
          this._handleUserMsg(cmd);
        });
      });
    }

    _handleUserMsg(text) {
      // User message
      this._appendMsg('user', text);

      // AI Response with simulation delay
      setTimeout(() => {
        this._showTypingIndicator();
      }, 300);

      setTimeout(() => {
        this._removeTypingIndicator();
        const rawQuery = text.toLowerCase().trim();
        let cmd = '';
        let reply = '';
        let targetSection = '';
        let targetTab = '';

        // NLP Keyword mappings to system commands and sections
        if (rawQuery.includes('project') || rawQuery.includes('work') || rawQuery.includes('portfolio') || rawQuery.includes('codebase') || rawQuery === '/projects') {
          cmd = '/projects';
          targetSection = 'projects';
        } else if (rawQuery.includes('skill') || rawQuery.includes('tech') || rawQuery.includes('language') || rawQuery.includes('arsenal') || rawQuery === '/skills' || rawQuery.includes('python') || rawQuery.includes('java')) {
          cmd = '/skills';
          targetSection = 'skills';
        } else if (rawQuery.includes('academics') || rawQuery.includes('education') || rawQuery.includes('college') || rawQuery.includes('university') || rawQuery.includes('school') || rawQuery === '/academics' || rawQuery.includes('lpu')) {
          cmd = '/academics';
          targetSection = 'experience';
          targetTab = 'education';
        } else if (rawQuery.includes('achievement') || rawQuery.includes('hackathon') || rawQuery.includes('patent') || rawQuery.includes('drone') || rawQuery.includes('sih') || rawQuery === '/achievements') {
          cmd = '/achievements';
          targetSection = 'experience';
          targetTab = 'achievements';
        } else if (rawQuery.includes('certif') || rawQuery.includes('neo4j') || rawQuery.includes('leetcode') || rawQuery.includes('dsa') || rawQuery.includes('course') || rawQuery === '/certifications') {
          cmd = '/certifications';
          targetSection = 'experience';
          targetTab = 'certifications';
        } else if (rawQuery.includes('contact') || rawQuery.includes('email') || rawQuery.includes('linkedin') || rawQuery.includes('phone') || rawQuery.includes('address') || rawQuery.includes('hire') || rawQuery === '/contact') {
          cmd = '/contact';
          targetSection = 'contact';
        }

        // Generate response
        if (cmd && this.responses[cmd]) {
          reply = this.responses[cmd];
        } else if (rawQuery.includes('hello') || rawQuery.includes('hi') || rawQuery.includes('hey')) {
          reply = `AETHER > Greetings. I am optimized to map Aarif's portfolio databases. Ask me a question or type commands:\n\n• /skills (Retrieve tech)\n• /projects (Retrieve works)\n• /academics (Retrieve education)\n• /achievements (Retrieve milestones)\n• /certifications (Retrieve certificates)\n• /contact (Display contacts)`;
        } else if (rawQuery.includes('clear')) {
          this.messages.innerHTML = `<div class="chat-message system"><span class="msg-sender">SYSTEM //</span> Console logs reset. Ready.</div>`;
          return;
        } else {
          reply = `AETHER > Warning: Node "${text}" not fully mapped.\n\nPlease execute query:\n• /skills (Show tech)\n• /projects (Show works)\n• /academics (Show education)\n• /achievements (Show milestones)\n• /certifications (Show certificates)\n• /contact (Show contacts)`;
        }

        this._appendMsg('agent', reply);

        // Smooth scroll & auto-tab navigation triggers
        if (targetSection) {
          setTimeout(() => {
            const el = document.getElementById(targetSection);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              
              // Switch tabs inside Experience section
              if (targetTab) {
                const tabBtn = document.querySelector(`.mission-tab-btn[data-tab="${targetTab}"]`);
                if (tabBtn) tabBtn.click();
              }
            }
          }, 800);
        }
      }, 1000);
    }

    _appendMsg(sender, text) {
      const msg = document.createElement('div');
      msg.className = `chat-message ${sender}`;
      
      const senderSpan = document.createElement('span');
      senderSpan.className = 'msg-sender';
      senderSpan.textContent = sender === 'user' ? 'USER > ' : 'AETHER > ';
      
      msg.appendChild(senderSpan);
      msg.appendChild(document.createTextNode(text));
      
      this.messages.appendChild(msg);
      this.messages.scrollTop = this.messages.scrollHeight;
    }

    _showTypingIndicator() {
      if (document.getElementById('typing-indicator')) return;
      const msg = document.createElement('div');
      msg.className = 'chat-message agent';
      msg.id = 'typing-indicator';
      
      const senderSpan = document.createElement('span');
      senderSpan.className = 'msg-sender';
      senderSpan.textContent = 'AETHER > ';
      msg.appendChild(senderSpan);

      const dots = document.createElement('span');
      dots.className = 'typing-cursor';
      dots.textContent = 'RUNNING CONSOLE DIAGNOSTICS...';
      msg.appendChild(dots);

      this.messages.appendChild(msg);
      this.messages.scrollTop = this.messages.scrollHeight;
    }

    _removeTypingIndicator() {
      const indicator = document.getElementById('typing-indicator');
      if (indicator) indicator.remove();
    }
  }

  /* -----------------------------------------------------------------------
     BOOT
     ----------------------------------------------------------------------- */
  function boot() {
    try {
      initThreeJS();
    } catch (err) {
      console.warn('[Portfolio] Three.js init failed — running in 2D mode.', err);
    }
    initUI();
    loader.hide();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
