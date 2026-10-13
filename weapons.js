import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===== Regras de dano (ajuste aqui) =====
// Zonas: head | chest | belly | limb (pernas e braços)
export const SILENCED_HEAD_DIST = 25; // "X metros" do M4A1: acima disso a cabeça precisa de 2 tiros
export const KNIFE_FRONT_DMG = 40;    // dano da faca fora das costas (não definido no briefing)

// Ordem da roda (sentido horário a partir do topo)
export const SLOTS = ['ak47', 'm4a1', 'awm', 'deagle', 'glock'];
export const PRIMARY_WEAPONS = ['ak47', 'm4a1', 'deagle', 'awm'];

export const WEAPONS = {
  ak47: {
    name: 'AK-47', tag: 'Fuzil', auto: true, rpm: 600, mag: 30, reserve: 90, reload: 2.4,
    spread: 0.012, kick: 0.014, sound: 'rifle',
    dmg: { head: 100, chest: 30, belly: 30, limb: 30 },
  },
  m4a1: {
    name: 'M4A1-S', tag: 'Silenciada', auto: true, rpm: 680, mag: 20, reserve: 90, reload: 2.2,
    spread: 0.010, kick: 0.010, sound: 'silenced',
    dmg: { head: 100, chest: 30, belly: 30, limb: 30 }, // head cai p/ 80 acima de SILENCED_HEAD_DIST
  },
  awm: {
    name: 'AWM', tag: 'Sniper', auto: false, rpm: 40, mag: 5, reserve: 20, reload: 3.4,
    spread: 0.09, scopedSpread: 0.0001, kick: 0.08, sound: 'sniper', scopeFov: 18, scopeFov2: 9,
    dmg: { head: 100, chest: 100, belly: 90, limb: 60 }, // 2 tiros da barriga p/ baixo
  },
  deagle: {
    name: 'Desert Eagle', tag: 'Pistola', auto: false, rpm: 240, mag: 7, reserve: 35, reload: 2.0,
    spread: 0.008, kick: 0.03, sound: 'pistol',
    dmg: { head: 100, chest: 34, belly: 34, limb: 33 },
  },
  glock: {
    name: 'Glock 18', tag: 'Pistola', auto: false, rpm: 1500, mag: 12, reserve: 120, reload: 1.5,
    spread: 0.009, kick: 0.012, sound: 'glock',
    dmg: { head: 80, chest: 12, belly: 12, limb: 12 },
  },
  knife: {
    name: 'Faca', tag: 'Corpo a corpo', melee: true, auto: false, rpm: 90, range: 2.2,
    speedMult: 1.3, sound: 'knife',
    dmg: { head: KNIFE_FRONT_DMG, chest: KNIFE_FRONT_DMG, belly: KNIFE_FRONT_DMG, limb: KNIFE_FRONT_DMG },
  },
};

/** Dano final de um acerto. dist em metros; backstab só vale para a faca. */
export function computeDamage(id, zone, dist, backstab = false) {
  const w = WEAPONS[id];
  if (id === 'knife') return backstab ? 100 : KNIFE_FRONT_DMG;
  if (id === 'm4a1' && zone === 'head') return dist > SILENCED_HEAD_DIST ? 80 : 100;
  return w.dmg[zone] ?? w.dmg.limb;
}

// ===== Modelos simples (placeholder) =====
const M = (c, m = 0.6, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
const box = (g, w, h, d, x, y, z, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); g.add(m); return m;
};

let ak47Model = null;
let m4a1Model = null;
let awmModel = null;
let deagleModel = null;
let glockModel = null;

export async function loadWeaponModels() {
  for (const [id, path] of [
    ['ak47', 'assets/ak_47_assault_rifle.glb'],
    ['m4a1', 'assets/csgo-m4a1-s_scandinavian.glb'],
    ['awm', 'assets/awp_counter_strike_2.glb'],
    ['deagle', 'assets/cs-go-desert-eagle-_rapira.glb'],
    ['glock', 'assets/g18.glb'],
  ]) {
    try {
      const gltf = await new GLTFLoader().loadAsync(path);
      if (id === 'ak47') ak47Model = gltf.scene;
      else if (id === 'm4a1') m4a1Model = gltf.scene;
      else if (id === 'awm') awmModel = gltf.scene;
      else if (id === 'deagle') deagleModel = gltf.scene;
      else if (id === 'glock') glockModel = gltf.scene;
    } catch (error) {
      const names = { ak47: 'AK-47', m4a1: 'M4A1-S', awm: 'AWM', deagle: 'Desert Eagle', glock: 'Glock 18' };
      console.warn(`${names[id] || id} model unavailable; using the built-in model.`, error);
    }
  }
}

function buildImportedModel(source) {
  const model = cloneWeaponModel(source);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const root = new THREE.Group();
  const alignment = new THREE.Group();
  alignment.add(model);
  root.add(alignment);
  const longestAxis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  if (longestAxis === 'x') {
    alignment.rotation.y = Math.PI / 2;
    root.rotation.y = Math.PI;
  } else if (longestAxis === 'y') {
    alignment.rotation.x = -Math.PI / 2;
    root.rotation.y = 0;
  } else {
    root.rotation.y = Math.PI;
  }
  root.scale.setScalar(0.72 / Math.max(size.x, size.y, size.z));
  return root;
}

function buildAk47Model() {
  const model = buildImportedModel(ak47Model);
  model.rotation.z = Math.PI / 2;
  model.rotation.x = Math.PI / 2;
  model.rotation.y = -Math.PI / 2;
  const alignment = new THREE.Group();
  alignment.rotation.y = -Math.PI / 2;
  alignment.add(model);
  return scaleWeaponModel(alignment, 1.5);
}

function buildGlockModel() {
  const model = buildImportedModel(glockModel);
  model.rotation.z = Math.PI;
  model.rotation.x = Math.PI / 2;
  return scaleWeaponModel(model, 0.55);
}

function cloneWeaponModel(source) {
  const clone = source.clone(true);
  const sourceNodes = [];
  const cloneNodes = [];
  source.traverse((node) => sourceNodes.push(node));
  clone.traverse((node) => cloneNodes.push(node));
  const clonedNodes = new Map(sourceNodes.map((node, index) => [node, cloneNodes[index]]));

  source.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const skinnedClone = clonedNodes.get(node);
    const bones = node.skeleton.bones.map((bone) => {
      const clonedBone = clonedNodes.get(bone);
      if (!clonedBone) throw new Error(`Missing cloned bone "${bone.name}" in weapon model.`);
      return clonedBone;
    });
    skinnedClone.bind(
      new THREE.Skeleton(bones, node.skeleton.boneInverses.map((matrix) => matrix.clone())),
      skinnedClone.bindMatrix,
    );
  });

  return clone;
}

function scaleWeaponModel(model, scale) {
  const wrapper = new THREE.Group();
  model.scale.multiplyScalar(scale);
  wrapper.add(model);
  return wrapper;
}

export function buildViewModel(id) {
  const g = new THREE.Group();
  const dark = M(0x1d1d1f), wood = M(0x7a4a22, 0.1, 0.8), steel = M(0x8a8f96, 0.9, 0.3), tan = M(0xb99b6b, 0.2, 0.7);
  switch (id) {
    case 'ak47':
      if (ak47Model) return buildAk47Model();
      box(g, .05, .07, .55, 0, 0, 0, dark); box(g, .04, .04, .35, 0, .01, -.42, steel);
      box(g, .05, .06, .22, 0, -.01, .3, wood); box(g, .045, .13, .07, 0, -.1, .02, wood); break;
    case 'm4a1':
      if (m4a1Model) return scaleWeaponModel(buildImportedModel(m4a1Model), 1.3);
      box(g, .05, .08, .55, 0, 0, 0, dark); box(g, .035, .035, .3, 0, .01, -.4, dark);
      box(g, .05, .05, .22, 0, -.005, -.64, M(0x2b2b2e)); box(g, .045, .12, .06, 0, -.1, .04, dark); box(g, .05, .05, .2, 0, -.02, .32, dark); break;
    case 'awm':
      if (awmModel) return scaleWeaponModel(buildImportedModel(awmModel), 1.25);
      box(g, .05, .08, .8, 0, 0, 0, M(0x2d3a2a)); box(g, .025, .025, .6, 0, .01, -.7, steel);
      box(g, .045, .05, .2, 0, .08, -.02, dark); box(g, .05, .1, .25, 0, -.02, .45, M(0x2d3a2a)); break;
    case 'deagle':
      if (deagleModel) return scaleWeaponModel(buildImportedModel(deagleModel), 0.55);
      box(g, .045, .09, .26, 0, 0, 0, steel); box(g, .04, .12, .07, 0, -.09, .1, dark); break;
    case 'glock':
      if (glockModel) return buildGlockModel();
      box(g, .036, .052, .23, 0, 0, -.02, dark);
      box(g, .032, .115, .068, 0, -.07, .045, M(0x181819, 0.2, 0.8));
      box(g, .026, .02, .06, 0, -.042, -.018, dark);
      box(g, .014, .014, .06, 0, .005, -.14, steel); break;
    case 'knife':
      box(g, .025, .035, .12, 0, 0, .06, dark); box(g, .008, .05, .24, 0, 0, -.12, M(0xd8dde2, 1, .2)); break;
  }
  if (id === 'm4a1') return scaleWeaponModel(g, 1.3);
  return g;
}

export function buildWorldGun(id) {
  const g = buildViewModel(id);
  const s = id === 'knife' ? 1.0 : 1.0;
  g.scale.setScalar(s);
  return g;
}
