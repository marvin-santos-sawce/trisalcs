import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud'); this.wheelEl = $('wheel');
    this.wheelOpen = false; this.wheelIds = []; this.cur = this.sel = 0; this.cx = 0; this.cy = 0;
    this.slotEls = [];
    this.dot = document.createElement('div'); this.dot.id = 'wcursor'; this.wheelEl.appendChild(this.dot);
    this.crosshair = $('crosshair');
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  showLoadout(v) { $('loadout').classList.toggle('hidden', !v); }

  setReticle({ style, length, gap, thickness, dotSize, color }) {
    this.crosshair.classList.toggle('dot-only', style === 'dot');
    this.crosshair.classList.toggle('cross-only', style !== 'dot');
    this.crosshair.style.setProperty('--reticle-length', `${length}px`);
    this.crosshair.style.setProperty('--reticle-gap', `${gap}px`);
    this.crosshair.style.setProperty('--reticle-thickness', `${thickness}px`);
    this.crosshair.style.setProperty('--reticle-dot-size', `${dotSize}px`);
    this.crosshair.style.setProperty('--reticle-color', color);
  }

  // --- Roda de armas ---
  openWheel(currentId, ids) {
    this.wheelOpen = true; this.wheelIds = ids;
    this.cur = this.sel = Math.max(0, ids.indexOf(currentId)); this.cx = this.cy = 0;
    this.slotEls.forEach((e) => e.remove());
    const step = 360 / ids.length, radius = 135;
    this.slotEls = ids.map((id, i) => {
      const a = (-90 + i * step) * Math.PI / 180;
      const d = document.createElement('div'); d.className = 'slot';
      d.style.left = Math.cos(a) * radius + 'px'; d.style.top = Math.sin(a) * radius + 'px';
      d.innerHTML = `${WEAPONS[id].name}<small>${i + 1} · ${WEAPONS[id].tag}</small>`;
      this.wheelEl.insertBefore(d, this.dot); return d;
    });
    this.wheelEl.classList.remove('hidden'); this._paintWheel();
  }
  moveWheel(dx, dy) {
    if (!this.wheelOpen) return;
    this.cx += dx; this.cy += dy;
    const m = Math.hypot(this.cx, this.cy), max = 150;
    if (m > max) { this.cx *= max / m; this.cy *= max / m; }
    if (m > 30) {
      const deg = Math.atan2(this.cy, this.cx) * 180 / Math.PI;
      const step = 360 / this.wheelIds.length;
      this.sel = Math.round((((deg + 90) % 360) + 360) % 360 / step) % this.wheelIds.length;
    }
    this._paintWheel();
  }
  closeWheel() {
    this.wheelOpen = false; this.wheelEl.classList.add('hidden'); return this.wheelIds[this.sel];
  }
  _paintWheel() {
    this.slotEls.forEach((e, i) => { e.classList.toggle('sel', i === this.sel); e.classList.toggle('cur', i === this.cur); });
    this.dot.style.left = this.cx + 'px'; this.dot.style.top = this.cy + 'px';
  }

  // --- Status ---
  setHealth(h) {
    $('hpval').textContent = Math.max(0, Math.ceil(h));
    $('hpbar').style.width = Math.max(0, h) + '%';
    $('hpbar').style.background = h > 60 ? '#5fd16a' : h > 30 ? '#e8b640' : '#e5483c';
  }
  setWeapon(id, ammo, reserve) {
    const w = WEAPONS[id]; $('wname').textContent = w.name;
    const reserveText = Number.isFinite(reserve) ? `${ammo} / ${reserve}` : `${ammo} / ∞`;
    $('ammoval').textContent = w.melee ? '—' : reserveText;
  }
  setScoped(on) { $('scope').classList.toggle('hidden', !on); $('crosshair').style.display = on ? 'none' : ''; }
  hitmarker(head) {
    const h = $('hitmarker'); h.className = 'on' + (head ? ' head' : '');
    requestAnimationFrame(() => requestAnimationFrame(() => { h.className = head ? 'head' : ''; }));
  }
  damageFlash() {
    const d = $('damage'); d.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove('on')));
  }
  feed(killer, victim, weapon, mine) {
    const f = document.createElement('div'); if (mine) f.className = 'me';
    f.innerHTML = `<b></b> [${weapon}] <span></span>`;
    f.querySelector('b').textContent = killer; f.querySelector('span').textContent = victim;
    $('feed').appendChild(f); setTimeout(() => f.remove(), 6000);
    while ($('feed').children.length > 5) $('feed').firstChild.remove();
  }
  dead(show, by = '') { $('dead').classList.toggle('hidden', !show); $('deadby').textContent = by ? `Eliminado por ${by}` : ''; }
  respawn(t) { $('respawn').textContent = t > 0 ? `Renascendo em ${Math.ceil(t)}…` : ''; }
  board(show, rows = []) {
    const b = $('board'); b.classList.toggle('hidden', !show); if (!show) return;
    b.innerHTML = '<table><tr><th>Jogador</th><th>Abates</th><th>Mortes</th></tr>' +
      rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td></td><td>${r.k}</td><td>${r.d}</td></tr>`).join('') + '</table>';
    [...b.querySelectorAll('tr')].slice(1).forEach((tr, i) => { tr.firstChild.textContent = rows[i].name; });
  }
}
