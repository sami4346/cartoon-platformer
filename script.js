/*
  Cartoon Platformer - Vanilla JS
  Features:
  - Canvas rendering with parallax background
  - Player movement (left/right/jump) with gravity and smooth jumping
  - AABB collisions against platforms of varying sizes
  - 5+ platforms, goal star to win, coins to collect (score)
  - Camera scrolling following player
  - Game states: start, playing, gameover, win
  - Game Over if player falls off-screen, restart button
  - Simple SFX via Web Audio API (jump, coin, win)
  - Mobile on-screen controls
  - requestAnimationFrame loop
*/

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');

  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const winScreen = document.getElementById('winScreen');
  const btnPlay = document.getElementById('btnPlay');
  const btnRestart = document.getElementById('btnRestart');
  const btnPlayAgain = document.getElementById('btnPlayAgain');

  const controls = {
    left: document.getElementById('btnLeft'),
    right: document.getElementById('btnRight'),
    jump: document.getElementById('btnJump'),
  };

  // DPR scaling for crisp rendering on HiDPI screens
  function fitCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // Audio (Web Audio API) - simple synthesized SFX
  const Audio = (() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    function ensure() {
      if (!ctx) ctx = new AudioCtx();
      // Unlock on iOS by resuming if suspended
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    function beep({ freq = 440, type = 'sine', duration = 0.1, volume = 0.2, attack = 0.005, release = 0.05 }) {
      const ac = ensure();
      const t0 = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + attack);
      gain.gain.linearRampToValueAtTime(0, t0 + attack + duration + release);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + attack + duration + release + 0.02);
    }

    function jump() {
      beep({ freq: 320, type: 'square', duration: 0.08, volume: 0.25 });
    }
    function coin() {
      beep({ freq: 880, type: 'triangle', duration: 0.12, volume: 0.22 });
      beep({ freq: 1320, type: 'triangle', duration: 0.08, volume: 0.18 });
    }
    function win() {
      beep({ freq: 523.25, type: 'sine', duration: 0.18, volume: 0.25 });
      setTimeout(() => beep({ freq: 659.25, type: 'sine', duration: 0.18, volume: 0.25 }), 180);
      setTimeout(() => beep({ freq: 783.99, type: 'sine', duration: 0.2, volume: 0.28 }), 360);
    }

    // public
    return { ensure, jump, coin, win };
  })();

  // Input handling
  const keys = { left: false, right: false, up: false }; // up=jump
  const downKeys = new Set();
  const KEY_MAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up',
  };
  window.addEventListener('keydown', (e) => {
    const k = KEY_MAP[e.key];
    if (!k) return;
    downKeys.add(k);
    keys[k] = true;
    // prevent page scrolling on arrow/space
    if (['ArrowUp','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEY_MAP[e.key];
    if (!k) return;
    downKeys.delete(k);
    keys[k] = false;
  });

  // Mobile controls (touch)
  function attachHold(btn, flag) {
    let id = null;
    const set = (v) => { keys[flag] = v; if (v) downKeys.add(flag); else downKeys.delete(flag); };
    const onDown = (e) => { e.preventDefault(); id = (e.changedTouches?.[0]?.identifier ?? 'mouse'); set(true); };
    const onUp = (e) => { e.preventDefault(); set(false); id = null; };
    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointerleave', onUp);
    btn.addEventListener('pointercancel', onUp);
  }
  attachHold(controls.left, 'left');
  attachHold(controls.right, 'right');
  attachHold(controls.jump, 'up');

  // World and entities
  const GRAVITY = 2000; // px/s^2
  const MOVE_SPEED = 360; // px/s
  const JUMP_VELOCITY = 820; // px/s
  const AIR_DRAG = 0.0008;

  const world = {
    width: 4000,
    height: 2000, // virtual world height
    cameraX: 0,
    cameraY: 0,
    skyTime: 0,
  };

  const player = {
    x: 120, y: 0, w: 36, h: 40,
    vx: 0, vy: 0,
    onGround: false,
    dir: 1, // 1 right, -1 left
    blink: 0,
  };

  function makePlatforms() {
    const p = [];
    // Ground
    p.push({ x: -200, y: 520, w: 1200, h: 40 });

    // Floating platforms
    p.push({ x: 700, y: 450, w: 200, h: 24 });
    p.push({ x: 1000, y: 380, w: 180, h: 24 });
    p.push({ x: 1250, y: 330, w: 160, h: 24 });
    p.push({ x: 1500, y: 460, w: 240, h: 24 });
    p.push({ x: 1800, y: 400, w: 180, h: 24 });
    p.push({ x: 2050, y: 340, w: 160, h: 24 });
    p.push({ x: 2400, y: 420, w: 260, h: 24 });

    // Taller ledge
    p.push({ x: 2750, y: 360, w: 180, h: 24 });
    p.push({ x: 3050, y: 320, w: 200, h: 24 });

    // Final approach
    p.push({ x: 3400, y: 300, w: 220, h: 24 });

    return p;
  }

  const platforms = makePlatforms();

  const coins = [
    { x: 750, y: 410, r: 12, taken: false, spin: 0 },
    { x: 1030, y: 340, r: 12, taken: false, spin: 0 },
    { x: 1550, y: 420, r: 12, taken: false, spin: 0 },
    { x: 2060, y: 300, r: 12, taken: false, spin: 0 },
    { x: 2420, y: 380, r: 12, taken: false, spin: 0 },
    { x: 3070, y: 280, r: 12, taken: false, spin: 0 },
  ];

  const goal = { x: 3450, y: 260, w: 36, h: 36, t: 0 };

  let score = 0;
  let state = 'start'; // 'start' | 'playing' | 'gameover' | 'win'

  function resetGame() {
    player.x = 120; player.y = 0; player.vx = 0; player.vy = 0; player.onGround = false; player.dir = 1;
    world.cameraX = 0; world.skyTime = 0;
    score = 0;
    coins.forEach(c => { c.taken = false; c.spin = 0; });
    goal.t = 0;
    updateHUD();
  }

  // HUD
  function updateHUD() {
    scoreEl.textContent = `Score: ${score}`;
    levelEl.textContent = `Level: 1`;
  }

  // UI helpers
  function show(el, v) { el.classList.toggle('visible', !!v); }

  // Buttons
  btnPlay.addEventListener('click', () => { Audio.ensure(); startPlaying(); });
  btnRestart.addEventListener('click', () => { Audio.ensure(); startPlaying(); });
  btnPlayAgain.addEventListener('click', () => { Audio.ensure(); startPlaying(); });

  function startPlaying() {
    resetGame();
    state = 'playing';
    show(startScreen, false);
    show(gameOverScreen, false);
    show(winScreen, false);
  }

  // Basic geometry helpers
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Physics and collisions
  function step(dt) {
    // Apply inputs
    const leftHeld = keys.left;
    const rightHeld = keys.right;
    const jumpPressed = keys.up && !player._wasJump;

    player._wasJump = keys.up;

    // Horizontal
    if (leftHeld && !rightHeld) { player.vx = -MOVE_SPEED; player.dir = -1; }
    else if (rightHeld && !leftHeld) { player.vx = MOVE_SPEED; player.dir = 1; }
    else { player.vx *= (1 - Math.min(1, AIR_DRAG * dt * 1000)); if (Math.abs(player.vx) < 2) player.vx = 0; }

    // Jump
    if (jumpPressed && player.onGround) {
      player.vy = -JUMP_VELOCITY;
      player.onGround = false;
      Audio.jump();
    }

    // Gravity
    player.vy += GRAVITY * dt;

    // Integrate and collide: X axis
    let nx = player.x + player.vx * dt;
    let ny = player.y; // Y unchanged for now

    // Horizontal collisions
    for (const s of platforms) {
      if (!aabb(nx, ny, player.w, player.h, s.x, s.y, s.w, s.h)) continue;
      if (player.vx > 0) nx = s.x - player.w; // from left
      else if (player.vx < 0) nx = s.x + s.w; // from right
      player.vx = 0;
    }

    // Integrate and collide: Y axis
    ny = player.y + player.vy * dt;
    let grounded = false;
    for (const s of platforms) {
      if (!aabb(nx, ny, player.w, player.h, s.x, s.y, s.w, s.h)) continue;
      if (player.vy > 0) { // falling, land on top
        ny = s.y - player.h;
        player.vy = 0;
        grounded = true;
      } else if (player.vy < 0) { // hitting head
        ny = s.y + s.h;
        player.vy = 0;
      }
    }

    player.x = nx; player.y = ny; player.onGround = grounded;

    // Bounds world horizontally
    if (player.x < -300) player.x = -300;
    if (player.x + player.w > world.width + 300) player.x = world.width + 300 - player.w;

    // Camera follows player smoothly
    const targetCamX = Math.max(0, Math.min(world.width - canvas.width, player.x + player.w/2 - canvas.width/2));
    world.cameraX += (targetCamX - world.cameraX) * Math.min(1, dt * 6);

    world.skyTime += dt;

    // Coin collection
    for (const c of coins) {
      if (c.taken) continue;
      const px = player.x + player.w/2; const py = player.y + player.h/2;
      const dx = (c.x + c.r) - px; const dy = (c.y + c.r) - py; // center-ish
      if (Math.hypot(dx, dy) < c.r + Math.min(player.w, player.h)*0.5) {
        c.taken = true; score += 10; updateHUD(); Audio.coin();
      }
      c.spin += dt * 6;
    }

    // Win condition
    if (aabb(player.x, player.y, player.w, player.h, goal.x, goal.y, goal.w, goal.h)) {
      state = 'win';
      show(winScreen, true);
      Audio.win();
    }

    // Game over if fall off-screen
    const camY = 0; // single-layer world; we keep y fixed for simplicity
    if (player.y - camY > canvas.height + 200) {
      state = 'gameover';
      show(gameOverScreen, true);
    }
  }

  // Rendering
  function drawBackground() {
    const w = canvas.width; const h = canvas.height;
    // Sky gradient backdrop is CSS, but add some drifting clouds and hills for parallax
    const cam = world.cameraX;

    // Hills (far) - parallax factor 0.2
    ctx.save();
    ctx.translate(-cam * 0.2, 0);
    drawHill(0, 520, 800, '#a8e6a3');
    drawHill(700, 540, 900, '#9ddf97');
    drawHill(1600, 530, 700, '#b6efb1');
    drawHill(2300, 545, 820, '#a7e5a2');
    drawHill(3000, 535, 880, '#9fe09a');
    ctx.restore();

    // Clouds (nearer) - parallax factor 0.35
    ctx.save();
    ctx.translate(-cam * 0.35, 0);
    const yBase = 120 + Math.sin(world.skyTime * 0.5) * 8;
    for (let i = 0; i < 8; i++) {
      drawCloud(200 + i * 500, yBase + (i % 2) * 30, 60 + (i % 3) * 18);
    }
    ctx.restore();
  }

  function drawHill(x, y, width, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 100, y + 200);
    ctx.quadraticCurveTo(x + width/2, y - 120, x + width + 100, y + 200);
    ctx.lineTo(x + width + 100, canvas.height + 200);
    ctx.lineTo(x - 100, canvas.height + 200);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawCloud(cx, cy, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r*0.9, cy + r*0.2, r*0.8, 0, Math.PI * 2);
    ctx.arc(cx - r*0.8, cy + r*0.25, r*0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawPlatforms() {
    ctx.fillStyle = '#6dd4ff';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    for (const s of platforms) {
      const x = Math.round(s.x - world.cameraX);
      const y = Math.round(s.y);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 4;
      ctx.fillRect(x, y, s.w, s.h);
      ctx.strokeRect(x, y, s.w, s.h);
      // Grass top
      ctx.fillStyle = '#7de37f';
      ctx.fillRect(x, y - 6, s.w, 10);
      ctx.strokeStyle = '#1a1a1a';
      ctx.strokeRect(x, y - 6, s.w, 10);
      ctx.restore();
      ctx.fillStyle = '#6dd4ff';
      ctx.strokeStyle = '#1a1a1a';
    }
  }

  function drawCoins() {
    for (const c of coins) {
      if (c.taken) continue;
      const x = c.x - world.cameraX;
      const y = c.y;
      const phase = Math.sin(c.spin) * 0.3 + 0.7; // spin squash
      ctx.save();
      ctx.translate(x + c.r, y + c.r + Math.sin(c.spin*2)*2);
      ctx.scale(phase, 1);
      ctx.beginPath();
      ctx.fillStyle = '#ffd54d';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 3;
      ctx.arc(0, 0, c.r, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      // inner shine
      ctx.beginPath();
      ctx.fillStyle = '#fff3b0';
      ctx.arc(-c.r*0.3, -c.r*0.2, c.r*0.35, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawGoal() {
    const x = goal.x - world.cameraX + goal.w/2;
    const y = goal.y + goal.h/2;
    goal.t += 0.08;
    const scale = 1 + Math.sin(goal.t) * 0.06;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawStar(0, 0, 5, 22, 10, '#ffd34d');
    ctx.restore();
  }

  function drawStar(x, y, spikes, outerRadius, innerRadius, color) {
    let rot = Math.PI / 2 * 3;
    let cx = x, cy = y;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      let x1 = cx + Math.cos(rot) * outerRadius;
      let y1 = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x1, y1);
      rot += step;
      let x2 = cx + Math.cos(rot) * innerRadius;
      let y2 = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x2, y2);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
  }

  function drawPlayer() {
    const x = Math.round(player.x - world.cameraX);
    const y = Math.round(player.y);
    const squash = Math.max(0.9, Math.min(1.1, 1 - player.vy * 0.0005));
    const stretch = 2 - squash;
    ctx.save();
    ctx.translate(x + player.w/2, y + player.h/2);
    ctx.scale(1, squash);
    // Body (rounded square)
    ctx.fillStyle = '#ff6db0';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    roundRect(-player.w/2, -player.h/2, player.w, player.h, 10, true, true);
    // Eyes
    ctx.fillStyle = '#fff';
    const eyeOffsetX = player.dir * 5;
    ctx.beginPath();
    ctx.arc(-6 + eyeOffsetX, -8, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath();
    ctx.arc(10 + eyeOffsetX, -8, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(-6 + eyeOffsetX, -8, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10 + eyeOffsetX, -8, 2, 0, Math.PI*2); ctx.fill();
    // Feet shadow
    ctx.restore();
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function render() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawPlatforms();
    drawCoins();
    drawGoal();
    drawPlayer();
  }

  // Main loop
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(1/30, (t - last) / 1000);
    last = t;

    if (state === 'playing') {
      step(dt);
    }
    render();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Initial UI state
  show(startScreen, true);

  // Utility: prevent context menu on long-press (mobile)
  window.addEventListener('contextmenu', (e) => e.preventDefault());
})();
