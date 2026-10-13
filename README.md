# Dust FFA — FPS 3D no navegador (Three.js)

## Rodar
```bash
cd fps-game
python3 -m http.server 8123      # ou: npx serve
# abra http://localhost:8123
```
Sem Firebase configurado o jogo roda em **modo offline** (treino com 4 bots giratórios).

## Controles
WASD mover · Espaço pular · Mouse mirar · Clique atirar · RMB mira (AWM) · R recarregar
Ao nascer, escolha uma arma principal (1–4); durante a vida, **1** seleciona essa arma, **2** a Glock e **3** a faca.
**F (segurar)** abre a roda entre essas três armas · **Q** alterna para a faca · Tab placar

## Regras de dano (js/weapons.js)
| Arma | Cabeça | Peito | Barriga/pernas/braços |
|---|---|---|---|
| AK-47 | 1 tiro | 30 | 30 |
| M4A1-S | 1 tiro até 25 m, 2 tiros acima | 30 | 30 |
| AWM | 1 tiro | 1 tiro | 50 (2 tiros) |
| Desert Eagle | 1 tiro | 50 | 50 |
| Glock 18 | 80 | 12 | 12 |
| Faca | 40 | 40 | 40 — **nas costas: mata** (+30% velocidade) |

## Firebase
1. Console Firebase → criar projeto → **Authentication → Anonymous** (ativar).
2. **Realtime Database** → criar → aba *Regras* → colar `database.rules.json`.
3. Configurações do projeto → app Web → copiar config para `js/firebase-config.js`.
4. Seu admin: em `admins/<SEU_UID>` = `true` (UID aparece em Authentication → Usuários).
5. **Banir**: criar `bans/<UID_DO_JOGADOR>` = `true` (o UID está em `players/<uid>` ao lado do nome). O jogador é expulso na hora e as escritas dele passam a ser negadas.

## Regenerar spawns
`python3 tools/gen_spawns.py` (precisa do servidor rodando e `pip install playwright`).

## Créditos
Mapa "de_dust2 - CS map" por vrchris — CC-BY-4.0 (https://sketchfab.com/3d-models/de-dust2-cs-map-056008d59eb849a29c0ab6884c0c3d87).
