import * as THREE from 'three';
import { PLAYER } from './config.js';
import { buildWorldGun } from './weapons.js';

const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: .8 });
const pants = new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: .9 });

function tag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.font = 'bold 34px sans-serif'; x.textAlign = 'center';
  x.lineWidth = 6; x.strokeStyle = '#000'; x.strokeText(text, 128, 44);
  x.fillStyle = '#fff'; x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.2, .3, 1); s.position.y = 2.05; s.renderOrder = 10; return s;
}

/**
 * Personagem humano (blocos). Origem = pés, frente = -Z.
 * Cada malha de hitbox leva userData.zone e userData.avatar.
 */
export class Avatar {
  constructor(id, name, color = 0x3f6fb5, isBot = false) {
    this.id = id; this.name = name; this.isBot = isBot;
    this.health = PLAYER.maxHealth; this.alive = true;
    this.kills = 0; this.deaths = 0; this.weapon = 'ak47';
    this.group = new THREE.Group();
    this.body = new THREE.Group(); this.group.add(this.body);
    this.hitMeshes = [];
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: .8 });

    const part = (geo, mat, x, y, z, zone) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      m.userData.zone = zone; m.userData.avatar = this;
      this.body.add(m); this.hitMeshes.push(m); return m;
    };
    part(new THREE.BoxGeometry(.17, .85, .2), pants, -.1, .425, 0, 'limb');
    part(new THREE.BoxGeometry(.17, .85, .2), pants, .1, .425, 0, 'limb');
    part(new THREE.BoxGeometry(.40, .30, .24), cloth, 0, 1.0, 0, 'belly');
    part(new THREE.BoxGeometry(.44, .38, .26), cloth, 0, 1.34, 0, 'chest');
    part(new THREE.BoxGeometry(.10, .55, .12), cloth, -.28, 1.26, 0, 'limb');
    part(new THREE.BoxGeometry(.10, .55, .12), cloth, .28, 1.26, 0, 'limb');
    part(new THREE.SphereGeometry(.14, 14, 10), skin, 0, 1.65, 0, 'head');
    const nose = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .06), new THREE.MeshStandardMaterial({ color: 0x222 }));
    nose.position.set(0, 1.66, -.15); this.body.add(nose);

    this.gunSlot = new THREE.Group(); this.gunSlot.position.set(.2, 1.2, -.3); this.body.add(this.gunSlot);
    this.setWeapon('ak47');

    this.nameTag = tag(name); this.group.add(this.nameTag);
    this.target = new THREE.Vector3(); this.targetYaw = 0; this.yaw = 0;
  }
  setWeapon(id) {
    if (this.weapon === id && this.gunSlot.children.length) return;
    this.weapon = id; this.gunSlot.clear();
    this.gunSlot.add(buildWorldGun(id));
  }
  get position() { return this.group.position; }
  /** Estado vindo da rede (interpolado em update). */
  setTarget(x, y, z, yaw) { this.target.set(x, y, z); this.targetYaw = yaw; }
  teleport(x, y, z, yaw = 0) { this.group.position.set(x, y, z); this.target.set(x, y, z); this.yaw = this.targetYaw = yaw; this.group.rotation.y = yaw; }
  update(dt) {
    if (this.isBot) return;
    const k = 1 - Math.exp(-14 * dt);
    this.group.position.lerp(this.target, k);
    let d = this.targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * k; this.group.rotation.y = this.yaw;
  }
  setAlive(a) {
    this.alive = a;
    this.body.rotation.x = a ? 0 : -Math.PI / 2;
    this.body.position.y = a ? 0 : .2;
    this.nameTag.visible = a;
  }
  /** Direção "para frente" no plano XZ. */
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y)); }
  dispose() { this.group.parent?.remove(this.group); }
}
