/**
 * DIRECTOR — c'est toi qui cadres. Le visiteur ne se déplace pas librement :
 *   - le défilement de la page = la tête de lecture de la séquence ;
 *   - un clic sur une œuvre (écran, timeline, index) = un travelling jusqu'à elle,
 *     ou une COUPE (fondu au noir) si elle est loin ;
 *   - ↑/↓ comme dans un logiciel de montage : point de montage précédent / suivant.
 *
 * Le défilement natif est gardé comme unique source de vérité : clavier, molette,
 * pavé tactile, doigt et lecteurs d'écran fonctionnent sans code spécifique.
 */
import { CONFIG } from '../config.js';
import { $, clamp, damp, timecode } from '../core/util.js';

export class Director {
  constructor({ rail, camera, caps }) {
    this.rail = rail;
    this.camera = camera;
    this.caps = caps;
    this.track = $('#track');
    this.dip = $('#dip');
    this.cur = 0;                 // secondes affichées (amorties)
    this.tween = null;
    this.listeners = new Set();
    document.documentElement.classList.add('rail-mode');
    this.layout();
    addEventListener('resize', () => this.layout());
    // toute action de l'utilisateur interrompt un travelling automatique
    for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, () => this.#cancelTween(), { passive: true });
  }

  onChange(fn) { this.listeners.add(fn); }

  /** Hauteur de la piste et points d'aimantation, recalculés au redimensionnement. */
  layout() {
    const keepS = this.cur;
    this.pxPerSec = CONFIG.scrollVhPerSecond * innerHeight / 100;
    this.track.style.height = `${Math.ceil(this.rail.duration * this.pxPerSec + innerHeight)}px`;
    this.track.querySelectorAll('.snap').forEach(n => n.remove());
    for (const k of this.rail.stations) {
      const s = document.createElement('div');
      s.className = 'snap';
      s.style.top = `${k.tMid * this.pxPerSec}px`;
      this.track.appendChild(s);
    }
    if (keepS) scrollTo(0, keepS * this.pxPerSec);
  }

  get target() { return clamp(scrollY / this.pxPerSec, 0, this.rail.duration); }

  /** À chaque image. Retourne true si la caméra bouge encore (→ redessiner). */
  update(dt) {
    const target = this.target;
    const prev = this.cur;
    this.cur = this.caps.reduceMotion ? target : damp(this.cur, target, CONFIG.damping, dt);
    if (Math.abs(this.cur - target) < 1e-4) this.cur = target;
    const aspect = (innerWidth || 16) / (innerHeight || 9);
    this.rail.poseAt(this.rail.uAt(this.cur), this.camera, aspect);
    const moving = Math.abs(this.cur - prev) > 1e-5 || this.dirty;
    this.dirty = false;
    if (moving || this._first !== true) { this._first = true; this.#emit(); }
    return moving;
  }

  /** État lisible par l'interface. */
  get state() {
    const R = this.rail;
    const pos = R.stationPosAt(this.cur);
    const nearest = R.stations[Math.round(pos)];
    const onStation = this.cur >= nearest.tIn - 0.35 && this.cur <= nearest.tOut + 0.35;
    return { seconds: this.cur, duration: R.duration, tc: timecode(this.cur, CONFIG.fps), pos, nearest, onStation };
  }

  #emit() { const s = this.state; this.listeners.forEach(fn => fn(s)); }

  /* ------------------------------------------------------------ sauts */
  stationIndexOf(work) { return this.rail.stations.findIndex(k => k.work === work); }

  /** `onArrive` est appelé une fois la tête de lecture posée (pas si l'utilisateur reprend la main). */
  jumpTo(work, onArrive) {
    const i = typeof work === 'number' ? work : this.stationIndexOf(work);
    const k = this.rail.stations[i];
    if (!k) return;
    const from = this.state.pos;
    const y = k.tMid * this.pxPerSec;
    if (this.caps.reduceMotion) { this.#instant(y); onArrive?.(); return; }
    if (Math.abs(i - from) > CONFIG.cutThreshold) { this.#cut(y, onArrive); return; }
    this.#travel(y, onArrive);
  }
  // depuis la position VISÉE (et non la caméra amortie) : appuyer deux fois avance de deux œuvres
  next() { this.jumpTo(clamp(Math.round(this.rail.stationPosAt(this.target) + 0.51), 0, this.rail.stations.length - 1)); }
  prev() { this.jumpTo(clamp(Math.round(this.rail.stationPosAt(this.target) - 0.51), 0, this.rail.stations.length - 1)); }

  #instant(y) {
    this.#cancelTween();
    this.#noSnap(true); scrollTo(0, y); this.cur = this.target;
    this.dirty = true;            // la caméra a « sauté » : il faut redessiner même sans mouvement
    requestAnimationFrame(() => this.#noSnap(false));
  }

  /** Coupe franche : fondu au noir, on replace la tête de lecture, retour image. */
  #cut(y, onArrive) {
    this.#cancelTween();
    this.dip.classList.add('on');
    setTimeout(() => {
      this.#instant(y);
      onArrive?.();
      requestAnimationFrame(() => this.dip.classList.remove('on'));
    }, 190);
  }

  /** Travelling : on anime le défilement lui-même, la caméra suit avec son inertie. */
  #travel(y, onArrive) {
    this.#cancelTween();
    const y0 = scrollY, dy = y - y0;
    const dur = clamp(Math.abs(dy) / this.pxPerSec * 0.28, 0.7, 2.4) * 1000;
    const t0 = performance.now();
    this.#noSnap(true);
    const step = now => {
      const f = clamp((now - t0) / dur, 0, 1);
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;   // easeInOutCubic
      scrollTo(0, y0 + dy * e);
      if (f < 1) this.tween = requestAnimationFrame(step);
      else { this.tween = null; setTimeout(() => this.#noSnap(false), 120); onArrive?.(); }
    };
    this.tween = requestAnimationFrame(step);
  }

  #cancelTween() {
    if (this.tween) { cancelAnimationFrame(this.tween); this.tween = null; this.#noSnap(false); }
  }
  #noSnap(on) { document.documentElement.classList.toggle('is-jumping', on); }

  /** Timecode d'entrée de chaque œuvre, pour l'index. */
  timecodes() {
    const out = {};
    for (const k of this.rail.stations) out[k.work] = timecode(k.tIn, CONFIG.fps);
    return out;
  }
}
