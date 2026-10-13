// Multiplayer + cadastro de nomes + banimento via Firebase Realtime Database.
// O SDK é carregado sob demanda (import dinâmico) — sem config válida, tudo fica offline.
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

export class Net {
  constructor(config) {
    this.cfg = config;
    this.enabled = !!config?.apiKey && !config.apiKey.startsWith('COLE');
    this.uid = null; this.name = null; this.h = {};
    this.joinedAt = 0; this._last = 0;
  }
  on(evt, fn) { this.h[evt] = fn; return this; }
  static validName(n) { return NAME_RE.test(n); }

  async init() {
    if (!this.enabled) return false;
    const [app, auth, db] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js'),
    ]);
    this.f = { ...app, ...auth, ...db };
    this.app = this.f.initializeApp(this.cfg);
    this.auth = this.f.getAuth(this.app);
    this.db = this.f.getDatabase(this.app);
    const cred = await this.f.signInAnonymously(this.auth);
    this.uid = cred.user.uid;
    return true;
  }

  r(path) { return this.f.ref(this.db, path); }

  async isBanned() {
    const s = await this.f.get(this.r('bans/' + this.uid));
    return s.exists();
  }

  /** Reserva o apelido (único, case-insensitive). Retorna true/false. */
  async claimName(name) {
    const { get, runTransaction, remove } = this.f;
    const key = name.toLowerCase();
    const prev = (await get(this.r('players/' + this.uid + '/name'))).val();
    const res = await runTransaction(this.r('names/' + key), (cur) => (cur === null || cur === this.uid ? this.uid : undefined));
    if (!res.committed) return false;
    if (prev && prev.toLowerCase() !== key) await remove(this.r('names/' + prev.toLowerCase())).catch(() => {});
    await this.f.set(this.r('players/' + this.uid), { name, createdAt: this.f.serverTimestamp() });
    this.name = name; return true;
  }

  join(initialState) {
    const { onDisconnect, set, onChildAdded, onChildChanged, onChildRemoved, onValue, query, limitToLast, remove } = this.f;
    this.joinedAt = Date.now();
    this.me = this.r('state/' + this.uid);
    onDisconnect(this.me).remove();
    set(this.me, { n: this.name, ...initialState });

    const st = this.r('state');
    onChildAdded(st, (s) => { if (s.key !== this.uid) this.h.join?.(s.key, s.val()); });
    onChildChanged(st, (s) => { if (s.key !== this.uid) this.h.state?.(s.key, s.val()); });
    onChildRemoved(st, (s) => { if (s.key !== this.uid) this.h.leave?.(s.key); });

    const inbox = this.r('hits/' + this.uid);
    onChildAdded(inbox, (s) => { const v = s.val(); remove(s.ref).catch(() => {}); if (v && v.t > this.joinedAt - 2000) this.h.hit?.(v); });

    onChildAdded(query(this.r('feed'), limitToLast(5)), (s) => { const v = s.val(); if (v && v.t >= this.joinedAt) this.h.feed?.(v); });
    onValue(this.r('bans/' + this.uid), (s) => { if (s.exists()) this.h.banned?.(); });
  }

  /** Envia o estado (throttle interno). */
  sendState(state, hz = 15) {
    const now = performance.now();
    if (!this.me || now - this._last < 1000 / hz) return;
    this._last = now; this.f.update(this.me, state).catch(() => {});
  }
  sendHit(victimUid, payload) {
    this.f.push(this.r('hits/' + victimUid), { from: this.uid, t: Date.now(), ...payload }).catch(() => {});
  }
  sendFeed(payload) {
    this.f.push(this.r('feed'), { t: Date.now(), ...payload }).catch(() => {});
  }
  leave() { if (this.me) this.f.remove(this.me).catch(() => {}); }
}
