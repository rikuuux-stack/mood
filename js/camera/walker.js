/**
 * WALKER — déplacement libre à la première personne.
 *
 * Ordinateur : clic pour entrer (souris capturée et masquée, Pointer Lock),
 *              souris = regarder, ZQSD / WASD / flèches = marcher, Maj = courir,
 *              clic ou E sur une œuvre = fiche, Échap = libérer la souris.
 * Tactile    : joystick à gauche (poussé à fond = courir), glisser = regarder,
 *              toucher une œuvre = fiche.
 *
 * Caméra « à hauteur d'homme » : inertie au démarrage et à l'arrêt, balancement
 * de tête calé sur la foulée, transfert de poids gauche/droite, léger roulis
 * dans les virages et en pas chassé, champ qui s'ouvre en courant, respiration
 * à l'arrêt. Tout cela disparaît si le visiteur a demandé moins de mouvement.
 *
 * Collisions génériques : des rayons contre la géométrie (murs) et vers le bas
 * (sol). Fonctionne tel quel avec ton propre .glb, sans volumes de collision à modéliser.
 *
 * Même interface que Director (state, rail, jumpTo, onChange, timecodes) :
 * le HUD et l'index ne voient pas la différence.
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { $, clamp, timecode } from '../core/util.js';
import { adaptFov } from './rail.js';

const W = () => CONFIG.walk;
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const DIRS = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)));

export class Walker {
  constructor({ rail, camera, caps, colliders, pickables }) {
    this.rail = rail;
    this.camera = camera;
    this.caps = caps;
    this.colliders = colliders;
    this.pickables = pickables;
    this.listeners = new Set();
    this.ray = new THREE.Raycaster();
    this.down = new THREE.Vector3(0, -1, 0);
    this.tmp = new THREE.Vector3();

    // départ : position et direction de la première caméra (CAM_00)
    const k0 = rail.keys[0];
    this.pos = new THREE.Vector3(k0.position.x, 0, k0.position.z);
    this.floorY = this.#floorAt(this.pos.x, this.pos.z) ?? 0;
    const e = new THREE.Euler().setFromQuaternion(k0.quaternion, 'YXZ');
    this.yaw = this.tYaw = e.y;
    this.pitch = this.tPitch = 0;
    this.vel = new THREE.Vector2();
    this.keys = {};
    this.joy = { x: 0, y: 0 };
    this.bob = { phase: 0, amp: 0, roll: 0, idle: 0 };
    this.air = { y: 0, vy: 0, grounded: true, land: 0 };   // saut : hauteur, vitesse verticale, amorti
    this.fovKick = 0;
    this.elapsed = 0;
    this.locked = false;
    this.auto = null;              // déplacement automatique (clic sur la timeline ou l'index)
    this.aim = null;               // œuvre visée au centre de l'écran

    document.documentElement.classList.add('free-mode');
    this.#bindInput();
  }

  onChange(fn) { this.listeners.add(fn); }

  /* ================================================================ entrées */
  #bindInput() {
    const canvas = $('#stage canvas');
    const lockUI = $('#lock');

    // --- clavier (e.code = position physique : ZQSD en AZERTY = WASD en QWERTY)
    addEventListener('keydown', e => {
      if (e.target.closest?.('input, textarea') || document.documentElement.classList.contains('panel-open')) return;
      this.keys[e.code] = true;
      if (e.code === 'Space' && !e.repeat) this.jump();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    // --- souris capturée (Pointer Lock)
    // Certains contextes refusent la capture (aperçus intégrés, iframes, réglages du navigateur) :
    // on bascule alors en « glisser pour regarder », souris visible, sans rien casser.
    this.dragLook = false;
    const fallback = () => {
      if (this.dragLook) return;
      this.dragLook = true;
      document.documentElement.classList.add('drag-look');
      console.info('[walker] capture de la souris indisponible : glisser pour regarder');
    };
    this.requestLock = () => {
      if (this.caps.coarse || document.pointerLockElement || this.dragLook) return;
      try {
        const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
        p?.catch?.(() => {                                   // mouvement brut refusé : mode standard
          try { canvas.requestPointerLock()?.catch?.(fallback); } catch { fallback(); }
        });
      } catch { fallback(); }
    };
    document.addEventListener('pointerlockerror', fallback);
    let drag = null;
    canvas.addEventListener('mousedown', e => { if (this.dragLook) drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { drag = null; });
    addEventListener('mousemove', e => {
      if (!drag) return;
      const k = W().sensitivity * 1.6;
      this.tYaw -= (e.clientX - drag.x) * k;
      this.tPitch = clamp(this.tPitch - (e.clientY - drag.y) * k, -1.2, 1.2);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    lockUI?.addEventListener('click', this.requestLock);
    canvas.addEventListener('click', () => { if (!this.locked) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      document.documentElement.classList.toggle('is-locked', this.locked);
      if (!this.locked) this.keys = {};
      this.#emit();
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      const s = W().sensitivity;
      this.tYaw -= e.movementX * s;
      this.tPitch = clamp(this.tPitch - e.movementY * s, -1.2, 1.2);
    });

    // --- tactile : regard au glissé, joystick
    if (this.caps.coarse) {
      let look = null;
      canvas.addEventListener('pointerdown', e => { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
      canvas.addEventListener('pointermove', e => {
        if (!look || e.pointerId !== look.id) return;
        const k = 0.005;
        this.tYaw -= (e.clientX - look.x) * k;
        this.tPitch = clamp(this.tPitch - (e.clientY - look.y) * k, -1.1, 1.1);
        look.x = e.clientX; look.y = e.clientY;
      });
      const end = e => { if (look && e.pointerId === look.id) look = null; };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

      const joy = $('#joy'), knob = joy.querySelector('.knob');
      let jid = null;
      const move = e => {
        const r = joy.getBoundingClientRect(), max = r.width / 2 - 12;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; }
        this.joy.x = dx / max; this.joy.y = dy / max;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); move(e); this.auto = null; });
      joy.addEventListener('pointermove', e => { if (e.pointerId === jid) move(e); });
      const jend = e => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
      joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
      joy.hidden = false;
      const jb = $('#jumpBtn');
      if (jb) { jb.hidden = false; jb.addEventListener('pointerdown', e => { e.preventDefault(); this.jump(); }); }
    }
  }

  /** Saut : impulsion verticale, seulement si les pieds touchent le sol. */
  jump() {
    if (!this.air.grounded || this.auto) return;
    this.air.vy = W().jumpSpeed;
    this.air.grounded = false;
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /* ================================================================ collisions */
  #floorAt(x, z) {
    this.ray.set(this.tmp.set(x, (this.floorY ?? 0) + 1.2, z), this.down);
    this.ray.far = 2.5;
    const hit = this.ray.intersectObjects(this.colliders, false)[0];
    return hit ? hit.point.y : null;
  }

  /** Vrai si le corps (cylindre de rayon r) ne peut pas se tenir en (x, z). */
  #blocked(x, z) {
    const f = this.#floorAt(x, z);
    if (f === null || Math.abs(f - this.floorY) > 0.45) return true;   // vide, ou marche trop haute
    const r = W().radius;
    this.ray.far = r;
    for (const h of [0.35, 1.1]) {                                     // genoux et poitrine
      const o = this.tmp.set(x, f + h, z);
      for (const d of DIRS) {
        this.ray.set(o, d);
        if (this.ray.intersectObjects(this.colliders, false).length) return true;
      }
    }
    return false;
  }

  /* ================================================================ image par image */
  update(dt) {
    const w = W();
    const reduce = this.caps.reduceMotion;
    const cam = this.camera;
    this.elapsed += dt;

    // --- intention de déplacement
    let f = 0, s = 0;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) f += 1;
    if (k.KeyS || k.ArrowDown) f -= 1;
    if (k.KeyD || k.ArrowRight) s += 1;
    if (k.KeyA || k.ArrowLeft) s -= 1;
    f -= this.joy.y; s += this.joy.x;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    if (len > 0.05) this.auto = null;                                   // reprendre la main annule l'automatique
    const running = (k.ShiftLeft || k.ShiftRight || Math.hypot(this.joy.x, this.joy.y) > 0.94) && f > 0.1;

    // --- déplacement automatique vers une œuvre (timeline, index)
    if (this.auto) this.#stepAuto(dt);

    // --- regard amorti : la tête suit la main avec une très légère inertie
    const kl = ease(reduce ? 60 : 22, dt);
    this.yaw += (this.tYaw - this.yaw) * kl;
    this.pitch += (this.tPitch - this.pitch) * kl;

    // --- vitesse : accélération et freinage progressifs (pas de démarrage instantané)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const sp = running ? w.runSpeed : w.walkSpeed;
    const tvx = (-sy * f + cy * s) * sp, tvz = (-cy * f - sy * s) * sp;
    const air = this.air;
    // en l'air, on ne contrôle presque plus sa trajectoire (l'élan est conservé)
    const ka = ease(len > 0.05 ? (running ? 4.5 : 7) : 9, dt) * (air.grounded ? 1 : 0.12);
    this.vel.x += (tvx - this.vel.x) * ka;
    this.vel.y += (tvz - this.vel.y) * ka;
    const dx = this.vel.x * dt, dz = this.vel.y * dt;
    // un axe après l'autre : on glisse le long des murs au lieu de s'y coller
    if (Math.abs(dx) > 1e-5) { if (!this.#blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx; else this.vel.x = 0; }
    if (Math.abs(dz) > 1e-5) { if (!this.#blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz; else this.vel.y = 0; }
    const fl = this.#floorAt(this.pos.x, this.pos.z);
    if (fl !== null) this.floorY += (fl - this.floorY) * ease(12, dt);

    // --- saut : gravité, réception amortie par les genoux
    if (!air.grounded) {
      air.vy -= 9.81 * dt;
      air.y += air.vy * dt;
      if (air.y <= 0) {
        air.land = Math.min(1, -air.vy / 4.5);              // plus on tombe vite, plus on plie
        air.y = 0; air.vy = 0; air.grounded = true;
      }
    }
    air.land += (0 - air.land) * ease(7, dt);

    // --- corps : foulée, appui, transfert de poids, roulis, respiration
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const runMix = clamp((speed - w.walkSpeed) / (w.runSpeed - w.walkSpeed), 0, 1);
    let bobY = 0, bobX = 0, bobRoll = 0, targetRoll = 0, kick = 0;
    const b = this.bob;
    if (!reduce) {
      const stride = 0.75 + speed * 0.08;                        // la foulée s'allonge avec la vitesse
      b.phase += speed / stride * Math.PI * dt;                   // un pas = π
      // pas de foulée en l'air
      b.amp += ((air.grounded ? Math.min(speed / w.walkSpeed, 1) : 0) - b.amp) * ease(air.grounded ? 6 : 14, dt);
      const a = b.amp * (1 + runMix * 1.4);
      bobY = (-Math.abs(Math.sin(b.phase)) * 0.036 + 0.018) * a;  // appui à chaque pas
      bobX = Math.sin(b.phase) * 0.024 * a;                       // transfert de poids
      bobRoll = Math.sin(b.phase) * 0.005 * a;
      b.idle += dt;
      bobY += Math.sin(b.idle * 1.4) * 0.005 * (1 - b.amp);       // respiration à l'arrêt
      const strafeV = this.vel.x * cy - this.vel.y * sy;
      targetRoll = clamp(-strafeV * 0.01 + (this.tYaw - this.yaw) * 0.25, -0.05, 0.05);
      kick = runMix * w.runFovKick;
    }
    b.roll += (targetRoll - b.roll) * ease(6, dt);
    this.fovKick += (kick - this.fovKick) * ease(4, dt);

    // réception : la tête descend puis remonte, avec un léger coup vers le bas du regard
    const landDip = reduce ? 0 : Math.sin(Math.min(1, air.land) * Math.PI * 0.5) * 0.11 * air.land;
    const eye = this.floorY + w.eyeHeight + air.y - landDip;
    cam.position.set(this.pos.x + cy * bobX, eye + bobY, this.pos.z - sy * bobX);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch - landDip * 0.35, this.yaw, b.roll + bobRoll);
    cam.aspect = (innerWidth || 16) / (innerHeight || 9);
    cam.fov = adaptFov((this.caps.coarse ? w.fovMobile : w.fov), cam.aspect) + this.fovKick;
    cam.updateProjectionMatrix();

    // --- œuvre visée (croix au centre)
    this.ray.setFromCamera({ x: 0, y: 0 }, cam);
    this.ray.far = w.aimDistance;
    const hit = this.ray.intersectObjects(this.pickables, false)[0];
    this.aim = hit ? hit.object.userData.work : null;

    this.#emit();
    return true;          // en libre, on dessine chaque image (respiration, vidéos, regard)
  }

  /* ================================================================ HUD */
  get state() {
    const R = this.rail;
    let nearest = R.stations[0], best = Infinity;
    for (const st of R.stations) {
      const d = Math.hypot(st.position.x - this.pos.x, st.position.z - this.pos.z);
      if (d < best) { best = d; nearest = st; }
    }
    if (this.aim) nearest = R.stations.find(st => st.work === this.aim) || nearest;
    return {
      seconds: nearest.tMid, duration: R.duration,
      tc: timecode(this.elapsed, CONFIG.fps),
      pos: nearest.ordinal, nearest,
      onStation: !!this.aim || (best < 2.5 && nearest.work === 'intro'),
      aim: this.aim, locked: this.locked, position: this.pos,
    };
  }
  #emit() { const s = this.state; this.listeners.forEach(fn => fn(s)); }

  /** Distance normalisée d'un écran (1 ≈ videoRange mètres) : décide chargement et lecture des vidéos. */
  distanceTo(point) { return Math.hypot(point.x - this.pos.x, point.z - this.pos.z) / W().videoRange; }

  /* ================================================================ aller à une œuvre */
  stationIndexOf(work) { return this.rail.stations.findIndex(k => k.work === work); }

  jumpTo(work) {
    const i = typeof work === 'number' ? work : this.stationIndexOf(work);
    const k = this.rail.stations[i];
    if (!k) return;
    const e = new THREE.Euler().setFromQuaternion(k.quaternion, 'YXZ');
    const target = { x: k.position.x, z: k.position.z, yaw: this.#nearAngle(e.y), pitch: clamp(e.x, -0.3, 0.3) };
    const dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    if (this.caps.reduceMotion || dist > 14) { this.#cut(target); return; }
    this.auto = { from: { x: this.pos.x, z: this.pos.z, yaw: this.yaw, pitch: this.pitch }, to: target, t: 0,
      dur: clamp(dist / 3, 0.8, 2.4) };
  }

  #nearAngle(a) {                       // le plus court chemin angulaire
    while (a - this.yaw > Math.PI) a -= 2 * Math.PI;
    while (a - this.yaw < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  #cut(t) {
    const dip = $('#dip');
    dip.classList.add('on');
    setTimeout(() => {
      this.pos.x = t.x; this.pos.z = t.z; this.vel.set(0, 0);
      this.yaw = this.tYaw = t.yaw; this.pitch = this.tPitch = t.pitch;
      this.floorY = this.#floorAt(t.x, t.z) ?? this.floorY;
      requestAnimationFrame(() => dip.classList.remove('on'));
    }, 190);
  }

  #stepAuto(dt) {
    const a = this.auto;
    a.t = Math.min(1, a.t + dt / a.dur);
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
    const nx = a.from.x + (a.to.x - a.from.x) * e, nz = a.from.z + (a.to.z - a.from.z) * e;
    // on « marche » vers la cible : la vitesse sert au balancement de tête
    this.vel.set((nx - this.pos.x) / Math.max(dt, 1e-3), (nz - this.pos.z) / Math.max(dt, 1e-3));
    this.vel.clampLength(0, W().walkSpeed * 1.2);
    this.pos.x = nx; this.pos.z = nz;
    this.tYaw = a.from.yaw + (a.to.yaw - a.from.yaw) * e;
    this.tPitch = a.from.pitch + (a.to.pitch - a.from.pitch) * e;
    if (a.t >= 1) this.auto = null;
  }

  timecodes() {
    const out = {};
    for (const k of this.rail.stations) out[k.work] = timecode(k.tIn, CONFIG.fps);
    return out;
  }
}
