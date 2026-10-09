/**
 * HUD — la régie : timecode, bandeau (lower third), timeline du parcours (piste V1).
 */
import { WORKS } from '../content/works.js';
import { t, pick, onLangChange } from '../core/i18n.js';
import { $, esc } from '../core/util.js';

export class Hud {
  constructor({ director, onOpenWork }) {
    this.d = director;
    this.onOpenWork = onOpenWork;
    this.tc = $('#tc');
    this.station = $('#hudStation');
    this.lt = $('#lower-third');
    this.head = $('#stripHead');
    this.trackEl = $('#stripTrack');
    this.lastWork = undefined;
    this.#buildStrip();
    onLangChange(() => { this.#buildStrip(); this.lastWork = undefined; this.update(this.d.state); });
    this.lt.querySelector('.lt-open').addEventListener('click', () => this.currentWork && this.onOpenWork(this.currentWork));
    ['#hud-top', '#lower-third', '#strip'].forEach(s => { $(s).hidden = false; });
    this.update(this.d.state);
  }

  #label(work, short = false) {
    if (work === 'intro') return t('intro');
    const w = WORKS.find(x => x.id === work);
    return w ? (short && w.short) || pick(w.title) : work;
  }

  /** Piste V1 : un clip par plan tenu, un trait par travelling (largeurs ∝ durées). */
  #buildStrip() {
    const K = this.d.rail.keys;
    let html = '';
    K.forEach((k, i) => {
      if (k.isStation) {
        const w = WORKS.find(x => x.id === k.work);
        const cls = k.work === 'intro' ? 'is-intro' : w?.placeholder ? 'is-placeholder' : '';
        html += `<button type="button" class="strip-clip ${cls}" style="--grow:${k.tOut - k.tIn}" data-station="${k.ordinal}" title="${esc(this.#label(k.work))}">${esc(this.#label(k.work, true))}</button>`;
      }
      const n = K[i + 1];
      if (n) html += `<span class="strip-gap" style="--grow:${n.tIn - k.tOut}"></span>`;
    });
    this.trackEl.innerHTML = html;
    this.trackEl.onclick = e => {
      const b = e.target.closest('[data-station]');
      if (b) this.d.jumpTo(Number(b.dataset.station));
    };
  }

  update(s) {
    this.tc.textContent = s.tc;
    // tête de lecture : position proportionnelle dans la piste
    const r = this.trackEl.getBoundingClientRect(), pr = this.trackEl.parentElement.getBoundingClientRect();
    this.head.style.left = `${r.left - pr.left + r.width * (s.seconds / s.duration)}px`;

    const work = s.onStation ? s.nearest.work : null;
    if (work === this.lastWork) return;
    this.lastWork = work;
    this.trackEl.querySelectorAll('[data-station]').forEach(b =>
      b.setAttribute('aria-current', String(Number(b.dataset.station) === s.nearest.ordinal && s.onStation)));
    const total = this.d.rail.stations.length;
    this.station.textContent = work ? `${t('stationOf', s.nearest.ordinal + 1, total)} — ${this.#label(work)}` : '';

    const w = WORKS.find(x => x.id === work);
    this.currentWork = w ? w.id : null;
    if (!w) { this.lt.classList.add('off'); return; }
    this.lt.querySelector('.lt-meta').textContent =
      [w.placeholder ? t('placeholderNote') : pick(w.kind), w.year, w.format].filter(Boolean).join(' · ');
    this.lt.querySelector('.lt-title').textContent = pick(w.title);
    this.lt.classList.remove('off');
  }
}
