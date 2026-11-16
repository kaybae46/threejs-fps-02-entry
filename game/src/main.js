// IRONLINE — a round-based tactical FPS. Single-player vs bots, three.js 0.187.0.
// Original map, art, sounds and names. No network requests, no build step.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
const MAP = { w: 64, d: 44, wallH: 4.2 };          // arena size in metres
const ROUND_TIME = 100;                            // seconds per round
const BUY_TIME = 20;                               // seconds of buy phase
const WIN_ROUNDS = 5;
const EYE = 1.62;
const GRAV = 22;

const WEAPONS = {
  p9:    { name: 'P9 SIDEARM',  price: 0,    dmg: 30, headMul: 2.0, mag: 12, rpm: 320, spread: 0.011, auto: false, zoom: 1.0, range: 55, reload: 1.1, kick: 0.012 },
  vk9:   { name: 'VK-9 SMG',    price: 1500, dmg: 24, headMul: 1.8, mag: 30, rpm: 780, spread: 0.030, auto: true,  zoom: 1.0, range: 42, reload: 1.6, kick: 0.016 },
  ar77:  { name: 'AR-77 RIFLE', price: 2700, dmg: 33, headMul: 2.0, mag: 30, rpm: 600, spread: 0.013, auto: true,  zoom: 1.0, range: 70, reload: 1.9, kick: 0.020 },
  lance: { name: 'LANCE DMR',   price: 4100, dmg: 86, headMul: 2.2, mag: 5,  rpm: 55,  spread: 0.002, auto: false, zoom: 2.6, range: 110, reload: 2.4, kick: 0.055 },
};
const WEAPON_ORDER = ['p9', 'vk9', 'ar77', 'lance'];
const TEAM = {
  azure: { label: 'AZURE', color: 0x3f8cff, css: '#6db3ff', spawn: new THREE.Vector3(0, 0, 18), dir: 0 },
  ember: { label: 'EMBER', color: 0xff5340, css: '#ff7a6b', spawn: new THREE.Vector3(0, 0, -18), dir: Math.PI },
};
const BOT_NAMES = {
  azure: ['FALK', 'MIRA', 'DOSS'],
  ember: ['ROOK', 'VEX', 'HALE', 'NYX'],
};

// ---------------------------------------------------------------- tiny utils
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (id) => document.getElementById(id);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- audio (all synthesized, no files)
let audioCtx = null;
function audio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function noiseBurst(dur, freq, gain, type = 'lowpass') {
  const ctx = audio(); if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
}
function tone(freq, dur, gain, slideTo) {
  const ctx = audio(); if (!ctx) return;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
}
const sfx = {
  shot: (w) => noiseBurst(0.09, w === 'lance' ? 900 : 2400, 0.5),
  enemyShot: (dist) => noiseBurst(0.08, 1400, clamp(0.35 - dist * 0.006, 0.05, 0.35)),
  dry: () => tone(1400, 0.05, 0.12),
  reload: () => { tone(500, 0.06, 0.15); setTimeout(() => tone(700, 0.06, 0.15), 180); },
  hit: () => tone(2100, 0.05, 0.18),
  kill: () => { tone(880, 0.08, 0.2); setTimeout(() => tone(1320, 0.12, 0.2), 80); },
  hurt: () => { tone(180, 0.15, 0.25, 90); noiseBurst(0.08, 500, 0.2); },
  buy: () => { tone(660, 0.06, 0.18); setTimeout(() => tone(990, 0.09, 0.18), 70); },
  roundWin: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.2), i * 110)); },
  roundLose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.18), i * 140)); },
  beacon: () => tone(1200, 0.1, 0.15, 1800),
  click: () => tone(900, 0.04, 0.12),
};

// ---------------------------------------------------------------- renderer / scene
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa8c4);
scene.fog = new THREE.Fog(0x8fa8c4, 55, 130);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x55504a, 1.6));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(30, 55, 18);
scene.add(sun);

// Procedural ground texture (painted concrete with yard markings), made at runtime.
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5d5a55'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${rand(0.02, 0.07)})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, rand(1, 4), rand(1, 4));
  }
  g.strokeStyle = 'rgba(255,190,60,0.55)'; g.lineWidth = 5;
  g.strokeRect(14, 14, 484, 484);
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 3;
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 64 + 32); g.lineTo(512, i * 64 + 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP.w + 30, MAP.d + 30),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.02 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------------------------------------------------------------- map: walls, crates, sites, beacon
const colliders = [];   // {minX,maxX,minZ,maxZ}
const solids = [];      // meshes bullets can hit
const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.9 }),
  wallDark: new THREE.MeshStandardMaterial({ color: 0x6e675e, roughness: 0.9 }),
  crate: new THREE.MeshStandardMaterial({ color: 0xa8763e, roughness: 0.85 }),
  crateBlue: new THREE.MeshStandardMaterial({ color: 0x3e6ea8, roughness: 0.85 }),
  crateGreen: new THREE.MeshStandardMaterial({ color: 0x5d7a4a, roughness: 0.85 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6f7a80, roughness: 0.45, metalness: 0.7 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0x9c3d2e, roughness: 0.6, metalness: 0.35 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xd8a928, roughness: 0.8 }),
};
function box(x, z, w, h, d, mat, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, h / 2, z);
  scene.add(m); solids.push(m);
  if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return m;
}
function cyl(x, z, r, h, mat, collide = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), mat);
  m.position.set(x, h / 2, z);
  scene.add(m); solids.push(m);
  if (collide) colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  return m;
}
// Perimeter walls (with two gaps as side lanes)
box(0, -MAP.d / 2, MAP.w, MAP.wallH, 1, MAT.wall);
box(0, MAP.d / 2, MAP.w, MAP.wallH, 1, MAT.wall);
box(-MAP.w / 2, 0, 1, MAP.wallH, MAP.d, MAT.wall);
box(MAP.w / 2, 0, 1, MAP.wallH, MAP.d, MAT.wall);
// Mid wall with a central doorway and side gaps — the map's spine
box(-20, 0, 24, MAP.wallH, 1.2, MAT.wallDark);
box(20, 0, 24, MAP.wallH, 1.2, MAT.wallDark);
// Site A (north-west) structures
box(-22, -14, 8, 2.6, 1.2, MAT.crate);
box(-26, -10, 1.2, 2.2, 6, MAT.crateBlue);
box(-16, -17, 5, 1.4, 5, MAT.crateGreen);
cyl(-24, -18, 1.1, 2.4, MAT.barrel);
cyl(-20, -18.5, 1.1, 2.4, MAT.barrel);
// Site B (south-east) structures
box(22, 14, 8, 2.6, 1.2, MAT.crateBlue);
box(26, 10, 1.2, 2.2, 6, MAT.crate);
box(16, 17, 5, 1.4, 5, MAT.crateGreen);
cyl(24, 18, 1.1, 2.4, MAT.barrel);
cyl(20, 18.5, 1.1, 2.4, MAT.barrel);
// Mid crates and cover dotted around the lanes
box(-8, -6, 3, 1.5, 3, MAT.crate);
box(8, 6, 3, 1.5, 3, MAT.crateBlue);
box(-10, 8, 4, 1.2, 2, MAT.crateGreen);
box(10, -8, 4, 1.2, 2, MAT.crate);
box(-2, -12, 2.4, 1.1, 2.4, MAT.hazard);
box(3, 12, 2.4, 1.1, 2.4, MAT.hazard);
cyl(-14, 2, 1, 2.2, MAT.barrel);
cyl(14, -2, 1, 2.2, MAT.barrel);
// Spawn cover
box(-6, 16, 6, 1.6, 1.2, MAT.wallDark);
box(6, -16, 6, 1.6, 1.2, MAT.wallDark);
// Tall silos outside the playable edge for skyline flavour (no collision needed, but keep them solid visually)
cyl(-26, 24, 3, 9, MAT.metal, false);
cyl(28, -24, 3, 11, MAT.metal, false);

// Site markers: floating letters + ground pads
function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b0e12'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(4, 4, 1);
  return s;
}
const labelA = makeLabel('A', '#ffb340'); labelA.position.set(-22, 6.5, -14); scene.add(labelA);
const labelB = makeLabel('B', '#ffb340'); labelB.position.set(22, 6.5, 14); scene.add(labelB);
const padMat = new THREE.MeshStandardMaterial({ color: 0xd8a928, roughness: 0.7, emissive: 0x664400, emissiveIntensity: 0.5 });
const padA = new THREE.Mesh(new THREE.CircleGeometry(3.2, 28), padMat.clone());
padA.rotation.x = -Math.PI / 2; padA.position.set(-22, 0.02, -14); scene.add(padA);
const padB = padA.clone(); padB.position.set(22, 0.02, 14); scene.add(padB);

// Uplink beacon at mid — the objective both teams fight over
const beacon = new THREE.Group();
const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.5, 24),
  new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.4, metalness: 0.6 }));
beaconBase.position.y = 0.25; beacon.add(beaconBase);
const beaconPole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.4, 10),
  new THREE.MeshStandardMaterial({ color: 0x9fb0c0, metalness: 0.8, roughness: 0.3 }));
beaconPole.position.y = 2.4; beacon.add(beaconPole);
const beaconLight = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xff9a00, emissiveIntensity: 2.2 }));
beaconLight.position.y = 4.8; beacon.add(beaconLight);
const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.09, 10, 40),
  new THREE.MeshBasicMaterial({ color: 0xffb340 }));
beaconRing.rotation.x = -Math.PI / 2; beaconRing.position.y = 0.08; beacon.add(beaconRing);
scene.add(beacon);
const beaconGlow = new THREE.PointLight(0xff9a00, 12, 16); beaconGlow.position.set(0, 5, 0); scene.add(beaconGlow);

// Viewmodel gun (first-person weapon) attached to the camera
const viewGun = new THREE.Group();
const gunMat = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.4, metalness: 0.6 });
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), gunMat);
viewGun.add(gunBody);
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10), gunMat);
gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.set(0, 0.02, -0.42); viewGun.add(gunBarrel);
const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), gunMat);
gunGrip.position.set(0, -0.14, 0.16); gunGrip.rotation.x = 0.35; viewGun.add(gunGrip);
const gunSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06),
  new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xcc7700, emissiveIntensity: 0.8 }));
gunSight.position.set(0, 0.09, -0.1); viewGun.add(gunSight);
viewGun.position.set(0.21, -0.19, -0.42);
viewGun.scale.setScalar(0.62);
camera.add(viewGun);
scene.add(camera);
const muzzle = new THREE.PointLight(0xffc266, 0, 9);
muzzle.position.set(0.21, -0.14, -0.85); camera.add(muzzle);

// Tracer pool
const tracers = [];
function spawnTracer(from, to, color = 0xffd27a) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  scene.add(line);
  tracers.push({ line, life: 0.09 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt;
    if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
    else t.line.material.opacity = t.life / 0.09;
  }
}

// ---------------------------------------------------------------- collision
function collideCircle(pos, r) {
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX);
    const nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r;
      } else {
        pos.x = c.maxX + r; // inside: push out on +x
      }
    }
  }
  pos.x = clamp(pos.x, -MAP.w / 2 + 1, MAP.w / 2 - 1);
  pos.z = clamp(pos.z, -MAP.d / 2 + 1, MAP.d / 2 - 1);
}
const raycaster = new THREE.Raycaster();
function hasLOS(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const dist = dir.length(); if (dist < 0.01) return true;
  dir.normalize();
  raycaster.set(a, dir); raycaster.far = dist;
  return raycaster.intersectObjects(solids, false).length === 0;
}

// ---------------------------------------------------------------- game state
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // '1' | '2' | '3' — screenshot demo mode
const G = {
  phase: 'menu',           // menu | buy | fight | roundEnd | matchEnd
  round: 1,
  score: { azure: 0, ember: 0 },
  timeLeft: ROUND_TIME,
  buyLeft: BUY_TIME,
  money: 800,
  armor: 0,
  owned: { p9: true },
  weapon: 'p9',
  ammo: { p9: 12 },
  kills: 0, deaths: 0, shots: 0, hits: 0,
  beacon: { azure: 0, ember: 0 },  // capture progress 0..1
  beaconHolder: null,
  roundKills: [],
};
const player = {
  pos: new THREE.Vector3(0, 0, 18),
  vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0,
  hp: 100, alive: true,
  onGround: true, vy: 0,
  spreadBloom: 0, lastShot: 0, reloading: false,
  scoped: false,
};
const bots = [];   // {name, team, mesh, head, body, hp, alive, pos, yaw, target, repath, burst, cooldown, ...}
const keys = {};
let pointerLocked = false;
let demoCam = null; // preset camera for screenshot mode

// ---------------------------------------------------------------- bots
function makeBotMesh(team) {
  const g = new THREE.Group();
  const col = TEAM[team].color;
  const bodyMat = new THREE.MeshStandardMaterial({ color: team === 'azure' ? 0x2c4d75 : 0x75302c, roughness: 0.8 });
  const accent = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), bodyMat);
  body.position.y = 0.95; g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.4), accent);
  vest.position.y = 1.05; g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.7 }));
  head.position.y = 1.62; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), accent);
  visor.position.set(0, 1.64, 0.22); g.add(visor);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.24), bodyMat);
  legL.position.set(-0.16, 0.25, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.3, 1.15, 0.3); g.add(gun);
  // name tag
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = team === 'azure' ? '#6db3ff' : '#ff7a6b';
  ctx.fillText('', 128, 32);
  const tagTex = new THREE.CanvasTexture(c);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false }));
  tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.15; g.add(tag);
  g.userData.tagCanvas = c; g.userData.tagTex = tagTex;
  return { group: g, head, body, tag };
}
function setBotName(bot) {
  const c = bot.mesh.group.userData.tagCanvas;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = bot.team === 'azure' ? '#6db3ff' : '#ff7a6b';
  ctx.fillText(bot.name, 128, 32);
  bot.mesh.group.userData.tagTex.needsUpdate = true;
}
function spawnBots() {
  for (const b of bots) { scene.remove(b.mesh.group); }
  bots.length = 0;
  for (const team of ['azure', 'ember']) {
    for (const name of BOT_NAMES[team]) {
      const mesh = makeBotMesh(team);
      const bot = {
        name, team, mesh,
        hp: 100, alive: true,
        pos: TEAM[team].spawn.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-2, 2))),
        yaw: TEAM[team].dir,
        target: null, repath: 0, burstLeft: 0, fireTimer: rand(0.5, 1.5),
        aimErr: rand(0.02, 0.05), strafeDir: 1, strafeTimer: 0,
        walkPhase: Math.random() * 6,
      };
      setBotName(bot);
      mesh.group.position.copy(bot.pos);
      mesh.group.rotation.y = bot.yaw;
      mesh.head.userData.bot = bot; mesh.head.userData.part = 'head';
      mesh.body.userData.bot = bot; mesh.body.userData.part = 'body';
      scene.add(mesh.group);
      bots.push(bot);
    }
  }
}
function randomNavPoint(team) {
  // Waypoints biased toward the enemy half, sites and mid
  const spots = [
    new THREE.Vector3(rand(-26, 26), 0, rand(-20, 20)),
    new THREE.Vector3(-22, 0, -14), new THREE.Vector3(22, 0, 14),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8)),
    new THREE.Vector3(team === 'azure' ? rand(-24, 0) : rand(0, 24), 0, rand(-16, 16)),
  ];
  return spots[Math.floor(Math.random() * spots.length)];
}
function botEye(b) { return new THREE.Vector3(b.pos.x, 1.55, b.pos.z); }
function playerEye() { return new THREE.Vector3(player.pos.x, EYE, player.pos.z); }
function visibleEnemy(bot) {
  // nearest living enemy with line of sight
  let best = null, bestD = 34;
  const eye = botEye(bot);
  const candidates = [];
  if (bot.team === 'ember' && player.alive) candidates.push({ pos: playerEye(), dist: eye.distanceTo(playerEye()), kind: 'player' });
  for (const o of bots) {
    if (o.team !== bot.team && o.alive) candidates.push({ pos: botEye(o), dist: eye.distanceTo(botEye(o)), kind: 'bot', bot: o });
  }
  for (const c of candidates) {
    if (c.dist < bestD && hasLOS(eye, c.pos)) { best = c; bestD = c.dist; }
  }
  return best;
}
function damageBot(bot, dmg, part, attacker) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  flashHitmarker(part === 'head');
  if (bot.hp <= 0) {
    bot.alive = false;
    bot.mesh.group.visible = false;
    G.kills++;
    G.money += 300;
    addKillfeed(attacker === 'player' ? 'YOU' : attacker, bot.name, bot.team);
    sfx.kill();
    checkRoundEnd();
  } else {
    sfx.hit();
  }
}
function damagePlayer(dmg, fromPos) {
  if (!player.alive || G.phase !== 'fight') return;
  let d = dmg;
  if (G.armor > 0) { const absorbed = Math.min(G.armor, d * 0.5); G.armor -= absorbed; d -= absorbed; }
  player.hp -= d;
  $('dmg').style.opacity = '1';
  setTimeout(() => { $('dmg').style.opacity = '0'; }, 130);
  sfx.hurt();
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false;
    G.deaths++;
    document.exitPointerLock && document.exitPointerLock();
    checkRoundEnd();
  }
  updateHUD();
}
function updateBot(bot, dt) {
  if (!bot.alive) return;
  const eye = botEye(bot);
  const enemy = visibleEnemy(bot);
  bot.walkPhase += dt * 7;
  if (enemy) {
    // face and shoot in bursts
    const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
    bot.yaw = Math.atan2(dx, dz);
    bot.mesh.group.rotation.y = bot.yaw;
    bot.fireTimer -= dt;
    if (bot.fireTimer <= 0) {
      bot.burstLeft = 3 + Math.floor(rand(0, 3));
      bot.fireTimer = rand(0.7, 1.4);
    }
    if (bot.burstLeft > 0) {
      bot.burstLeft--;
      bot.fireTimer = Math.max(bot.fireTimer, 0.11);
      const from = new THREE.Vector3(bot.pos.x + Math.sin(bot.yaw) * 0.4, 1.45, bot.pos.z + Math.cos(bot.yaw) * 0.4);
      const err = bot.aimErr + enemy.dist * 0.0012;
      const tx = enemy.pos.x + rand(-err, err) * enemy.dist * 0.6;
      const ty = enemy.pos.y + rand(-err, err) * enemy.dist * 0.6 - 0.15;
      const tz = enemy.pos.z + rand(-err, err) * enemy.dist * 0.6;
      spawnTracer(from, new THREE.Vector3(tx, ty, tz), bot.team === 'ember' ? 0xff8a70 : 0x8ab8ff);
      sfx.enemyShot(enemy.dist);
      // hit chance falls with distance and target movement
      const movePenalty = enemy.kind === 'player' && playerSpeed() > 2 ? 0.12 : 0;
      const p = clamp(0.42 - enemy.dist * 0.009 - movePenalty, 0.08, 0.42);
      if (Math.random() < p) {
        const dmg = Math.round(rand(9, 15) * (enemy.dist > 25 ? 0.7 : 1));
        if (enemy.kind === 'player') damagePlayer(dmg, bot.pos);
        else if (enemy.bot) {
          enemy.bot.hp -= dmg;
          if (enemy.bot.hp <= 0) {
            enemy.bot.alive = false; enemy.bot.mesh.group.visible = false;
            addKillfeed(bot.name, enemy.bot.name, enemy.bot.team);
            checkRoundEnd();
          }
        }
      }
    }
    // strafe a little while fighting
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) { bot.strafeDir *= -1; bot.strafeTimer = rand(0.8, 1.8); }
    const sx = Math.cos(bot.yaw) * bot.strafeDir * 1.1 * dt;
    const sz = -Math.sin(bot.yaw) * bot.strafeDir * 1.1 * dt;
    bot.pos.x += sx; bot.pos.z += sz;
    collideCircle(bot.pos, 0.45);
  } else {
    // patrol toward target point
    bot.repath -= dt;
    if (!bot.target || bot.repath <= 0 || bot.pos.distanceTo(bot.target) < 1.2) {
      bot.target = randomNavPoint(bot.team);
      bot.repath = rand(5, 9);
    }
    const dx = bot.target.x - bot.pos.x, dz = bot.target.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const sp = 3.4;
      bot.pos.x += (dx / d) * sp * dt; bot.pos.z += (dz / d) * sp * dt;
      bot.yaw = Math.atan2(dx, dz);
      bot.mesh.group.rotation.y = bot.yaw;
      collideCircle(bot.pos, 0.45);
    }
  }
  // walk bob
  bot.mesh.group.position.copy(bot.pos);
  bot.mesh.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.05;
}

// ---------------------------------------------------------------- player shooting
function playerSpeed() {
  return Math.hypot(player.vel.x, player.vel.z);
}
function currentWeapon() { return WEAPONS[G.weapon]; }
function fireWeapon() {
  if (!player.alive || G.phase !== 'fight' || player.reloading) return;
  const w = currentWeapon();
  const now = performance.now();
  if (now - player.lastShot < 60000 / w.rpm) return;
  if (G.ammo[G.weapon] <= 0) { sfx.dry(); player.lastShot = now; return; }
  player.lastShot = now;
  G.ammo[G.weapon]--;
  G.shots++;
  // spread: base + bloom from firing + movement; standing still and slow = accurate
  const moveSpread = playerSpeed() * 0.004;
  const spread = w.spread + player.spreadBloom + moveSpread;
  player.spreadBloom = Math.min(0.05, player.spreadBloom + w.kick * 0.35);
  player.pitch += w.kick * 0.55; // recoil kick
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
  dir.normalize();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, dir); raycaster.far = w.range;
  const botMeshes = [];
  for (const b of bots) if (b.alive && b.team === 'ember') { botMeshes.push(b.mesh.head, b.mesh.body); }
  const hits = raycaster.intersectObjects([...botMeshes, ...solids], false);
  let end = origin.clone().add(dir.clone().multiplyScalar(w.range));
  if (hits.length) {
    const h = hits[0];
    end = h.point.clone();
    if (h.object.userData.bot) {
      G.hits++;
      const dist = origin.distanceTo(h.point);
      const falloff = dist > 30 ? 0.75 : 1;
      damageBot(h.object.userData.bot, Math.round(w.dmg * (h.object.userData.part === 'head' ? w.headMul : 1) * falloff), h.object.userData.part, 'player');
    }
  }
  const muzzlePos = camera.localToWorld(new THREE.Vector3(0.21, -0.16, -0.85));
  spawnTracer(muzzlePos, end);
  muzzle.intensity = 26;
  setTimeout(() => { muzzle.intensity = 0; }, 45);
  sfx.shot(G.weapon);
  updateHUD();
}
function reloadWeapon() {
  const w = currentWeapon();
  if (player.reloading || G.ammo[G.weapon] === w.mag) return;
  player.reloading = true;
  sfx.reload();
  setTimeout(() => { G.ammo[G.weapon] = w.mag; player.reloading = false; updateHUD(); }, w.reload * 1000);
}
function buyWeapon(id) {
  if (G.phase !== 'buy') return;
  if (id === 'armor') {
    if (G.armor >= 100) return;
    if (G.money < 650) { sfx.dry(); return; }
    G.money -= 650; G.armor = 100; sfx.buy(); renderBuy(); updateHUD(); return;
  }
  const w = WEAPONS[id];
  if (!w || G.owned[id]) return;
  if (G.money < w.price) { sfx.dry(); return; }
  G.money -= w.price;
  G.owned[id] = true;
  G.ammo[id] = w.mag;
  G.weapon = id;
  sfx.buy(); renderBuy(); updateHUD();
}
function switchWeapon(id) {
  if (!G.owned[id] || G.weapon === id) return;
  G.weapon = id; player.reloading = false; sfx.click(); updateHUD();
}

// ---------------------------------------------------------------- HUD
function updateHUD() {
  $('healthnum').textContent = Math.max(0, Math.ceil(player.hp));
  $('healthfill').style.width = `${clamp(player.hp, 0, 100)}%`;
  $('healthfill').style.background = player.hp > 50 ? '#57d977' : player.hp > 25 ? '#ffb340' : '#ff5a4d';
  $('armorline').textContent = `ARMOR ${Math.round(G.armor)}`;
  $('lowhp').style.opacity = player.hp <= 30 && player.alive ? '1' : '0';
  const w = currentWeapon();
  $('ammonum').innerHTML = `${G.ammo[G.weapon]} <small>/ &infin;</small>`;
  $('weaponname').textContent = w.name + (player.reloading ? ' — RELOADING' : '');
  $('moneyline').textContent = `$${G.money}`;
  $('scoreA').textContent = G.score.azure;
  $('scoreE').textContent = G.score.ember;
  $('timer').textContent = fmtTime(Math.max(0, G.phase === 'buy' ? G.buyLeft : G.timeLeft));
  $('timer').classList.toggle('low', G.timeLeft <= 15 && G.phase === 'fight');
  $('roundlabel').textContent = `ROUND ${G.round} — FIRST TO ${WIN_ROUNDS}`;
  // crosshair gap grows with spread
  const gap = 6 + (currentWeapon().spread + player.spreadBloom + playerSpeed() * 0.004) * 900;
  $('armT').style.top = `${-8 - gap}px`; $('armB').style.top = `${6 + gap}px`;
  $('armL').style.left = `${-8 - gap}px`; $('armR').style.left = `${6 + gap}px`;
}
function addKillfeed(killer, victim, victimTeam) {
  const feed = $('killfeed');
  const div = document.createElement('div');
  const kc = killer === 'YOU' ? 'az' : (victimTeam === 'ember' ? 'az' : 'em');
  div.innerHTML = `<span class="${kc}">${killer}</span> &rsaquo; <span class="${victimTeam === 'ember' ? 'em' : 'az'}">${victim}</span>`;
  feed.prepend(div);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
  setTimeout(() => { div.remove(); }, 6000);
}
let hitTimer = null;
function flashHitmarker(kill) {
  const hm = $('hitmarker');
  hm.classList.toggle('kill', !!kill);
  hm.style.opacity = '1';
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => { hm.style.opacity = '0'; }, 120);
}
function showBanner(title, sub, cls) {
  const b = $('banner');
  b.classList.remove('hidden', 'win', 'lose');
  if (cls) b.classList.add(cls);
  b.querySelector('h1').textContent = title;
  b.querySelector('p').textContent = sub;
}
function hideBanner() { $('banner').classList.add('hidden'); }

function renderBuy() {
  const list = $('buylist');
  list.innerHTML = '';
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const row = document.createElement('div');
    row.className = 'buyrow' + (G.owned[id] ? ' owned' : '') + (!G.owned[id] && G.money < w.price ? ' afford-no' : '');
    row.innerHTML = `<div><b>${w.name}</b><span>DMG ${w.dmg} &middot; MAG ${w.mag} &middot; ${w.auto ? 'AUTO' : 'SEMI'}${id === 'lance' ? ' &middot; SCOPE' : ''}</span></div><div class="price">${G.owned[id] ? 'OWNED' : '$' + w.price}</div>`;
    row.onclick = () => buyWeapon(id);
    list.appendChild(row);
  }
  const arow = document.createElement('div');
  arow.className = 'buyrow' + (G.armor >= 100 ? ' owned' : '') + (G.armor < 100 && G.money < 650 ? ' afford-no' : '');
  arow.innerHTML = `<div><b>KEVLAR VEST</b><span>Absorbs half of incoming damage</span></div><div class="price">${G.armor >= 100 ? 'OWNED' : '$650'}</div>`;
  arow.onclick = () => buyWeapon('armor');
  list.appendChild(arow);
  $('buymoney').textContent = `$${G.money}`;
}

// ---------------------------------------------------------------- rounds
function startMatch() {
  G.round = 1; G.score = { azure: 0, ember: 0 };
  G.money = 800; G.armor = 0; G.owned = { p9: true }; G.weapon = 'p9';
  G.ammo = { p9: 12 }; G.kills = 0; G.deaths = 0; G.shots = 0; G.hits = 0;
  $('menu').classList.add('hidden');
  $('endscreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  startRound();
}
function startRound() {
  spawnBots();
  player.hp = 100; player.alive = true;
  player.pos.copy(TEAM.azure.spawn).add(new THREE.Vector3(rand(-2, 2), 0, rand(-1, 1)));
  player.yaw = TEAM.azure.dir; player.pitch = 0; player.vel.set(0, 0, 0);
  G.beacon = { azure: 0, ember: 0 }; G.beaconHolder = null;
  G.buyLeft = BUY_TIME; G.timeLeft = ROUND_TIME;
  G.phase = 'buy';
  renderBuy();
  $('buy').classList.remove('hidden');
  showBanner(`ROUND ${G.round}`, 'Buy phase — press B to close, gear up, then fight.', '');
  updateHUD();
}
function startFight() {
  G.phase = 'fight';
  $('buy').classList.add('hidden');
  hideBanner();
  showBanner('FIGHT!', 'Eliminate Ember or hold the uplink beacon.', '');
  setTimeout(() => { if (G.phase === 'fight') hideBanner(); }, 1600);
}
function aliveCount(team) {
  let n = team === 'azure' && player.alive ? 1 : 0;
  for (const b of bots) if (b.team === team && b.alive) n++;
  return n;
}
function checkRoundEnd() {
  if (G.phase !== 'fight') return;
  const a = aliveCount('azure'), e = aliveCount('ember');
  if (e === 0) endRound('azure', 'Ember team eliminated.');
  else if (a === 0) endRound('ember', 'Azure team eliminated.');
}
function endRound(winner, reason) {
  if (G.phase === 'roundEnd' || G.phase === 'matchEnd') return;
  G.phase = 'roundEnd';
  G.score[winner]++;
  const won = winner === 'azure';
  G.money += won ? 3250 : 1900;
  if (won) sfx.roundWin(); else sfx.roundLose();
  showBanner(won ? 'ROUND WON' : 'ROUND LOST', `${TEAM[winner].label} wins round ${G.round} — ${reason}  (+$${won ? 3250 : 1900})`, won ? 'win' : 'lose');
  updateHUD();
  setTimeout(() => {
    hideBanner();
    if (G.score.azure >= WIN_ROUNDS || G.score.ember >= WIN_ROUNDS || G.round >= 9) endMatch();
    else { G.round++; startRound(); }
  }, 3800);
}
function endMatch() {
  G.phase = 'matchEnd';
  document.exitPointerLock && document.exitPointerLock();
  const won = G.score.azure > G.score.ember;
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  $('endtitle').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('endsub').textContent = won ? 'Azure takes the match' : 'Ember takes the match';
  $('endstats').textContent = `Final score Azure ${G.score.azure} — ${G.score.ember} Ember. ` +
    `Your record: ${G.kills} eliminations, ${G.deaths} deaths, ${acc}% accuracy.`;
  $('endscreen').classList.remove('hidden');
  if (won) sfx.roundWin(); else sfx.roundLose();
}
function updateBeacon(dt) {
  if (G.phase !== 'fight') return;
  const inZone = (p) => Math.hypot(p.x, p.z) < 2.6;
  let az = player.alive && inZone(player.pos) ? 1 : 0;
  let em = 0;
  for (const b of bots) if (b.alive && inZone(b.pos)) { if (b.team === 'azure') az++; else em++; }
  if (az > 0 && em === 0) {
    G.beacon.azure = Math.min(1, G.beacon.azure + dt / 8);
    G.beacon.ember = Math.max(0, G.beacon.ember - dt / 4);
    if (G.beacon.azure >= 1) { G.money += 500; endRound('azure', 'Uplink beacon secured.'); return; }
    if (Math.random() < dt * 0.5) sfx.beacon();
  } else if (em > 0 && az === 0) {
    G.beacon.ember = Math.min(1, G.beacon.ember + dt / 8);
    G.beacon.azure = Math.max(0, G.beacon.azure - dt / 4);
    if (G.beacon.ember >= 1) { endRound('ember', 'Uplink beacon secured.'); return; }
  } else {
    G.beacon.azure = Math.max(0, G.beacon.azure - dt / 6);
    G.beacon.ember = Math.max(0, G.beacon.ember - dt / 6);
  }
  const cap = Math.max(G.beacon.azure, G.beacon.ember);
  beaconLight.material.emissiveIntensity = 1.4 + cap * 3;
  beaconRing.scale.setScalar(1 + cap * 0.25);
}

// ---------------------------------------------------------------- input
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Tab') e.preventDefault();
  if (G.phase === 'buy') {
    if (e.code === 'Digit1') buyWeapon('p9');
    if (e.code === 'Digit2') buyWeapon('vk9');
    if (e.code === 'Digit3') buyWeapon('ar77');
    if (e.code === 'Digit4') buyWeapon('lance');
    if (e.code === 'Digit5') buyWeapon('armor');
  }
  if (e.code === 'KeyB' && (G.phase === 'buy' || G.phase === 'fight')) {
    const b = $('buy');
    if (G.phase === 'buy') { b.classList.toggle('hidden'); }
  }
  if (e.code === 'KeyR') reloadWeapon();
  if (e.code === 'Digit1' && G.owned.p9) switchWeapon('p9');
  if (e.code === 'Digit2' && G.owned.vk9) switchWeapon('vk9');
  if (e.code === 'Digit3' && G.owned.ar77) switchWeapon('ar77');
  if (e.code === 'Digit4' && G.owned.lance) switchWeapon('lance');
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || !player.alive || shotMode) return;
  const sens = player.scoped ? 0.0009 : 0.0021;
  player.yaw -= e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
});
document.addEventListener('mousedown', (e) => {
  if (G.phase !== 'fight' || !player.alive) return;
  if (e.button === 0) { if (pointerLocked || shotMode) fireWeapon(); }
  if (e.button === 2) {
    if (G.weapon === 'lance' && (pointerLocked || shotMode)) {
      player.scoped = !player.scoped;
      camera.fov = player.scoped ? 74 / WEAPONS.lance.zoom : 74;
      camera.updateProjectionMatrix();
    }
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('click', () => {
  if (G.phase === 'fight' && player.alive && !pointerLocked && !shotMode) {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
$('playbtn').addEventListener('click', () => {
  audio();
  startMatch();
  renderer.domElement.requestPointerLock();
});
$('againbtn').addEventListener('click', () => { audio(); startMatch(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- player movement
function updatePlayer(dt) {
  if (!player.alive) return;
  const walk = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = walk ? 2.2 : 4.6;
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let mx = (-sin * fwd + cos * strafe);
  let mz = (-cos * fwd - sin * strafe);
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  player.vel.x = lerp(player.vel.x, mx * speed, 1 - Math.exp(-12 * dt));
  player.vel.z = lerp(player.vel.z, mz * speed, 1 - Math.exp(-12 * dt));
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collideCircle(player.pos, 0.42);
  // jump / gravity
  if (keys['Space'] && player.onGround) { player.vy = 7.2; player.onGround = false; }
  player.vy -= GRAV * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  // head bob + camera
  const bob = playerSpeed() > 0.5 && player.onGround ? Math.sin(performance.now() * 0.011) * 0.035 : 0;
  camera.position.set(player.pos.x, EYE + player.pos.y + bob, player.pos.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;
  // spread bloom decays
  player.spreadBloom = Math.max(0, player.spreadBloom - dt * 0.09);
  // auto fire while held
  if ((keys['Mouse0'] || mouseHeld) && currentWeapon().auto) fireWeapon();
  // viewmodel sway
  viewGun.position.x = 0.21 + Math.sin(performance.now() * 0.0016) * 0.004 * Math.min(1, playerSpeed() / 4);
  viewGun.position.y = -0.19 + bob * 0.4;
}
let mouseHeld = false;
document.addEventListener('mousedown', (e) => { if (e.button === 0) mouseHeld = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });

// ---------------------------------------------------------------- screenshot demo mode
function setupShot(n) {
  // Auto-start a live round and park the camera on a preset view.
  audio();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  G.phase = 'fight';
  G.timeLeft = ROUND_TIME;
  spawnBots();
  // give the player a rifle and some action for the shot
  G.owned = { p9: true, ar77: true }; G.weapon = 'ar77'; G.ammo = { p9: 12, ar77: 30 };
  G.money = 2450;
  // Presets are {pos, look}: yaw is solved so the camera faces the look point.
  // Camera forward is (-sin yaw, -cos yaw), so yaw = atan2(-dx, -dz).
  const presets = {
    '1': { pos: [0, 16], look: [0, -10] },        // down the mid lane at the beacon
    '2': { pos: [-8, -14], look: [18, 14] },   // diagonal across the map: beacon, crates, site B
    '3': { pos: [12, -14], look: [-2, 2] },      // near mid crates, looking at the beacon
  };
  const p = presets[n] || presets['1'];
  demoCam = p;
  player.pos.set(p.pos[0], 0, p.pos[1]);
  player.yaw = Math.atan2(-(p.look[0] - p.pos[0]), -(p.look[1] - p.pos[1]));
  player.pitch = -0.04;
  // push a couple of enemy bots into view for the frame, and keep them there
  const foes = bots.filter((b) => b.team === 'ember');
  if (foes[0]) { foes[0].pos.set(-2, 0, -4); foes[0].target = new THREE.Vector3(0, 0, 10); foes[0].repath = 30; }
  if (foes[1]) { foes[1].pos.set(5, 0, -8); foes[1].target = new THREE.Vector3(2, 0, 12); foes[1].repath = 30; }
  if (foes[2]) { foes[2].pos.set(-8, 0, 2); foes[2].target = new THREE.Vector3(-4, 0, 10); foes[2].repath = 30; }
  const ally = bots.find((b) => b.team === 'azure');
  if (ally && n === '1') { ally.pos.set(-3, 0, 12); ally.target = new THREE.Vector3(-2, 0, -6); ally.repath = 30; }
  updateHUD();
  window.__ironlineReady = true;
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (G.phase === 'buy') {
    G.buyLeft -= dt;
    if (G.buyLeft <= 0) startFight();
  } else if (G.phase === 'fight') {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) {
      const a = aliveCount('azure'), e = aliveCount('ember');
      if (a > e) endRound('azure', 'More Azure fighters standing at the buzzer.');
      else if (e > a) endRound('ember', 'More Ember fighters standing at the buzzer.');
      else endRound('azure', 'Dead heat — Azure takes it on the uplink.');
    }
    updateBeacon(dt);
  }
  if (G.phase === 'fight' || G.phase === 'buy' || G.phase === 'roundEnd') {
    updatePlayer(dt);
    for (const b of bots) updateBot(b, dt);
  }
  // beacon pulse
  beaconLight.position.y = 4.8 + Math.sin(t * 2.2) * 0.18;
  beaconGlow.intensity = 10 + Math.sin(t * 2.2) * 3;
  labelA.material.opacity = 0.85 + Math.sin(t * 2) * 0.15;
  updateTracers(dt);
  updateHUD();
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++;
}
if (shotMode) setupShot(shotMode);
tick();
window.__ironline = { G, player, bots };
