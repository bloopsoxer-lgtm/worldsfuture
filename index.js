import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';

const container = document.getElementById('globe');
if (!container) throw new Error('Container #globe não encontrado');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = container.offsetWidth || 700;
let H = container.offsetHeight || W;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(W, H);
renderer.domElement.style.display = 'block';
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);

function updateCameraByWidth() {
  W = container.offsetWidth || 700;
  H = container.offsetHeight || W;

  const minW = 320;
  const maxW = 1200;

  const t = Math.min(1, Math.max(0, (W - minW) / (maxW - minW)));

  const farZ = 2.9;
  const nearZ = 3;

  camera.position.z = farZ + (nearZ - farZ) * t;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();

  renderer.setSize(W, H);
}

updateCameraByWidth();

scene.add(new THREE.AmbientLight(0xffffff, 1));

const group = new THREE.Group();
scene.add(group);

const R = 1;
const countryR = R + 0.0025;

function lonLatToXYZ(lon, lat, r = R) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function normalize(v) {
  const len = v.length() || 1;
  return v.clone().multiplyScalar(1 / len);
}

function makeBasisFromNormal(n) {
  const normal = normalize(n);
  const helper = Math.abs(normal.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);

  const u = normalize(new THREE.Vector3().crossVectors(helper, normal));
  const v = normalize(new THREE.Vector3().crossVectors(normal, u));

  return { u, v, normal };
}

function signedArea2D(pts) {
  let area = 0;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }

  return area * 0.5;
}

function cleanRing(coords) {
  if (!coords || coords.length < 3) return [];

  const out = [];

  for (let i = 0; i < coords.length; i++) {
    const p = coords[i];

    if (!out.length) {
      out.push([p[0], p[1]]);
      continue;
    }

    const last = out[out.length - 1];

    if (last[0] !== p[0] || last[1] !== p[1]) {
      out.push([p[0], p[1]]);
    }
  }

  if (out.length >= 2) {
    const first = out[0];
    const last = out[out.length - 1];

    if (first[0] === last[0] && first[1] === last[1]) {
      out.pop();
    }
  }

  return out.length >= 3 ? out : [];
}

function coordsTo3D(coords, r = countryR) {
  return coords.map(([lon, lat]) => lonLatToXYZ(lon, lat, r));
}

function projectRingToPlane(pts3d, origin, u, v) {
  return pts3d.map(p => {
    const d = p.clone().sub(origin);
    return new THREE.Vector2(d.dot(u), d.dot(v));
  });
}

function buildCountryGeometry(rings) {
  if (!rings || !rings.length) return null;

  const outer = cleanRing(rings[0]);
  if (outer.length < 3) return null;

  const holes = [];

  for (let i = 1; i < rings.length; i++) {
    const ring = cleanRing(rings[i]);
    if (ring.length >= 3) holes.push(ring);
  }

  const outer3D = coordsTo3D(outer);

  const origin = normalize(
    outer3D.reduce((acc, p) => acc.add(p), new THREE.Vector3())
  ).multiplyScalar(countryR);

  const { u, v } = makeBasisFromNormal(origin);

  const contour2D = projectRingToPlane(outer3D, origin, u, v);
  const hole2DList = holes.map(r => projectRingToPlane(coordsTo3D(r), origin, u, v));

  if (signedArea2D(contour2D) < 0) {
    outer3D.reverse();
    contour2D.reverse();
  }

  for (let i = 0; i < hole2DList.length; i++) {
    if (signedArea2D(hole2DList[i]) > 0) {
      hole2DList[i].reverse();
    }
  }

  const faces = THREE.ShapeUtils.triangulateShape(contour2D, hole2DList);
  if (!faces || !faces.length) return null;

  const all3D = [...outer3D];

  for (let i = 0; i < holes.length; i++) {
    all3D.push(...coordsTo3D(holes[i]));
  }

  const verts = [];

  for (const face of faces) {
    const a = all3D[face[0]];
    const b = all3D[face[1]];
    const c = all3D[face[2]];

    verts.push(
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();

  return geo;
}

const css = getComputedStyle(document.documentElement);
const bone = new THREE.Color(css.getPropertyValue('--bone').trim() || '#e0ddcf');
const depth = parseFloat(css.getPropertyValue('--globe-depth')) || 0.24;

const countryMatFront = new THREE.MeshBasicMaterial({
  color: bone,
  side: THREE.FrontSide,
  depthTest: true,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});

const countryMatBack = new THREE.MeshBasicMaterial({
  color: bone.clone().multiplyScalar(1 - depth),
  side: THREE.BackSide,
  depthTest: true,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});

const gridMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.06
});

for (let lat = -75; lat <= 75; lat += 15) {
  const pts = [];

  for (let i = 0; i <= 128; i++) {
    pts.push(lonLatToXYZ((i / 128) * 360 - 180, lat));
  }

  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat.clone()));
}

for (let lon = -180; lon < 180; lon += 15) {
  const pts = [];

  for (let i = 0; i <= 128; i++) {
    pts.push(lonLatToXYZ(lon, 90 - (i / 128) * 180));
  }

  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat.clone()));
}

fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
  .then(r => r.json())
  .then(topo => {
    const land = topo.objects.countries;
    const arcs = topo.arcs;
    const scale = topo.transform?.scale || [1, 1];
    const translate = topo.transform?.translate || [0, 0];

    function decodeArc(arcIndex) {
      const reversed = arcIndex < 0;
      const idx = reversed ? ~arcIndex : arcIndex;
      const arc = arcs[idx];

      let x = 0;
      let y = 0;

      const pts = arc.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [
          x * scale[0] + translate[0],
          y * scale[1] + translate[1]
        ];
      });

      return reversed ? pts.reverse() : pts;
    }

    function ringFromArcs(arcIndices) {
      const ring = [];

      for (let i = 0; i < arcIndices.length; i++) {
        const pts = decodeArc(arcIndices[i]);
        if (!pts.length) continue;

        if (!ring.length) {
          ring.push(...pts);
        } else {
          const last = ring[ring.length - 1];
          const first = pts[0];

          if (last[0] === first[0] && last[1] === first[1]) {
            ring.push(...pts.slice(1));
          } else {
            ring.push(...pts);
          }
        }
      }

      return ring;
    }

    function addCountryGeometry(geo) {
      const geometry = buildCountryGeometry(geo.arcs.map(ring => ringFromArcs(ring)));
      if (!geometry) return;

      group.add(new THREE.Mesh(geometry.clone(), countryMatBack));
      group.add(new THREE.Mesh(geometry, countryMatFront));
    }

    land.geometries.forEach(geo => {
      if (geo.type === 'Polygon') {
        addCountryGeometry(geo);
      }

      if (geo.type === 'MultiPolygon') {
        geo.arcs.forEach(poly => {
          const geometry = buildCountryGeometry(poly.map(ring => ringFromArcs(ring)));
          if (!geometry) return;

          group.add(new THREE.Mesh(geometry.clone(), countryMatBack));
          group.add(new THREE.Mesh(geometry, countryMatFront));
        });
      }
    });
  });

let isDragging = false;
let prevMouse = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };

const autoSpeed = 0.0012;
const canvas = renderer.domElement;

canvas.addEventListener('mousedown', e => {
  isDragging = true;
  prevMouse = { x: e.clientX, y: e.clientY };
  velocity = { x: 0, y: 0 };
});

window.addEventListener('mousemove', e => {
  if (!isDragging) return;

  const dx = e.clientX - prevMouse.x;
  const dy = e.clientY - prevMouse.y;

  velocity.x = dx * 0.005;
  velocity.y = dy * 0.005;

  group.rotation.y += dx * 0.005;
  group.rotation.x = Math.max(
    -Math.PI / 2,
    Math.min(Math.PI / 2, group.rotation.x + dy * 0.005)
  );

  prevMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('touchstart', e => {
  isDragging = true;

  prevMouse = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };

  velocity = { x: 0, y: 0 };
}, { passive: true });

window.addEventListener('touchmove', e => {
  if (!isDragging) return;

  const dx = e.touches[0].clientX - prevMouse.x;
  const dy = e.touches[0].clientY - prevMouse.y;

  velocity.x = dx * 0.005;
  velocity.y = dy * 0.005;

  group.rotation.y += dx * 0.005;
  group.rotation.x = Math.max(
    -Math.PI / 2,
    Math.min(Math.PI / 2, group.rotation.x + dy * 0.005)
  );

  prevMouse = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };
}, { passive: true });

window.addEventListener('touchend', () => {
  isDragging = false;
});

let scrollBoost = 0;
let lastScrollTime = performance.now();

window.addEventListener('scroll', () => {
  const now = performance.now();
  const dt = Math.max(16, Math.min(now - lastScrollTime, 200));

  lastScrollTime = now;
  scrollBoost = Math.max(scrollBoost, 0.04 * (200 / dt));
});

window.addEventListener('resize', updateCameraByWidth);

initPageMotion();

function animate() {
  requestAnimationFrame(animate);

  if (!isDragging) {
    velocity.x *= 0.92;
    velocity.y *= 0.92;

    group.rotation.y += velocity.x + autoSpeed + scrollBoost * 0.001;

    group.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, group.rotation.x + velocity.y)
    );
  }

  scrollBoost *= 0.95;

  renderer.render(scene, camera);
}

animate();

function initPageMotion() {
  const revealTargets = [
    document.getElementById('random'),
    document.getElementById('designed'),
    document.querySelector('.content > p'),
    ...document.querySelectorAll('.pillar'),
    document.querySelector('.banner-text'),
    document.querySelector('.cool-banner-af img')
  ].filter(Boolean);

  revealTargets.forEach((el, index) => {
    el.classList.add('reveal');
    el.style.setProperty('--reveal-delay', `${Math.min(index * 70, 420)}ms`);
  });

  document.querySelectorAll('.info').forEach(section => {
    section.querySelectorAll('.pillar').forEach((pillar, index) => {
      pillar.style.setProperty('--reveal-delay', `${index * 95}ms`);
    });
  });

  if (prefersReducedMotion) {
    revealTargets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.18,
    rootMargin: '0px 0px -8% 0px'
  });

  revealTargets.forEach(el => observer.observe(el));

  const root = document.documentElement;
  const banner = document.querySelector('.cool-banner-af');

  let latestScroll = window.scrollY;
  let tickingParallax = false;

  function updateParallax() {
    tickingParallax = false;

    const heroOffset = Math.min(latestScroll, window.innerHeight * 1.15);
    root.style.setProperty('--parallax-hero', `${heroOffset * -0.22}px`);
    root.style.setProperty('--globe-y', `${heroOffset * 0.12}px`);
    root.style.setProperty('--parallax-soft', `${latestScroll * 0.16}px`);
    root.style.setProperty('--scroll-fade', `${Math.max(0.25, 1 - latestScroll / 900)}`);

    if (banner) {
      const rect = banner.getBoundingClientRect();
      const centerOffset = rect.top + rect.height * 0.5 - window.innerHeight * 0.5;
      const shift = Math.max(-36, Math.min(36, centerOffset * -0.08));
      root.style.setProperty('--banner-shift', `${shift}px`);
    }
  }

  function requestParallax() {
    latestScroll = window.scrollY;
    if (tickingParallax) return;
    tickingParallax = true;
    requestAnimationFrame(updateParallax);
  }

  requestParallax();
  window.addEventListener('scroll', requestParallax, { passive: true });
  window.addEventListener('resize', requestParallax);
}

(function(){
const wrap = document.getElementById('pw');
const canvas = document.getElementById('ac');
if (!wrap || !canvas) return;
const ctx = canvas.getContext('2d');

// Codex uses a dense grid — smaller cells for richer texture
const CW = 9, LH = 14, FONT = 11;

// The full Codex palette: very muted, white-grey only
// Characters weighted by visual density
const CHARS_SPARSE = ['.', ' ', ' ', '.', ' ', ',', ' ', '.'];
const CHARS_MID    = ['.', ',', '-', '.', ',', '·', '-', '.'];
const CHARS_DENSE  = ['+', '*', '-', '+', '.', '*', '+', '-'];

let W, H, COLS, ROWS;
// Per-cell random phase for organic noise
let phase, baseAlpha;

let mx = -1, my = -1;
let smx = -1, smy = -1;
let time = 0;

// Ripples
const ripples = [];

function resize() {
  const r = wrap.getBoundingClientRect();
  W = r.width; H = r.height;
  canvas.width = W; canvas.height = H;
  COLS = Math.floor(W / CW);
  ROWS = Math.floor(H / LH);
  phase = new Float32Array(COLS * ROWS);
  baseAlpha = new Float32Array(COLS * ROWS);
  for (let i = 0; i < phase.length; i++) {
    phase[i] = Math.random() * Math.PI * 2;
    baseAlpha[i] = 0.028 + Math.random() * 0.045;
  }
}

wrap.addEventListener('mousemove', e => {
  const r = wrap.getBoundingClientRect();
  mx = e.clientX - r.left;
  my = e.clientY - r.top;
});
wrap.addEventListener('mouseleave', () => { mx = -1; my = -1; });

wrap.addEventListener('click', e => {
  const r = wrap.getBoundingClientRect();
  ripples.push({
    x: e.clientX - r.left,
    y: e.clientY - r.top,
    t: 0
  });
});

// Gaussian: peak 1 at d=0, approaches 0
function gauss(d, sigma) {
  return Math.exp(-(d*d)/(2*sigma*sigma));
}

// Smooth noise via sin combination (cheap Perlin-like)
function noise(x, y, t) {
  return (
    Math.sin(x * 0.11 + t * 0.7) *
    Math.cos(y * 0.13 - t * 0.5) *
    0.5 + 0.5
  );
}

function draw() {
  time += 0.012;
  ctx.clearRect(0, 0, W, H);
  ctx.font = `${FONT}px 'Courier New',monospace`;
  ctx.textBaseline = 'top';

  // Smooth mouse
  const lerpF = 0.08;
  if (mx < 0) {
    smx += (-9999 - smx) * lerpF;
    smy += (-9999 - smy) * lerpF;
  } else {
    smx += (mx - smx) * lerpF;
    smy += (my - smy) * lerpF;
  }

  // Age ripples (slow, graceful)
  for (const rp of ripples) rp.t += 0.016;
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (ripples[i].t > 1) ripples.splice(i, 1);
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = col * CW + CW * 0.5;
      const cy = row * LH + LH * 0.5;
      const idx = row * COLS + col;
      const ph = phase[idx];
      const ba = baseAlpha[idx];

      // --- Base ambient field ---
      // The whole canvas has a low-level living noise
      const n = noise(col, row, time);
      const ambient = ba * (0.4 + 0.6 * n);

      // --- Mouse gaussian field ---
      let mouseStr = 0;
      if (smx > 0) {
        const dx = cx - smx, dy = cy - smy;
        const d = Math.sqrt(dx*dx + dy*dy);
        // Sigma ~180: very wide, soft center
        mouseStr = gauss(d, 180) * (0.85 + 0.15 * Math.sin(time * 1.2 + ph));
      }

      // --- Ripple field ---
      // Procedural interference pattern: no sparks, just wave math
      let rippleStr = 0;
      for (const rp of ripples) {
        const dx = cx - rp.x, dy = cy - rp.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        const progress = rp.t;
        const life = 1 - progress;

        // Expanding wavefront envelope
        const front = progress * 360;
        const ringW = 50 + progress * 120;
        const ringEnv = gauss(d - front, ringW);

        // Radial gaussian: center always stronger than edges
        const centerBias = gauss(d, 90 + progress * 150);

        // Two-frequency interference for fabric texture
        const wave1 = Math.sin(d * 0.038 - progress * 11.0);
        const wave2 = Math.sin(d * 0.018 - progress * 6.5 + Math.PI * 0.3);
        const interference = (wave1 * 0.6 + wave2 * 0.4) * 0.5 + 0.5;

        // Angular modulation (fabric wrinkles)
        const angle = Math.atan2(dy, dx);
        const angular = Math.sin(angle * 8 + progress * 3) * 0.12 + 0.88;

        const contrib = ringEnv * interference * angular
                      * life * (0.3 + 0.7 * centerBias);

        rippleStr = Math.max(rippleStr, contrib);
      }

      // --- Merge ---
      const totalStr = Math.min(1, ambient + mouseStr * 0.9 + rippleStr * 0.7);
      if (totalStr < 0.015) continue;

      // Character selection by density
      const n2 = noise(col * 1.3, row * 0.9, time * 0.7);
      const density = totalStr * (0.7 + 0.3 * n2);

      let c;
      if (density < 0.18) {
        c = CHARS_SPARSE[Math.floor(n2 * CHARS_SPARSE.length)];
      } else if (density < 0.52) {
        c = CHARS_MID[Math.floor(n2 * CHARS_MID.length)];
      } else {
        c = CHARS_DENSE[Math.floor(n2 * CHARS_DENSE.length)];
      }
      if (c === ' ') continue;

      // Color: Codex uses pure white/grey — no hue shift
      // Alpha drives everything
      const pulse = 0.88 + 0.12 * Math.sin(time * 1.8 + ph * 1.5);
      let alpha = totalStr * pulse;

      // Ripple makes chars brighter at peak
      if (rippleStr > 0.05) {
        alpha = Math.min(0.92, alpha + rippleStr * 0.5);
      }
      alpha = Math.min(0.88, alpha);

      // Mouse center gets near-full brightness, edges fall off naturally
      const brightness = Math.round(200 + mouseStr * 55 + rippleStr * 40);
      ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},${alpha.toFixed(3)})`;
      ctx.fillText(c, col * CW, row * LH);
    }
  }

  requestAnimationFrame(draw);
}

resize();
window.addEventListener('resize', resize);
draw();
})();
