// Sons sintetizados (sem arquivos). Troque por .ogg/.mp3 quando tiver assets.
let ctx, noise, master;
let rifleBuffer = null;
let silencedBuffer = null;
let sniperBuffer = null;
let zoomBuffer = null;
let pistolBuffer = null;
let glockBuffer = null;
let reloadBuffer = null;
let reaverBuffer = null;
let volume = 0.7;
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export async function loadAssets() {
  for (const [kind, path] of [
    ['rifle', 'assets/ak-47-mp3.mp3'],
    ['silenced', 'assets/m4a1_silencer_01.mp3'],
    ['sniper', 'assets/cs_go-awp-sound.mp3'],
    ['zoom', 'assets/awp-zoom-sound-effect-cs-go.mp3'],
    ['pistol', 'assets/desert-eagle-cs-sound.mp3'],
    ['glock', 'assets/wpn_45_smg_2d_01.mp3'],
    ['reload', 'assets/reload.mp3'],
    ['reaverkill', 'assets/reaverkill1.mp3'],
  ]) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      const buffer = await ac().decodeAudioData(data);
      if (kind === 'rifle') rifleBuffer = buffer;
      else if (kind === 'silenced') silencedBuffer = buffer;
      else if (kind === 'sniper') sniperBuffer = buffer;
      else if (kind === 'zoom') zoomBuffer = buffer;
      else if (kind === 'pistol') pistolBuffer = buffer;
      else if (kind === 'glock') glockBuffer = buffer;
      else if (kind === 'reload') reloadBuffer = buffer;
      else if (kind === 'reaverkill') reaverBuffer = buffer;
    } catch (error) {
      const names = { rifle: 'AK-47', silenced: 'M4A1-S', sniper: 'AWM', zoom: 'AWM Zoom', pistol: 'Desert Eagle', glock: 'Glock 18', reload: 'Reload', reaverkill: 'Reaver Kill' };
      console.warn(`${names[kind] || kind} sound unavailable; using the synthesized sound.`, error);
    }
  }
}

function playBuffer(buffer, vol, pan, rate = 1) {
  if (!buffer) return false;
  const a = ac(), source = a.createBufferSource(), gain = a.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  gain.gain.value = vol;
  const p = a.createStereoPanner ? a.createStereoPanner() : null;
  source.connect(gain);
  if (p) { p.pan.value = pan; gain.connect(p).connect(master); }
  else gain.connect(master);
  source.start();
  return true;
}

function burst({ dur, freq, q = 1, type = 'lowpass', vol = 0.4, pan = 0, thump = 0 }) {
  const a = ac(), t = a.currentTime;
  const src = a.createBufferSource(); src.buffer = noise;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = a.createStereoPanner ? a.createStereoPanner() : null; if (p) p.pan.value = pan;
  src.connect(f).connect(g); (p ? g.connect(p).connect(master) : g.connect(master));
  src.start(t); src.stop(t + dur);
  if (thump) {
    const o = a.createOscillator(), og = a.createGain();
    o.frequency.setValueAtTime(thump, t); o.frequency.exponentialRampToValueAtTime(40, t + dur);
    og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og).connect(master); o.start(t); o.stop(t + dur);
  }
}

const KINDS = {
  rifle: { dur: .18, freq: 2200, vol: .45, thump: 140 },
  footstep: { dur: .11, freq: 700, type: 'bandpass', q: 0.7, vol: .14, thump: 75 },
  silenced: { dur: .09, freq: 5200, type: 'highpass', vol: .12 },
  pistol: { dur: .28, freq: 1500, vol: .6, thump: 100 },
  sniper: { dur: .6, freq: 900, vol: .8, thump: 70 },
  knife: { dur: .12, freq: 3000, type: 'bandpass', vol: .15 },
  reload: { dur: .06, freq: 1800, type: 'bandpass', q: 6, vol: .25 },
  hit: { dur: .05, freq: 1200, type: 'bandpass', q: 8, vol: .3 },
  head: { dur: .12, freq: 3500, type: 'bandpass', q: 10, vol: .4 },
  hurt: { dur: .2, freq: 300, vol: .5, thump: 120 },
  zoom: { dur: .08, freq: 2400, type: 'bandpass', q: 4, vol: .5 },
  reaverkill: { dur: .6, freq: 2800, type: 'bandpass', q: 6, vol: .85, thump: 120 },
  glock: { dur: .2, freq: 1800, vol: .48, thump: 80 },
};

/** vol 0–1 (distância), pan -1..1 */
export function play(kind, vol = 1, pan = 0) {
  const k = KINDS[kind]; if (!k) return;
  try {
    if (kind === 'reaverkill' && playBuffer(reaverBuffer, k.vol * vol, pan, 1.0)) return;
    if (kind === 'rifle' && playBuffer(rifleBuffer, k.vol * vol, pan, 0.96 + Math.random() * 0.08)) return;
    if (kind === 'silenced' && playBuffer(silencedBuffer, k.vol * vol, pan, 0.96 + Math.random() * 0.08)) return;
    if (kind === 'sniper' && playBuffer(sniperBuffer, k.vol * vol, pan, 0.98 + Math.random() * 0.04)) return;
    if (kind === 'zoom' && playBuffer(zoomBuffer, k.vol * vol, pan, 1.0)) return;
    if (kind === 'pistol' && playBuffer(pistolBuffer, k.vol * vol, pan, 0.98 + Math.random() * 0.04)) return;
    if (kind === 'glock' && playBuffer(glockBuffer, k.vol * vol, pan, 1.0)) return;
    if (kind === 'reload' && playBuffer(reloadBuffer, k.vol * vol, pan, 1.0)) return;
    burst({ ...k, vol: k.vol * vol, pan });
  } catch { /* áudio indisponível */ }
}
export function unlock() { try { ac(); } catch { /* */ } }
export function setVolume(value) {
  volume = Math.max(0, Math.min(1, Number(value) || 0));
  if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}
