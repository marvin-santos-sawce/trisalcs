// Constantes globais. Unidades do jogo = metros.
// O GLB (Sketchfab) já traz uma matriz de 1/75 no nó raiz; 1 unidade Source = 1.905 cm.
// Fator extra sobre a cena para o mapa ficar em metros reais (~85 m x 100 m):
export const MAP_SCALE = 0.01905 * 75;

export const PLAYER = {
  eye: 1.65,
  crouchEye: 1.1,
  height: 1.8,
  crouchHeight: 1.15,
  radius: 0.35,
  step: 0.55,       // altura máxima de degrau
  walk: 5.2,        // m/s
  crouchWalk: 2.5,
  jump: 6.2,
  gravity: 20,
  maxHealth: 100,
  respawnTime: 3,
};

export const NET = { sendHz: 15 };
