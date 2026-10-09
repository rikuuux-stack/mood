/**
 * RIKU — point d'entrée.
 *
 * Ordre de démarrage pensé pour les recruteurs pressés :
 *   1. l'index HTML est construit immédiatement (aucune dépendance à Three.js) ;
 *   2. la 3D est importée dynamiquement ensuite, derrière la mire de barres ;
 *   3. si l'appareil ne peut pas (tier 0) ou économise ses données, on ouvre l'index.
 */
import { CONFIG } from './config.js';
import { detectCapabilities } from './core/capabilities.js';
import { apply as applyI18n, t } from './core/i18n.js';
import { $ } from './core/util.js';
import { initIndex, openIndex, closeIndex, setTimecodes } from './ui/index-panel.js';
import { initSheet, openSheet, setSeeInSpace } from './ui/sheet.js';
import { closeAll, isAnyOpen, onPanelsChange, pinPanel } from './ui/panels.js';

const caps = detectCapabilities();
let started = false;                            // la 3D a été lancée
window.__riku = { caps };                       // pratique pour déboguer dans la console
applyI18n();

initIndex({ openWork: id => openSheet(id) });
initSheet();

document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (!o) return;
  if (o.dataset.open === 'index') { dismissBars(); openIndex(); }
  if (o.dataset.open === 'about') openSheet('about');
});
$('#indexClose').addEventListener('click', () => { closeIndex(); dismissBars(); });

/* ------------------------------------------------------------ mire de chargement */
const bars = $('#bars');
const progress = (f, key) => {
  $('#barsProgress').style.width = `${Math.round(f * 100)}%`;
  if (key) { const s = $('#barsStatus'); s.dataset.i18n = key; s.textContent = t(key); }
};
function dismissBars() { bars.classList.add('gone'); }

/* ------------------------------------------------------------ routes (#index, #work=id, #about) */
function route(space) {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'index') { dismissBars(); openIndex(); }
  else if (h === 'about') openSheet('about');
  else if (h.startsWith('work=')) {
    const id = h.slice(5);
    // 3D : travelling (ou coupe) jusqu'à l'œuvre, puis la fiche s'ouvre à l'arrivée
    if (space) space.director.jumpTo(id, () => { dismissBars(); openSheet(id); }); else openSheet(id);
  }
}
addEventListener('hashchange', () => route(window.__riku.space));

/* ------------------------------------------------------------ démarrage */
if (caps.indexFirst) {
  // pas de 3D (ou économie de données) : l'index EST le site
  $('#indexClose').hidden = caps.tier === 0;
  progress(1, caps.tier === 0 ? 'noGL' : 'lowPower');
  dismissBars();
  openIndex();
  route(null);
  if (caps.tier === 0) {
    pinPanel($('#index'));                       // sans 3D, fermer l'index laisserait une page vide
  } else {
    // économie de données : tant que la 3D n'est pas lancée, fermer l'index (Échap) montre la mire
    // avec le bouton « Entrer dans l'espace » plutôt qu'une page vide
    const enter = $('#enterBtn');
    const launch = () => { if (!started) { enter.hidden = true; start3D(); } };
    $('#indexClose').addEventListener('click', launch, { once: true });
    enter.addEventListener('click', launch);
    onPanelsChange(open => {
      if (started || open.length) return;
      bars.classList.remove('gone');
      enter.hidden = false;
      requestAnimationFrame(() => enter.focus({ preventScroll: true }));
    });
  }
} else {
  start3D().catch(err => {
    console.error(err);
    progress(1, 'noGL');
    dismissBars(); openIndex();
    $('#indexClose').hidden = true;
  });
}

async function start3D() {
  started = true;
  document.body.classList.add('is-3d');
  $('#bars').classList.remove('gone');
  progress(0.05, 'loading');
  // import dynamique : Three.js n'est téléchargé que si la 3D est utilisée
  const free = (new URLSearchParams(location.search).get('nav') || CONFIG.navigation) === 'free';
  const [THREE, { createRenderer }, { loadSpace }, { Rail }, nav, { Screens }, { Hud }, { Scopes }, { WORKS }] =
    await Promise.all([
      import('three'), import('./core/renderer.js'), import('./scene/space.js'), import('./camera/rail.js'),
      free ? import('./camera/walker.js') : import('./camera/director.js'),
      import('./scene/screens.js'), import('./ui/hud.js'), import('./ui/scopes.js'), import('./content/works.js'),
    ]);
  progress(0.1, 'loadingModel');

  const { renderer, resize, ensureSize, sample } = createRenderer($('#stage'), caps);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.skyColor);   // le ciel vu par les ouvertures zénithales
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 250);

  const space = await loadSpace({ renderer, tier: caps.tier, onProgress: progress });
  scene.add(space.root);

  const rail = new Rail(space.keys);
  const stationCam = Object.fromEntries(rail.stations.map(k => [k.work, k.position]));
  const screens = new Screens({ scene, entries: space.screens, works: WORKS, caps, stationPos: stationCam });

  // mode libre : Walker (collisions contre la géométrie) ; mode guidé : Director (défilement)
  let director;
  if (free) {
    const colliders = [];
    space.root.traverse(o => { if (o.isMesh && !o.name.startsWith('SCREEN_')) colliders.push(o); });
    director = new nav.Walker({ rail, camera, caps, colliders, pickables: screens.pickables });
  } else {
    director = new nav.Director({ rail, camera, caps });
  }
  const ordinalOf = Object.fromEntries(rail.stations.map(k => [k.work, k.ordinal]));
  const distOf = free
    ? item => director.distanceTo(item.center)
    : item => Math.abs((ordinalOf[item.work.id] ?? 99) - director.state.pos);

  // pancarte de contact : visable et cliquable comme une œuvre (ouvre « À propos »)
  const { makeSign } = await import('./scene/sign.js');
  screens.pickables.push(makeSign(scene));

  const scopes = new Scopes($('#scopes'));
  const hud = new Hud({ director, onOpenWork: id => openSheet(id) });
  director.onChange(s => {
    hud.update(s);
    if (free) document.documentElement.classList.toggle('aiming', !!s.aim);
  });
  setTimecodes(director.timecodes());
  setSeeInSpace(id => { closeAll(); director.jumpTo(id); });
  window.__riku.space = { THREE, scene, camera, renderer, director, screens, rail, source: space.source };

  // réflexions : une capture de la salle à chaque plan, avant d'activer les reflets
  let reflections = [], currentEnv = null;
  if (space.live.length) {
    const { captureReflections } = await import('./scene/baked.js');
    const pts = rail.keys.map(k => new THREE.Vector3(k.position.x, 1.7, k.position.z));
    reflections = captureReflections(renderer, scene, pts);
  }
  const updateReflection = () => {
    if (!reflections.length) return;
    let best = reflections[0], d = Infinity;
    for (const r of reflections) { const dd = r.pos.distanceToSquared(camera.position); if (dd < d) { d = dd; best = r; } }
    if (best.env === currentEnv) return;
    const first = !currentEnv; currentEnv = best.env;
    for (const m of space.live) { m.envMap = best.env; if (first) m.needsUpdate = true; }
  };
  director.update(0); updateReflection();

  // précompile les shaders pour éviter l'accroc à la première image
  await renderer.compileAsync?.(scene, camera);
  progress(1, 'ready');

  /* ------------------------------------------------ interactions */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickAt = (x, y) => {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.far = free ? CONFIG.walk.aimDistance : Infinity;
    return ray.intersectObjects(screens.pickables, false)[0]?.object.userData.work || null;
  };

  if (free) {
    const touch = caps.coarse;
    if (CONFIG.filmGrain && caps.tier >= 2 && !caps.reduceMotion) document.documentElement.classList.add('film');
    document.documentElement.classList.toggle('touch', touch);
    const lock = $('#lock');
    if (!touch) {
      lock.hidden = false;
      $('#tc').previousElementSibling.textContent = 'REC';
    } else {
      // tactile : les consignes s'affichent dans la mire de chargement
      $('#barsStatus').textContent = t('touchHow');
    }
    // souris capturée : un clic ouvre la fiche de l'œuvre visée
    $('#stage canvas').addEventListener('click', () => {
      if (director.locked && director.aim) openSheet(director.aim);
    });
    // tactile : toucher une œuvre proche = fiche
    let down = null;
    $('#stage canvas').addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    $('#stage canvas').addEventListener('pointerup', e => {
      if ((!touch && !director.dragLook) || !down) return;   // tactile, ou souris sans capture
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 400;
      down = null;
      const id = tap && pickAt(e.clientX, e.clientY);
      if (id) openSheet(id);
    });
    // un panneau s'ouvre : on rend la souris
    onPanelsChange(open => { if (open.length) director.releaseLock(); });
    addEventListener('keydown', e => {
      if (isAnyOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyE' || e.key === 'Enter') { if (director.aim) { e.preventDefault(); openSheet(director.aim); } }
      else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); openIndex(); }
      else if (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
    });
  } else {
    // La scène est sous la piste de défilement : on écoute sur window et on ignore les clics d'interface.
    let down = null;
    addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
    addEventListener('pointerup', e => {
      if (!down || isAnyOpen() || e.target.closest('.hud, .panel, button, a')) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500;
      down = null;
      if (!tap) return;
      const id = pickAt(e.clientX, e.clientY);
      if (!id) return;
      if (id === 'about') { openSheet('about'); return; }
      const s = director.state;
      // œuvre déjà cadrée → fiche ; sinon → travelling jusqu'à elle
      if (s.onStation && s.nearest.work === id) openSheet(id); else director.jumpTo(id);
    });
    let hoverQueued = false;
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        $('#stage').classList.toggle('pointer', !isAnyOpen() && !e.target.closest('.hud') && !!pickAt(e.clientX, e.clientY));
      });
    }, { passive: true });

    // clavier façon logiciel de montage
    addEventListener('keydown', e => {
      if (isAnyOpen() || e.target.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'l' || k === 'L') { e.preventDefault(); director.next(); }
      else if (k === 'ArrowUp' || k === 'j' || k === 'J') { e.preventDefault(); director.prev(); }
      else if (k === ' ' || k === 'k' || k === 'K') { if (e.target.closest('button')) return; e.preventDefault(); togglePause(); }
      else if (k === 'i' || k === 'I') { e.preventDefault(); openIndex(); }
      else if (k === 'Enter') { const s = director.state; if (s.onStation && ordinalOf[s.nearest.work] !== undefined && s.nearest.work !== 'intro') openSheet(s.nearest.work); }
    });
  }

  // pause globale (WCAG 2.2.2 : tout contenu animé > 5 s doit pouvoir être arrêté)
  const btnPause = $('#btnPause');
  const togglePause = (force) => {
    const p = typeof force === 'boolean' ? force : !screens.paused;
    screens.setPaused(p);
    btnPause.setAttribute('aria-pressed', String(p));
  };
  btnPause.addEventListener('click', () => togglePause());
  togglePause(screens.paused);

  addEventListener('resize', () => { resize(); needsRender = true; });

  /* ------------------------------------------------ boucle : on ne dessine que si quelque chose change */
  let last = performance.now(), needsRender = true, renderedLast = false;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); needsRender = true; } });
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!document.hidden) {
      if (ensureSize()) needsRender = true;
      const moving = director.update(dt);
      updateReflection();
      const s = director.state;
      const playing = screens.update(distOf);
      scopes.update(screens.sourceOf(s.nearest.work));
      if (moving || playing || needsRender) {
        renderer.render(scene, camera);
        if (renderedLast) sample(dt * 1000, now);
        renderedLast = true; needsRender = false;
      } else renderedLast = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // entrée : la mire s'efface d'elle-même (pas de clic obligatoire)
  setTimeout(() => { if (!isAnyOpen()) dismissBars(); }, caps.reduceMotion ? 0 : 400);
  route(window.__riku.space);
}
