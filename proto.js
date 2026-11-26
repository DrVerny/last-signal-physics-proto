// THE LAST SIGNAL - Physics Yard prototype.
// Three.js rendering + cannon-es physics, both vendored locally.
// A street yard: pushable crates, rolling barrels, a shovable police van,
// a low platform to jump onto, walls, and a capsule player with gravity.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ---------- renderer (same look as the game) ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2233);
scene.fog = new THREE.Fog(0x1a2233, 30, 90);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

const ambient = new THREE.AmbientLight(0xbfc8d4, 0.5);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0x9db8d4, 0x2a2418, 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
scene.add(sun);

// ---------- small procedural textures (canvas, no downloads) ----------
function canvasTex(size, draw, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX || 1, repeatY || 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(ctx, s, base, dots, n) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dots[i % dots.length];
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}
const asphaltTex = canvasTex(256, (ctx, s) => speckle(ctx, s, '#33363b', ['#2a2d31', '#3d4046', '#44484e', '#26292d'], 900), 8, 8);
const brickTex = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#6e3b2a'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#c8b8a8';
  const rows = 8, bh = s / rows;
  for (let r = 0; r < rows; r++) {
    ctx.fillRect(0, r * bh, s, 3);
    const off = (r % 2) * 32;
    for (let x = -1; x < 5; x++) ctx.fillRect(x * 64 + off, r * bh, 3, bh);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 20, 8);
}, 6, 2);
const woodTex = canvasTex(128, (ctx, s) => {
  ctx.fillStyle = '#8a6a3a'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#7a5c30';
  for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 3);
  ctx.strokeStyle = 'rgba(60,40,15,0.5)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    const y = Math.random() * s;
    ctx.moveTo(0, y); ctx.bezierCurveTo(40, y + 4, 80, y - 4, s, y);
    ctx.stroke();
  }
}, 1, 1);
const stripeTex = canvasTex(128, (ctx, s) => {
  ctx.fillStyle = '#e8b800'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#181818';
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, s); ctx.lineTo(i * 32 + 32, s); ctx.lineTo(i * 32 + 64, 0); ctx.lineTo(i * 32 + 32, 0);
    ctx.closePath(); ctx.fill();
  }
}, 2, 1);
const policeTex = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#1a2a4a';
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('POLICE', s / 2, s / 2);
}, 1, 1);

// ---------- physics world ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 10;

const groundPhysMat = new CANNON.Material('ground');
const objectPhysMat = new CANNON.Material('object');
const playerPhysMat = new CANNON.Material('player');
const vanPhysMat = new CANNON.Material('van');
world.addContactMaterial(new CANNON.ContactMaterial(groundPhysMat, objectPhysMat, { friction: 0.4, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(objectPhysMat, objectPhysMat, { friction: 0.3, restitution: 0.08 }));
// The player is velocity-controlled, so the ground must not grip the capsule:
// with normal friction the capsule's sphere contact eats the whole speed.
world.addContactMaterial(new CANNON.ContactMaterial(groundPhysMat, playerPhysMat, { friction: 0.05, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(playerPhysMat, objectPhysMat, { friction: 0.2, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(playerPhysMat, vanPhysMat, { friction: 0.2, restitution: 0.05 }));
// Low rolling resistance, like wheels: a person can shove a van that
// rolls, but not one dragging on its belly. At 0.45 the van barely
// budges; at 0.05 it glides away. 0.1 slides a little on a shove.
world.addContactMaterial(new CANNON.ContactMaterial(groundPhysMat, vanPhysMat, { friction: 0.1, restitution: 0.05 }));
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.05;

// Meshes and bodies that move together, with their start pose for reset.
const synced = [];
const resetList = [];
function addSynced(mesh, body) {
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  world.addBody(body);
  synced.push({ mesh, body });
  resetList.push({ body, x: body.position.x, y: body.position.y, z: body.position.z,
    qx: body.quaternion.x, qy: body.quaternion.y, qz: body.quaternion.z, qw: body.quaternion.w });
  return { mesh, body };
}
function boxMesh(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function staticBox(w, h, d, x, y, z, mat, ry) {
  const mesh = boxMesh(w, h, d, mat);
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  scene.add(mesh);
  const body = new CANNON.Body({ mass: 0, material: groundPhysMat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
  body.position.set(x, y, z);
  if (ry) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
  world.addBody(body);
  return { mesh, body };
}

// ---------- the yard ----------
const groundMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 });
const ground = boxMesh(30, 1, 30, groundMat);
ground.position.set(0, -0.5, 0);
scene.add(ground);
const groundBody = new CANNON.Body({ mass: 0, material: groundPhysMat });
groundBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 0.5, 15)));
groundBody.position.set(0, -0.5, 0);
world.addBody(groundBody);

const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
staticBox(30, 3, 0.6, 0, 1.5, -15, wallMat);
staticBox(30, 3, 0.6, 0, 1.5, 15, wallMat);
staticBox(0.6, 3, 30, -15, 1.5, 0, wallMat);
staticBox(0.6, 3, 30, 15, 1.5, 0, wallMat);

// Low platform the player can jump onto, plus a taller second step.
const platMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.85 });
staticBox(3, 0.5, 3, 5, 0.25, -5, platMat);
staticBox(2, 1.0, 2, 8.2, 0.5, -5, platMat);

// Striped barriers (static, jumpable).
const barrierMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 });
staticBox(2.0, 0.7, 0.18, -3, 0.35, 2, barrierMat, 0.3);
staticBox(2.0, 0.7, 0.18, 2, 0.35, 4, barrierMat, -0.4);

// ---------- pushable crates ----------
const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
function addCrate(x, y, z, s) {
  const mesh = boxMesh(s, s, s, crateMat);
  mesh.position.set(x, y, z);
  const body = new CANNON.Body({ mass: 3, material: objectPhysMat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)));
  body.position.set(x, y, z);
  body.linearDamping = 0.05; body.angularDamping = 0.1;
  body.allowSleep = true; body.sleepSpeedLimit = 0.2; body.sleepTimeLimit = 0.6;
  return addSynced(mesh, body);
}
addCrate(-5, 0.31, -3, 0.62);
addCrate(-4.3, 0.31, -3.1, 0.62);
addCrate(-4.65, 0.93, -3.05, 0.62);
addCrate(-5.2, 0.31, -2.2, 0.62);
addCrate(-3.6, 0.31, -2.4, 0.62);
addCrate(-6, 0.31, 1.5, 0.62);
addCrate(-5.3, 0.31, 1.7, 0.62);
addCrate(-6.2, 0.31, -5.5, 0.62);

// ---------- rolling barrels ----------
const barrelColors = [0xb03030, 0x2a5a9a, 0xc8a018];
function addBarrel(x, y, z, color) {
  // Lying on its side (axis along X) so a shove makes it roll.
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.92, 18), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  mesh.rotation.z = Math.PI / 2;
  const body = new CANNON.Body({ mass: 4, material: objectPhysMat });
  body.addShape(new CANNON.Cylinder(0.34, 0.34, 0.92, 14));
  body.position.set(x, y, z);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
  body.linearDamping = 0.1; body.angularDamping = 0.4;
  body.allowSleep = true; body.sleepSpeedLimit = 0.2; body.sleepTimeLimit = 0.6;
  return addSynced(mesh, body);
}
addBarrel(3, 0.34, 3, barrelColors[0]);
addBarrel(3.9, 0.34, 3.4, barrelColors[1]);
addBarrel(3.4, 0.34, 2.1, barrelColors[2]);

// ---------- the police van: heavy, but shovable ----------
const vanGroup = new THREE.Group();
const vanNavy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.5, metalness: 0.25 });
const vanWhite = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
const vanDark = new THREE.MeshStandardMaterial({ color: 0x0a141e, roughness: 0.15, metalness: 0.5 });
const vanBodyMesh = boxMesh(2.6, 1.5, 5.2, vanNavy);
vanBodyMesh.position.set(0, 0.95, 0);
vanGroup.add(vanBodyMesh);
const vanBand = boxMesh(2.62, 0.55, 5.22, vanWhite);
vanBand.position.set(0, 1.05, 0);
vanGroup.add(vanBand);
const vanCab = boxMesh(2.5, 0.9, 1.2, vanNavy);
vanCab.position.set(0, 1.95, -2.2);
vanGroup.add(vanCab);
const vanShield = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.7), vanDark);
vanShield.position.set(0, 1.95, -2.82); vanShield.rotation.y = Math.PI;
vanGroup.add(vanShield);
for (const sx of [-1, 1]) {
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshStandardMaterial({ map: policeTex, roughness: 0.6 }));
  plate.position.set(sx * 1.31, 1.35, 0);
  plate.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
  vanGroup.add(plate);
  for (const wz of [-1.8, 0, 1.8]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * 1.25, 0.42, wz);
    wheel.castShadow = true;
    vanGroup.add(wheel);
  }
}
scene.add(vanGroup);
const vanBody = new CANNON.Body({ mass: 250, material: vanPhysMat });
vanBody.addShape(new CANNON.Box(new CANNON.Vec3(1.3, 0.75, 2.6)), new CANNON.Vec3(0, 0.95, 0));
vanBody.addShape(new CANNON.Box(new CANNON.Vec3(1.25, 0.45, 0.6)), new CANNON.Vec3(0, 1.95, -2.2));
vanBody.position.set(-2, 0, 5);
vanBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0.25);
vanBody.linearDamping = 0.3; vanBody.angularDamping = 0.4;
vanBody.allowSleep = true; vanBody.sleepSpeedLimit = 0.15; vanBody.sleepTimeLimit = 0.8;
world.addBody(vanBody);
const vanStart = { x: -2, y: 0, z: 5, yaw: 0.25 };
synced.push({ mesh: vanGroup, body: vanBody });

// ---------- the player: capsule body, simple humanoid mesh ----------
const PLAYER_SPEED = 4.5;
const JUMP_SPEED = 5.5;
const playerBody = new CANNON.Body({ mass: 80, material: playerPhysMat });
playerBody.addShape(new CANNON.Cylinder(0.35, 0.35, 0.9, 12));
playerBody.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, 0.45, 0));
playerBody.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, -0.45, 0));
playerBody.position.set(0, 1.2, 8);
playerBody.fixedRotation = true;
playerBody.updateMassProperties();
playerBody.linearDamping = 0.1;
playerBody.allowSleep = false;
world.addBody(playerBody);

const playerGroup = new THREE.Group();
const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7 });
const shirtMat = new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.85 });
const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9 });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
function limb(w, h, d, mat, x, y, z) {
  const m = boxMesh(w, h, d, mat);
  m.position.set(x, y, z);
  playerGroup.add(m);
  return m;
}
limb(0.5, 0.62, 0.3, shirtMat, 0, 1.05, 0);            // torso
const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), skinMat);
head.position.set(0, 1.52, 0); head.castShadow = true;
playerGroup.add(head);
limb(0.16, 0.55, 0.18, pantsMat, -0.13, 0.42, 0);      // left leg
limb(0.16, 0.55, 0.18, pantsMat, 0.13, 0.42, 0);       // right leg
limb(0.2, 0.1, 0.3, shoeMat, -0.13, 0.08, 0.04);       // left shoe
limb(0.2, 0.1, 0.3, shoeMat, 0.13, 0.08, 0.04);        // right shoe
limb(0.12, 0.55, 0.14, shirtMat, -0.33, 1.05, 0);      // left arm
limb(0.12, 0.55, 0.14, shirtMat, 0.33, 1.05, 0);       // right arm
scene.add(playerGroup);

// ---------- input ----------
const keys = {};
let camYaw = 0;
let camPitch = 0.25;
const CAM_DIST = 4;
const CAM_LOOK_Y = 1.35;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); tryJump(); }
  if (e.code === 'KeyR') resetYard();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Drag to look.
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.005;
  camPitch += (e.clientY - lastY) * 0.005;
  camPitch = Math.max(-0.1, Math.min(1.2, camPitch));
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });

// On-screen touch buttons.
function bindTouch(id, code) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = (e) => { e.preventDefault(); keys[code] = true; if (code === 'Space') tryJump(); };
  const off = (e) => { e.preventDefault(); keys[code] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindTouch('tUp', 'KeyW');
bindTouch('tDown', 'KeyS');
bindTouch('tLeft', 'KeyA');
bindTouch('tRight', 'KeyD');
bindTouch('tJump', 'Space');
document.getElementById('resetBtn').addEventListener('click', resetYard);

// ---------- grounding check: a short ray straight down ----------
const ray = new CANNON.Ray(new CANNON.Vec3(), new CANNON.Vec3());
const rayResult = new CANNON.RaycastResult();
function isGrounded() {
  ray.from.copy(playerBody.position);
  ray.to.set(playerBody.position.x, playerBody.position.y - 1.15, playerBody.position.z);
  rayResult.reset();
  ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: rayResult, skipBackfaces: true });
  return rayResult.hasHit;
}
function tryJump() {
  if (isGrounded()) {
    playerBody.velocity.y = JUMP_SPEED;
    playerBody.wakeUp();
  }
}

function resetYard() {
  playerBody.position.set(0, 1.2, 8);
  playerBody.velocity.set(0, 0, 0);
  playerBody.quaternion.set(0, 0, 0, 1);
  playerBody.wakeUp();
  for (const r of resetList) {
    r.body.position.set(r.x, r.y, r.z);
    r.body.quaternion.set(r.qx, r.qy, r.qz, r.qw);
    r.body.velocity.set(0, 0, 0);
    r.body.angularVelocity.set(0, 0, 0);
    r.body.wakeUp();
  }
  vanBody.position.set(vanStart.x, vanStart.y, vanStart.z);
  vanBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), vanStart.yaw);
  vanBody.velocity.set(0, 0, 0);
  vanBody.angularVelocity.set(0, 0, 0);
  vanBody.wakeUp();
  camYaw = 0; camPitch = 0.25;
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const statsEl = document.getElementById('stats');
let frames = 0, statT = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Movement relative to the camera yaw.
  const fwd = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
  const right = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) { mx += fwd.x; mz += fwd.z; }
  if (keys.KeyS || keys.ArrowDown) { mx -= fwd.x; mz -= fwd.z; }
  if (keys.KeyD || keys.ArrowRight) { mx += right.x; mz += right.z; }
  if (keys.KeyA || keys.ArrowLeft) { mx -= right.x; mz -= right.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    playerBody.velocity.x = mx * PLAYER_SPEED;
    playerBody.velocity.z = mz * PLAYER_SPEED;
    playerBody.wakeUp();
  } else {
    playerBody.velocity.x *= 0.8;
    playerBody.velocity.z *= 0.8;
  }

  // Fixed 1/60 step, up to 3 substeps.
  world.step(1 / 60, dt, 3);

  // Keep the van from tipping when shoved: it may yaw and slide, but
  // never pitch or roll. A tall box pushed at chest height tips over
  // in plain cannon-es; zeroing pitch/roll rates each frame fixes it.
  vanBody.angularVelocity.x = 0;
  vanBody.angularVelocity.z = 0;

  // Sync meshes to bodies.
  for (const s of synced) {
    s.mesh.position.copy(s.body.position);
    s.mesh.quaternion.copy(s.body.quaternion);
  }
  playerGroup.position.copy(playerBody.position);
  playerGroup.position.y -= 0.8; // body centre is 0.8 above the feet
  if (len > 0) playerGroup.rotation.y = Math.atan2(mx, mz);

  // Third-person camera.
  const px = playerBody.position.x, py = playerBody.position.y, pz = playerBody.position.z;
  const cx = px + Math.sin(camYaw) * Math.cos(camPitch) * CAM_DIST;
  const cz = pz + Math.cos(camYaw) * Math.cos(camPitch) * CAM_DIST;
  const cy = py + Math.sin(camPitch) * CAM_DIST + 0.4;
  camera.position.set(cx, cy, cz);
  camera.lookAt(px, py + CAM_LOOK_Y - 0.8, pz);

  // HUD stats.
  frames++; statT += dt;
  if (statT >= 0.5) {
    const fps = Math.round(frames / statT);
    const sp = Math.hypot(playerBody.velocity.x, playerBody.velocity.z).toFixed(1);
    statsEl.textContent = 'FPS ' + fps + '  |  speed ' + sp + ' m/s  |  pos ' +
      px.toFixed(1) + ', ' + py.toFixed(1) + ', ' + pz.toFixed(1) +
      '  |  grounded: ' + (isGrounded() ? 'yes' : 'no');
    frames = 0; statT = 0;
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
