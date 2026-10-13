import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAP_SCALE } from './config.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Carrega o GLB, escala para metros e expõe consultas de colisão por raycast. */
export async function loadMap(scene, onProgress) {
  const gltf = await new GLTFLoader().loadAsync('assets/dust2.glb', (e) => {
    if (e.total) onProgress?.(e.loaded / e.total);
  });
  const root = gltf.scene;
  root.scale.setScalar(MAP_SCALE);
  root.updateMatrixWorld(true);
  // Centraliza em X/Z e apoia o ponto mais baixo em y=0
  const b0 = new THREE.Box3().setFromObject(root), c0 = b0.getCenter(new THREE.Vector3());
  root.position.set(-c0.x, -b0.min.y, -c0.z);
  root.updateMatrixWorld(true);

  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 4; });
  });
  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const rc = new THREE.Raycaster();
  const n = new THREE.Vector3();

  const map = {
    root, meshes, bounds: box,
    /** Primeiro acerto no mapa: {distance, point, normal} ou null. */
    cast(origin, dir, far = 1000) {
      rc.set(origin, dir); rc.near = 0; rc.far = far;
      const h = rc.intersectObjects(meshes, false)[0];
      if (!h) return null;
      n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      return { distance: h.distance, point: h.point, normal: n.clone() };
    },
    /** Altura do chão logo abaixo de (x,z), partindo de yTop, ou null. */
    groundY(x, z, yTop, maxDrop) {
      const h = map.cast(new THREE.Vector3(x, yTop, z), DOWN, maxDrop);
      return h ? h.point.y : null;
    },
    /** Todos os pisos (múltiplos andares) em (x,z): [{y, headroom}] de cima para baixo. */
    floors(x, z) {
      rc.set(new THREE.Vector3(x, box.max.y + 5, z), DOWN); rc.near = 0; rc.far = 1000;
      const hits = rc.intersectObjects(meshes, false);
      const out = [];
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        if (Math.abs(n.y) < 0.7) continue;
        const above = i > 0 ? hits[i - 1].point.y - h.point.y : Infinity;
        out.push({ y: h.point.y, headroom: above });
      }
      return out;
    },
    ceilingY(x, y, z, maxUp) {
      const h = map.cast(new THREE.Vector3(x, y, z), UP, maxUp);
      return h ? h.point.y : null;
    },
  };
  return map;
}
