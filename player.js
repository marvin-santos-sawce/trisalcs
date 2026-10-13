import * as THREE from 'three';
import { PLAYER } from './config.js';
import * as sfx from './audio.js';

const DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2; return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
});
const WALL_HEIGHTS = [0.5, 1.0, 1.6];

/** Controle em primeira pessoa com colisão por raycast contra o mapa. */
export class Controller {
  constructor(camera, map) {
    this.camera = camera; this.map = map;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = false;
    this.keys = new Set(); this.sens = 0.0022; this.sensMult = 1; this.frozen = false;
    this.crouching = false; this.footstepTimer = 0;
    camera.rotation.order = 'YXZ';
    this._o = new THREE.Vector3();
  }

  setPosition(x, y, z, yaw = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; this.crouching = false;
  }

  look(dx, dy) {
    this.yaw -= dx * this.sens * this.sensMult;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * this.sens * this.sensMult));
  }

  get moving() { return this.onGround && (Math.abs(this.vel.x) + Math.abs(this.vel.z)) > 1; }

  update(dt, speedMult = 1) {
    const k = this.keys, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    let fx = 0, fz = 0;
    if (!this.frozen) {
      const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      fx = -s * f + c * r; fz = -c * f - s * r;
      const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
    }
    const speed = (this.crouching ? PLAYER.crouchWalk : PLAYER.walk) * speedMult;
    const acc = (this.onGround ? 70 : 12) * dt;
    this.vel.x += Math.max(-acc, Math.min(acc, fx * speed - this.vel.x));
    this.vel.z += Math.max(-acc, Math.min(acc, fz * speed - this.vel.z));

    if (this.onGround && k.has('Space') && !this.frozen) { this.vel.y = PLAYER.jump; this.onGround = false; }
    this.vel.y -= PLAYER.gravity * dt;

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    if (Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.01) this._walls();
    this._vertical(dt);
    this._camera();

    if (this.moving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        sfx.play('footstep', this.crouching ? 0.45 : 0.75);
        this.footstepTimer = this.crouching ? 0.58 : 0.42;
      }
    } else this.footstepTimer = 0;
  }

  _walls() {
    const R = PLAYER.radius, o = this._o;
    for (let it = 0; it < 2; it++) {
      for (const h of WALL_HEIGHTS) for (const d of DIRS) {
        o.set(this.pos.x, this.pos.y + h, this.pos.z);
        const hit = this.map.cast(o, d, R);
        if (!hit) continue;
        const push = R - hit.distance;
        this.pos.x -= d.x * push; this.pos.z -= d.z * push;
        const vn = this.vel.x * d.x + this.vel.z * d.z; // anula velocidade contra a parede
        if (vn > 0) { this.vel.x -= d.x * vn; this.vel.z -= d.z * vn; }
      }
    }
  }

  _vertical(dt) {
    const step = PLAYER.step;
    const reach = step + (this.onGround ? 0.35 : Math.max(0, -this.vel.y * dt) + 0.02);
    const gy = this.map.groundY(this.pos.x, this.pos.z, this.pos.y + step, reach);
    if (gy !== null && this.vel.y <= 0 && this.pos.y <= gy + (this.onGround ? 0.35 : 0.02)) {
      this.pos.y = gy; this.vel.y = 0; this.onGround = true;
    } else this.onGround = false;

    const bodyHeight = this.crouching ? PLAYER.crouchHeight : PLAYER.height;
    if (this.vel.y > 0) {
      const cy = this.map.ceilingY(this.pos.x, this.pos.y + 1.4, this.pos.z, bodyHeight - 1.4 + 0.1);
      if (cy !== null) { this.vel.y = 0; this.pos.y = Math.min(this.pos.y, cy - bodyHeight - 0.01); }
    }
  }

  _camera() {
    const eye = this.crouching ? PLAYER.crouchEye : PLAYER.eye;
    this.camera.position.set(this.pos.x, this.pos.y + eye, this.pos.z);
    this.camera.rotation.set(this.pitch + (this.kick || 0), this.yaw, 0);
  }
}
