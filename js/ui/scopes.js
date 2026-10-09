/**
 * SCOPES — forme d'onde (luma Y′) et vectorscope Rec.709 de l'œuvre à l'écran.
 * Calculés sur une image réduite à 96 × 54 : quelques dixièmes de milliseconde.
 * Désactivés sur mobile et petits écrans (CSS) : décoratifs, ils ne doivent pas
 * gêner la lecture de l'œuvre elle-même.
 */
const SW = 96, SH = 54;
// coefficients Rec.709
const KR = 0.2126, KG = 0.7152, KB = 0.0722;

export class Scopes {
  constructor(root) {
    this.root = root;
    this.wf = root.querySelector('#waveform').getContext('2d');
    this.vs = root.querySelector('#vectorscope').getContext('2d');
    this.small = Object.assign(document.createElement('canvas'), { width: SW, height: SH }).getContext('2d', { willReadFrequently: true });
    this.vsGrat = this.#vectorGraticule();
    this.frame = 0;
    this.lastSource = null;
    this.enabled = matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
    root.hidden = !this.enabled;
  }

  /** @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|null} src */
  update(src) {
    if (!this.enabled) return;
    const isVideo = src instanceof HTMLVideoElement;
    if (!isVideo && src === this.lastSource) return;          // image fixe : un seul calcul
    if (isVideo && (++this.frame % 3 || src.readyState < 2)) return;
    this.lastSource = src;
    let data = null;
    if (src) {
      try { this.small.drawImage(src, 0, 0, SW, SH); data = this.small.getImageData(0, 0, SW, SH).data; }
      catch { data = null; }
    }
    this.#drawWaveform(data);
    this.#drawVector(data);
  }

  #drawWaveform(d) {
    const g = this.wf, W = g.canvas.width, H = g.canvas.height;
    const img = g.createImageData(W, H), px = img.data;
    const counts = new Float32Array(W * H);
    if (d) {
      const sx = W / SW;
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const k = (y * SW + x) * 4;
        const Y = (KR * d[k] + KG * d[k + 1] + KB * d[k + 2]) / 255;
        const py = Math.round((1 - Y) * (H - 1));
        for (let i = 0; i < sx; i++) counts[py * W + Math.floor(x * sx + i)] += 1;
      }
    }
    for (let i = 0; i < counts.length; i++) {
      const v = Math.min(255, counts[i] * 60);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // graticule : noir et blanc légaux (16 / 235) et 50 %
    g.strokeStyle = 'rgba(191,191,0,.45)'; g.lineWidth = 1;
    for (const lv of [16, 235]) { const y = Math.round((1 - lv / 255) * (H - 1)) + .5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = 'rgba(235,235,235,.15)';
    const y50 = Math.round(H / 2) + .5; g.beginPath(); g.moveTo(0, y50); g.lineTo(W, y50); g.stroke();
  }

  #drawVector(d) {
    const g = this.vs, W = g.canvas.width, c = W / 2, R = W / 2 - 4;
    g.drawImage(this.vsGrat, 0, 0);
    if (!d) return;
    g.fillStyle = 'rgba(235,235,235,.55)';
    for (let k = 0; k < d.length; k += 4) {
      const r = d[k] / 255, gg = d[k + 1] / 255, b = d[k + 2] / 255;
      const Y = KR * r + KG * gg + KB * b;
      const cb = (b - Y) / 1.8556, cr = (r - Y) / 1.5748;          // ±0,5
      g.fillRect(c + cb * 2 * R, c - cr * 2 * R, 1, 1);
    }
  }

  #vectorGraticule() {
    const W = 96, c = W / 2, R = W / 2 - 4;
    const cv = Object.assign(document.createElement('canvas'), { width: W, height: W }), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(235,235,235,.18)';
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(c, 4); g.lineTo(c, W - 4); g.moveTo(4, c); g.lineTo(W - 4, c); g.stroke();
    // cibles des barres 75 % : R, Mg, B, Cy, G, Yl
    const bars = { R: [.75, 0, 0], Mg: [.75, 0, .75], B: [0, 0, .75], Cy: [0, .75, .75], G: [0, .75, 0], Yl: [.75, .75, 0] };
    g.strokeStyle = 'rgba(191,191,0,.7)'; g.fillStyle = 'rgba(191,191,0,.8)'; g.font = '7px monospace';
    for (const [name, [r, gg, b]] of Object.entries(bars)) {
      const Y = KR * r + KG * gg + KB * b, x = c + (b - Y) / 1.8556 * 2 * R, y = c - (r - Y) / 1.5748 * 2 * R;
      g.strokeRect(x - 3, y - 3, 6, 6);
      g.fillText(name, x + 4, y - 4);
    }
    // ligne des carnations (skin tone line, ≈ 123°)
    g.strokeStyle = 'rgba(235,235,235,.12)';
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(-2.15) * R, c + Math.sin(-2.15) * R); g.stroke();
    return cv;
  }
}
