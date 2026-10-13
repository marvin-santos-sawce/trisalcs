import * as THREE from 'three';
import { PLAYER, NET } from './config.js';
import { loadMap } from './map.js';
import { Controller } from './player.js';
import { Avatar } from './avatar.js';
import { WEAPONS, SLOTS, PRIMARY_WEAPONS, computeDamage, buildViewModel, loadWeaponModels } from './weapons.js';
import { HUD } from './hud.js';
import { Net } from './net.js';
import { firebaseConfig } from './firebase-config.js';
import { SPAWNS } from './spawns.js';
import * as sfx from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------- Cena ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e6);
scene.fog = new THREE.Fog(0xcfd9e0, 80, 320);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a7352, 1.9));
const sun = new THREE.DirectionalLight(0xfff1d0, 2.2); sun.position.set(-30, 60, 20); scene.add(sun);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const hud = new HUD();
const net = new Net(firebaseConfig);
let map, ctrl;
const SETTINGS_KEY = 'dust-ffa-settings';
const settings = loadSettings();
let paused = false;

function loadSettings() {
  const defaults = { volume: 70, sensitivity: 1, style: 'cross', length: 8, gap: 4, thickness: 2, dotSize: 4, color: '#ffffff' };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const bounded = (value, fallback, min, max) => Number.isFinite(+value) ? Math.max(min, Math.min(max, +value)) : fallback;
    return {
      volume: bounded(stored.volume, defaults.volume, 0, 100),
      sensitivity: bounded(stored.sensitivity, defaults.sensitivity, 0.5, 3),
      style: stored.style === 'dot' ? 'dot' : 'cross',
      length: bounded(stored.length, defaults.length, 2, 24),
      gap: bounded(stored.gap, defaults.gap, 0, 16),
      thickness: bounded(stored.thickness, defaults.thickness, 1, 6),
      dotSize: bounded(stored.dotSize, defaults.dotSize, 2, 12),
      color: /^#[\da-f]{6}$/i.test(stored.color) ? stored.color : defaults.color,
    };
  } catch { return defaults; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage indisponível */ }
}
function applySettings() {
  sfx.setVolume(settings.volume / 100);
  if (ctrl) ctrl.sens = 0.0022 * settings.sensitivity;
  hud.setReticle(settings);
}
function syncSettingsUI() {
  $('setting-volume').value = settings.volume;
  $('volume-value').textContent = `${settings.volume}%`;
  $('setting-sensitivity').value = settings.sensitivity;
  $('sensitivity-value').textContent = `${settings.sensitivity.toFixed(1)}x`;
  $('setting-reticle').value = settings.style;
  $('setting-length').value = settings.length;
  $('length-value').textContent = `${settings.length} px`;
  $('setting-gap').value = settings.gap;
  $('gap-value').textContent = `${settings.gap} px`;
  $('setting-thickness').value = settings.thickness;
  $('thickness-value').textContent = `${settings.thickness} px`;
  $('setting-dot-size').value = settings.dotSize;
  $('dot-size-value').textContent = `${settings.dotSize} px`;
  $('setting-reticle-color').value = settings.color;
  $('reticle-lines-settings').classList.toggle('hidden', settings.style === 'dot');
  $('reticle-dot-settings').classList.toggle('hidden', settings.style !== 'dot');
}
function updateSettings() {
  settings.volume = +$('setting-volume').value;
  settings.sensitivity = +$('setting-sensitivity').value;
  settings.style = $('setting-reticle').value;
  settings.length = +$('setting-length').value;
  settings.gap = +$('setting-gap').value;
  settings.thickness = +$('setting-thickness').value;
  settings.dotSize = +$('setting-dot-size').value;
  settings.color = $('setting-reticle-color').value;
  syncSettingsUI(); saveSettings(); applySettings();
}
function setPaused(value) {
  paused = value;
  $('pause').classList.toggle('hidden', !playing || !paused);
  if (paused) {
    ctrl?.keys.clear(); mouse.down = false; mouse.edge = false; boardOn = false;
    if (me.scoped) setScope(false);
  }
}
function requestPointerLock() {
  try { canvas.requestPointerLock?.()?.catch(() => setPaused(true)); } catch { setPaused(true); }
}

// ---------- Estado do jogador local ----------
const me = {
  name: 'player', health: PLAYER.maxHealth, alive: false, kills: 0, deaths: 0,
  idx: 0, prevIdx: 0, primaryWeapon: null, knifeMode: false, ammo: {}, reserve: {}, cooldown: 0, reloadT: 0, scoped: false, scopedLevel: 0, fireCount: 0, respawnT: 0, lastAttacker: '',
};
const avatars = new Map(); // id -> Avatar (bots e jogadores remotos)
let playing = false, loadoutPending = false, vm = null, vmKick = 0, time = 0;
const mouse = { down: false, edge: false };

const curId = () => (me.knifeMode ? 'knife' : SLOTS[me.idx]);
function refillAmmo() {
  SLOTS.forEach((id) => { const w = WEAPONS[id]; me.ammo[id] = w.mag ?? 0; me.reserve[id] = Number.POSITIVE_INFINITY; });
  me.ammo.knife = 1; me.reserve.knife = Number.POSITIVE_INFINITY;
}
refillAmmo();

// ---------- Armas locais ----------
const VIEWMODEL_SCALE = 1.04; // 0.8 * 1.3 (+30% no tamanho na tela)
const VIEWMODEL_POSITION = new THREE.Vector3(0.2, -0.19, -0.42);
function attachViewModel(id) {
  if (vm) camera.remove(vm);
  vm = buildViewModel(id);
  vm.scale.setScalar(VIEWMODEL_SCALE);
  vm.position.copy(VIEWMODEL_POSITION);
  camera.add(vm);
}
function equip(i) {
  if (typeof i !== 'number' || i < 0 || i >= SLOTS.length) return;
  const id = SLOTS[i];
  if (id !== me.primaryWeapon && id !== 'glock') return;
  if (i === me.idx && !me.knifeMode && vm) return;
  me.idx = i; me.prevIdx = i; me.knifeMode = false; me.reloadT = 0; setScope(false);
  attachViewModel(curId());
  hud.setWeapon(curId(), me.ammo[curId()], me.reserve[curId()]);
}
function selectWeapon(id) {
  if (!me.alive) return;
  if (id === 'knife') {
    if (!me.knifeMode) toggleKnife();
    return;
  }
  if (id === me.primaryWeapon || id === 'glock') equip(SLOTS.indexOf(id));
}
function toggleKnife() {
  if (!me.alive) return;
  if (me.knifeMode) {
    me.idx = Math.max(0, Math.min(SLOTS.length - 1, me.prevIdx ?? 0));
    me.knifeMode = false;
  } else {
    me.prevIdx = me.idx;
    me.knifeMode = true;
  }
  me.reloadT = 0; setScope(false);
  attachViewModel(curId());
  hud.setWeapon(curId(), me.ammo[curId()] ?? 1, me.reserve[curId()] ?? Number.POSITIVE_INFINITY);
}
function setScopeLevel(level) {
  const prev = me.scopedLevel || 0;
  level = Math.max(0, Math.min(2, +level || 0));
  if (curId() !== 'awm' || !me.alive) level = 0;

  me.scopedLevel = level;
  me.scoped = level > 0;

  if (level > 0 && level !== prev) sfx.play('zoom');

  const fov = level === 2 ? (WEAPONS.awm.scopeFov2 || 9)
            : level === 1 ? (WEAPONS.awm.scopeFov || 18)
            : 75;

  camera.fov = fov; camera.updateProjectionMatrix();
  if (ctrl) ctrl.sensMult = level === 2 ? 0.125 : level === 1 ? 0.25 : 1;
  if (vm) vm.visible = level === 0;
  hud.setScoped(level > 0);
}
function setScope(on) {
  setScopeLevel(on ? 1 : 0);
}
function cycleScope() {
  if (curId() !== 'awm' || !me.alive) return;
  const next = ((me.scopedLevel || 0) + 1) % 3;
  setScopeLevel(next);
}
function startReload() {
  const id = curId(), w = WEAPONS[id];
  if (w.melee || me.reloadT > 0 || me.ammo[id] >= w.mag || me.reserve[id] <= 0) return;
  me.reloadT = w.reload; setScope(false); sfx.play('reload');
}
function finishReload() {
  const id = curId(), w = WEAPONS[id];
  if (w.melee) return;
  const take = Math.min(w.mag - me.ammo[id], me.reserve[id]);
  me.ammo[id] += take; if (Number.isFinite(me.reserve[id])) me.reserve[id] -= take;
  hud.setWeapon(id, me.ammo[id], me.reserve[id]);
}

// ---------- Tiro ----------
const rc = new THREE.Raycaster();
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const fx = []; // tracers / impactos temporários

function targetMeshes() {
  const t = [...map.meshes];
  for (const a of avatars.values()) if (a.alive) t.push(...a.hitMeshes);
  return t;
}

function fire() {
  if (!me.alive || hud.wheelOpen) return;
  const id = curId(), w = WEAPONS[id];
  if (me.cooldown > 0 || me.reloadT > 0) return;
  if (w.melee) { me.cooldown = 60 / w.rpm; vmKick = 1; sfx.play('knife'); me.fireCount++; return swing(id, w); }
  if (me.ammo[id] <= 0) { startReload(); return; }
  me.ammo[id]--; me.cooldown = 60 / w.rpm; me.fireCount++;
  hud.setWeapon(id, me.ammo[id], me.reserve[id]);

  camera.getWorldDirection(_d);
  if (id === 'awm') {
    const sp = me.scoped && w.scopedSpread !== undefined ? w.scopedSpread
      : w.spread * (ctrl.moving ? 2 : 1) * (ctrl.onGround ? 1 : 3);
    _r.setFromMatrixColumn(camera.matrixWorld, 0); _u.setFromMatrixColumn(camera.matrixWorld, 1);
    _d.addScaledVector(_r, (Math.random() - .5) * 2 * sp).addScaledVector(_u, (Math.random() - .5) * 2 * sp).normalize();
  }

  rc.set(camera.position, _d); rc.near = 0; rc.far = 400;
  const hit = rc.intersectObjects(targetMeshes(), false)[0];
  const end = hit ? hit.point.clone() : camera.position.clone().addScaledVector(_d, 120);
  addTracer(end, id === 'm4a1' ? 0.35 : 1);
  sfx.play(w.sound);
  vmKick = 1; ctrl.pitch += w.kick * (me.scoped ? .3 : 1); ctrl.yaw += (Math.random() - .5) * w.kick * .5;
  if (hit?.object.userData.avatar) applyHit(hit.object.userData.avatar, hit.object.userData.zone, hit.distance, id);
  else if (hit) addImpact(hit.point);
  if (id === 'awm') setScope(false);
  if (me.ammo[id] === 0 && me.reserve[id] > 0) setTimeout(startReload, 250);
}

function swing(id, w) {
  camera.getWorldDirection(_d);
  rc.set(camera.position, _d); rc.near = 0; rc.far = w.range;
  const hit = rc.intersectObjects(targetMeshes(), false)[0];
  if (hit?.object.userData.avatar) applyHit(hit.object.userData.avatar, hit.object.userData.zone, hit.distance, id);
}

/** Calcula o dano (inclui facada nas costas) e aplica no alvo. */
function applyHit(av, zone, dist, id) {
  let back = false;
  if (id === 'knife') {
    const fv = av.forward(_v), fa = _d.set(-Math.sin(ctrl.yaw), 0, -Math.cos(ctrl.yaw));
    const to = _r.set(av.position.x - ctrl.pos.x, 0, av.position.z - ctrl.pos.z).normalize();
    back = fv.dot(fa) > 0.5 && fv.dot(to) > 0;
  }
  const dmg = computeDamage(id, zone, dist, back);
  hud.hitmarker(zone === 'head'); sfx.play(zone === 'head' ? 'head' : 'hit');
  if (av.isBot) {
    if (av.alive) {
      av.health -= dmg;
      if (av.health <= 0) killBot(av, id, zone === 'head');
    }
  } else {
    net.sendHit(av.id, { dmg, zone, w: id, fn: me.name });
  }
}

function addTracer(end, alpha) {
  const start = _v.set(0.2, -0.15, -0.6).applyMatrix4(camera.matrixWorld).clone();
  const g = new THREE.BufferGeometry().setFromPoints([start, end]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: alpha }));
  scene.add(l); fx.push({ o: l, life: 0.07 });
}
function addImpact(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  m.position.copy(p); scene.add(m); fx.push({ o: m, life: 0.15 });
}

// ---------- Bots (modo treino) ----------
const BOT_COLORS = [0xb54a3f, 0x3fb56a, 0xb59c3f, 0x7a3fb5];
function spawnBots(n = 4) {
  for (let i = 0; i < n; i++) {
    const b = new Avatar('bot' + i, 'BOT ' + (i + 1), BOT_COLORS[i % 4], true);
    b.home = pickSpawn(); b.spin = (i % 2 ? 1 : -1) * (0.4 + Math.random() * 0.4);
    b.teleport(...b.home, Math.random() * 6); scene.add(b.group); avatars.set(b.id, b);
  }
}
function killBot(b, id, isHeadshot = false) {
  b.setAlive(false); me.kills++;
  hud.feed(me.name, b.name, WEAPONS[id].name, true);
  if (isHeadshot) sfx.play('reaverkill');
  setTimeout(() => { b.health = 100; b.home = pickSpawn(); b.teleport(...b.home, Math.random() * 6); b.setAlive(true); }, 3000);
}

// ---------- Spawn / morte ----------
function pickSpawn() {
  let best = SPAWNS[0], bestD = -1;
  for (let i = 0; i < 6; i++) {
    const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    let d = 1e9;
    for (const a of avatars.values()) if (a.alive) d = Math.min(d, Math.hypot(a.position.x - s[0], a.position.z - s[2]));
    if (d > bestD) { bestD = d; best = s; }
  }
  return best;
}
function respawn(primaryWeapon) {
  if (!PRIMARY_WEAPONS.includes(primaryWeapon)) return;
  const s = pickSpawn();
  ctrl.setPosition(s[0], s[1], s[2], Math.random() * Math.PI * 2);
  me.primaryWeapon = primaryWeapon; me.idx = SLOTS.indexOf(primaryWeapon);
  me.health = PLAYER.maxHealth; me.alive = true; ctrl.frozen = false; refillAmmo();
  hud.setHealth(me.health); hud.dead(false); equip(me.idx); hud.setWeapon(curId(), me.ammo[curId()], me.reserve[curId()]);
}
function beginLoadoutSelection() {
  loadoutPending = true; ctrl.frozen = true; hud.dead(false); hud.showLoadout(true); setPaused(false);
  if (document.pointerLockElement) document.exitPointerLock?.();
}
function choosePrimary(id) {
  if (!loadoutPending || !PRIMARY_WEAPONS.includes(id)) return;
  loadoutPending = false; hud.showLoadout(false); respawn(id); requestPointerLock();
}
function die(byUid, byName, weaponId, hitZone = '') {
  if (!me.alive) return;
  me.alive = false; me.deaths++; me.respawnT = PLAYER.respawnTime; ctrl.frozen = true; setScope(false);
  hud.dead(true, byName); hud.setHealth(0);
  if (net.enabled) net.sendFeed({ ku: byUid, kn: byName, vu: net.uid, vn: me.name, w: WEAPONS[weaponId]?.name ?? '?', hs: hitZone === 'head' });
}

// ---------- Rede ----------
function colorFor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return new THREE.Color().setHSL((h % 360) / 360, .55, .45).getHex(); }
function setupNet() {
  net.on('join', (uid, s) => {
    const a = new Avatar(uid, s.n || '???', colorFor(uid));
    a.teleport(s.x || 0, s.y || 0, s.z || 0, s.yaw || 0); scene.add(a.group); avatars.set(uid, a); remoteState(a, s);
  }).on('state', (uid, s) => {
    const a = avatars.get(uid); if (a) remoteState(a, s);
  }).on('leave', (uid) => {
    avatars.get(uid)?.dispose(); avatars.delete(uid);
  }).on('hit', (v) => {
    if (!me.alive) return;
    me.health -= Math.max(0, Math.min(100, +v.dmg || 0)); me.lastAttacker = v.fn || '';
    hud.setHealth(me.health); hud.damageFlash(); sfx.play('hurt');
    if (me.health <= 0) die(v.from, v.fn || '?', v.w, v.zone);
  }).on('feed', (v) => {
    hud.feed(v.kn, v.vn, v.w, v.ku === net.uid);
    if (v.ku === net.uid) {
      me.kills++;
      if (v.hs) sfx.play('reaverkill');
    }
  }).on('banned', () => {
    document.exitPointerLock?.(); playing = false; net.leave();
    document.body.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#fff;font:24px sans-serif">Você foi banido deste servidor.</div>';
  });
  net.join(netState());
}
function netState() {
  return {
    x: +ctrl.pos.x.toFixed(2), y: +ctrl.pos.y.toFixed(2), z: +ctrl.pos.z.toFixed(2), yaw: +ctrl.yaw.toFixed(3),
    w: curId(), a: me.alive ? 1 : 0, k: me.kills, d: me.deaths, f: me.fireCount,
  };
}
function remoteState(a, s) {
  a.setTarget(s.x, s.y, s.z, s.yaw);
  if (s.w && WEAPONS[s.w]) a.setWeapon(s.w);
  const alive = !!s.a; if (alive !== a.alive) a.setAlive(alive);
  a.kills = s.k || 0; a.deaths = s.d || 0; a.name = s.n || a.name;
  if (s.f !== undefined && a.fc !== undefined && s.f !== a.fc) {
    const dist = a.position.distanceTo(camera.position);
    sfx.play(WEAPONS[a.weapon]?.sound || 'rifle', Math.max(0, 1 - dist / 90) * (a.weapon === 'm4a1' ? .4 : 1));
  }
  a.fc = s.f;
}

// ---------- Input ----------
addEventListener('keydown', (e) => {
  if (!playing) return;
  if (loadoutPending) {
    if (/^Digit[1-4]$/.test(e.code)) {
      e.preventDefault(); choosePrimary(PRIMARY_WEAPONS[+e.code.slice(5) - 1]);
    }
    return;
  }
  if (e.code === 'Escape') {
    if (document.pointerLockElement !== canvas) { e.preventDefault(); setPaused(true); }
    return;
  }
  if (paused) return;
  if (e.code === 'Tab') { e.preventDefault(); return void (boardOn = true); }
  if (e.repeat) return;
  ctrl.keys.add(e.code);
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') { ctrl.crouching = true; return; }
  if (e.code === 'KeyQ' && me.alive) { toggleKnife(); return; }
  if (e.code === 'KeyF' && me.alive) { hud.openWheel(curId(), [me.primaryWeapon, 'glock', 'knife']); return; }
  if (e.code === 'Digit1' && me.alive) selectWeapon(me.primaryWeapon);
  else if (e.code === 'Digit2' && me.alive) selectWeapon('glock');
  else if (e.code === 'Digit3' && me.alive) selectWeapon('knife');
  else if (e.code === 'KeyR') startReload();
});
addEventListener('keyup', (e) => {
  if (!playing) return;
  ctrl.keys.delete(e.code);
  if (e.code === 'Tab') boardOn = false;
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') ctrl.crouching = false;
  if (e.code === 'KeyF' && hud.wheelOpen) { const id = hud.closeWheel(); selectWeapon(id); }
});
addEventListener('blur', () => ctrl?.keys.clear());
addEventListener('mousemove', (e) => {
  if (!playing || document.pointerLockElement !== canvas) return;
  if (hud.wheelOpen) hud.moveWheel(e.movementX, e.movementY); else ctrl.look(e.movementX, e.movementY);
});
addEventListener('mousedown', (e) => {
  if (!playing || document.pointerLockElement !== canvas) return;
  if (e.button === 0) { mouse.down = true; mouse.edge = true; }
  if (e.button === 2) cycleScope();
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('click', (e) => {
  if (playing && e.target === canvas && document.pointerLockElement !== canvas) requestPointerLock();
});
document.addEventListener('pointerlockchange', () => setPaused(playing && !loadoutPending && document.pointerLockElement !== canvas));
$('resume').addEventListener('click', requestPointerLock);
['setting-volume', 'setting-sensitivity', 'setting-reticle', 'setting-length', 'setting-gap', 'setting-thickness', 'setting-dot-size', 'setting-reticle-color']
  .forEach((id) => $(id).addEventListener('input', updateSettings));
syncSettingsUI(); applySettings();
let boardOn = false;

// ---------- Loop ----------
let last = performance.now(), boardT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (playing && !paused) update(dt);
  renderer.render(scene, camera);
}
function update(dt) {
  if (loadoutPending) return;
  const id = curId(), w = WEAPONS[id];
  if (!me.alive) {
    me.respawnT -= dt; hud.respawn(me.respawnT);
    if (me.respawnT <= 0) beginLoadoutSelection();
  }
  ctrl.update(dt, w.speedMult || 1);

  me.cooldown = Math.max(0, me.cooldown - dt);
  if (me.reloadT > 0) { me.reloadT -= dt; if (me.reloadT <= 0) finishReload(); }
  if (mouse.down && (w.auto || mouse.edge)) fire();
  mouse.edge = false;

  // viewmodel: coice, balanço, recarga
  vmKick = Math.max(0, vmKick - dt * 9);
  if (vm) {
    const bob = ctrl.moving ? Math.sin(time * 10) * 0.012 : 0;
    const reload = me.reloadT > 0 ? Math.sin(Math.min(1, (1 - me.reloadT / (w.reload || 1))) * Math.PI) : 0;
    vm.position.set(
      VIEWMODEL_POSITION.x + bob * .5,
      VIEWMODEL_POSITION.y + Math.abs(bob) - reload * .25,
      VIEWMODEL_POSITION.z + vmKick * 0.06,
    );
    vm.rotation.set(vmKick * 0.08 + reload * .6, 0, 0);
    if (w.melee) vm.rotation.x -= vmKick * 1.0;
  }

  for (const a of avatars.values()) {
    if (a.isBot) a.group.rotation.y += (a.spin || 0) * dt; else a.update(dt);
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    fx[i].life -= dt;
    if (fx[i].life <= 0) { scene.remove(fx[i].o); fx[i].o.geometry.dispose(); fx.splice(i, 1); }
  }

  if (net.enabled && net.me) net.sendState(netState(), NET.sendHz);

  boardT -= dt;
  if (boardOn && boardT <= 0) { boardT = 0.4; hud.board(true, scoreRows()); }
  if (!boardOn) hud.board(false);
}
function scoreRows() {
  const rows = [{ name: me.name, k: me.kills, d: me.deaths, me: true }];
  for (const a of avatars.values()) if (!a.isBot) rows.push({ name: a.name, k: a.kills, d: a.deaths });
  return rows.sort((a, b) => b.k - a.k);
}

// ---------- Início ----------
const msg = (t) => { $('msg').textContent = t; };
async function boot() {
  try {
    await Promise.all([loadWeaponModels(), sfx.loadAssets()]);
    map = await loadMap(scene, (p) => { $('loadfill').style.width = (p * 100).toFixed(0) + '%'; });
  } catch (err) {
    $('loadtxt').textContent = 'Erro ao carregar o mapa: ' + err.message; return;
  }
  ctrl = new Controller(camera, map);
  applySettings();
  $('loadbar').classList.add('hidden'); $('loadtxt').classList.add('hidden');
  $('form').classList.remove('hidden');
  $('mode').textContent = net.enabled ? 'Online — Firebase conectado ao jogar' : 'Modo offline: Firebase não configurado (treino com bots)';
  try { $('nick').value = localStorage.getItem('nick') || ''; } catch { /* sem storage */ }
  requestAnimationFrame(frame);
  window.__game = { THREE, scene, camera, map, ctrl, me, avatars, fire, applyHit, equip, hud, get playing() { return playing; } };
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nick = $('nick').value.trim();
  if (!Net.validName(nick)) return msg('Apelido inválido: use 3–16 letras, números ou _.');
  $('play').disabled = true; msg('');
  try {
    if (net.enabled) {
      msg('Conectando…');
      await net.init();
      if (await net.isBanned()) { msg('Esta conta está banida.'); return; }
      if (!(await net.claimName(nick))) { msg('Esse apelido já está em uso.'); $('play').disabled = false; return; }
    }
  } catch (err) { msg('Falha ao conectar: ' + err.message); $('play').disabled = false; return; }
  me.name = nick; try { localStorage.setItem('nick', nick); } catch { /* */ }
  start();
});

function start() {
  $('menu').classList.add('hidden'); hud.show(true);
  sfx.unlock(); playing = true; setPaused(false);
  if (net.enabled) setupNet(); else spawnBots();
  beginLoadoutSelection();
}

document.querySelectorAll('[data-primary]').forEach((button) => {
  button.addEventListener('click', () => choosePrimary(button.dataset.primary));
});

boot();
