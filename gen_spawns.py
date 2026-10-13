"""Gera js/spawns.js: varredura (flood-fill) das áreas caminháveis do mapa no Chromium headless.
Uso: (servidor em :8123 servindo a pasta do jogo)  python3 tools/gen_spawns.py
Requer: pip install playwright  (+ chromium)"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

JS = r"""
() => {
  const g = window.__game, map = g.map, T = g.THREE, b = map.bounds;
  const S = 1.0, x0 = Math.ceil(b.min.x), z0 = Math.ceil(b.min.z);
  const nx = Math.floor(b.max.x - x0), nz = Math.floor(b.max.z - z0);
  const nodes = [], cell = new Map();
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = x0 + i * S, z = z0 + j * S;
    const fl = map.floors(x, z).filter(f => f.headroom >= 1.9);
    const ids = fl.map(f => { nodes.push({ x, z, y: f.y, i, j, c: -1 }); return nodes.length - 1; });
    if (ids.length) cell.set(i + ',' + j, ids);
  }
  const blocked = (a, dx, dz) => {
    for (const h of [0.6, 1.4]) {
      const hit = map.cast(new T.Vector3(a.x, a.y + h, a.z), new T.Vector3(dx, 0, dz), S + 0.2);
      if (hit) return true;
    }
    return false;
  };
  let comp = 0; const sizes = [];
  for (let s = 0; s < nodes.length; s++) {
    if (nodes[s].c >= 0) continue;
    const q = [s]; nodes[s].c = comp; let n = 0;
    while (q.length) {
      const a = nodes[q.pop()]; n++;
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ids = cell.get((a.i + dx) + ',' + (a.j + dz)); if (!ids) continue;
        let best = -1, bd = 0.5;
        for (const id of ids) { const d = Math.abs(nodes[id].y - a.y); if (d <= bd) { bd = d; best = id; } }
        if (best < 0 || nodes[best].c >= 0) continue;
        if (blocked(a, dx, dz)) continue;
        nodes[best].c = comp; q.push(best);
      }
    }
    sizes.push(n); comp++;
  }
  const main = sizes.indexOf(Math.max(...sizes));
  // folga de 0.9 m das paredes
  const ok = nodes.filter(n => n.c === main && ![...Array(8).keys()].some(k => {
    const a = k / 8 * Math.PI * 2;
    return map.cast(new T.Vector3(n.x, n.y + 1.0, n.z), new T.Vector3(Math.cos(a), 0, Math.sin(a)), 0.9);
  }));
  // amostragem do ponto mais distante (espalha os spawns)
  const pick = [ok[Math.floor(ok.length / 2)]];
  while (pick.length < 24) {
    let best = null, bd = -1;
    for (const n of ok) {
      let d = 1e9; for (const p of pick) d = Math.min(d, Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 3);
      if (d > bd) { bd = d; best = n; }
    }
    if (bd < 7) break; pick.push(best);
  }
  return { comps: sizes.length, mainSize: sizes[main], walkable: ok.length, spawns: pick.map(p => [+p.x.toFixed(2), +(p.y + 0.02).toFixed(2), +p.z.toFixed(2)]) };
}
"""

async def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
                                    executable_path=os.environ.get('CHROME'))
        pg = await b.new_page()
        await pg.goto('http://localhost:8123/index.html')
        await pg.wait_for_function('window.__game', timeout=60000)
        r = await pg.evaluate(JS)
        print({k: v for k, v in r.items() if k != 'spawns'}, len(r['spawns']))
        with open(os.path.join(root, 'js', 'spawns.js'), 'w') as f:
            f.write('// Gerado por tools/gen_spawns.py (flood-fill sobre o mapa). [x, y, z] em metros.\n')
            f.write('export const SPAWNS = ' + json.dumps(r['spawns']) + ';\n')
        await b.close()
asyncio.run(main())
