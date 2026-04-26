(function initSignalCursor() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const core = document.createElement('div');
  const ring = document.createElement('div');

  core.className = 'cursor-core';
  ring.className = 'cursor-ring';

  document.body.append(ring, core);

  const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const ringPos = { ...pos };
  let visible = false;
  let lastTrail = 0;

  function moveElement(el, x, y) {
    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  }

  function show() {
    if (visible) return;
    visible = true;
    core.style.opacity = '1';
    ring.style.opacity = '1';
  }

  function hide() {
    visible = false;
    core.style.opacity = '0';
    ring.style.opacity = '0';
  }

  function leaveTrail(x, y) {
    const now = performance.now();
    if (now - lastTrail < 28) return;

    lastTrail = now;

    const dot = document.createElement('span');
    dot.className = 'cursor-trail';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }

  window.addEventListener('mousemove', e => {
    pos.x = e.clientX;
    pos.y = e.clientY;

    show();
    moveElement(core, pos.x, pos.y);
    leaveTrail(pos.x, pos.y);
  });

  window.addEventListener('mousedown', () => ring.classList.add('is-armed'));
  window.addEventListener('mouseup', () => ring.classList.remove('is-armed'));
  window.addEventListener('mouseleave', hide);
  window.addEventListener('mouseenter', show);

  function tick() {
    ringPos.x += (pos.x - ringPos.x) * 0.18;
    ringPos.y += (pos.y - ringPos.y) * 0.18;
    moveElement(ring, ringPos.x, ringPos.y);
    requestAnimationFrame(tick);
  }

  tick();
})();
