/* Auditor de contraste WCAG AA para pegar en la consola (o ejecutar con
   javascript_tool) sobre cualquier pantalla de En Forma.

   Recorre los nodos de texto visibles, resuelve el color real con un canvas
   (entiende oklab(), color-mix() y los alfa), compone los fondos de los
   ancestros y mide el ratio. Umbral: 4,5:1, o 3:1 para texto grande (≥ 24 px,
   o ≥ 18,66 px en negrita). Ignora texto deshabilitado (norma: exento).

   LÍMITES: no ve fondos de `background-image` (degradados, fotos) ni de
   elementos con `opacity` < 1 por encima. Esos casos se miran a ojo.

   TRAMPA: tras cambiar la clase `dark` de <html>, espera un frame y comprueba
   getComputedStyle(document.documentElement).getPropertyValue('--color-ink')
   antes de medir: si no, los estilos aún no se han recalculado y salen lecturas
   falsas.

   Uso:  auditarContraste()  →  { total, pasa, pct, fallos: [...] }          */
function auditarContraste({ maxFallos = 60 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();

  const rgba = (css) => {
    if (cache.has(css)) return cache.get(css);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
    const v = [r, g, b, a / 255];
    cache.set(css, v);
    return v;
  };
  const sobre = (f, b) => [
    f[0] * f[3] + b[0] * (1 - f[3]),
    f[1] * f[3] + b[1] * (1 - f[3]),
    f[2] * f[3] + b[2] * (1 - f[3]),
    1,
  ];
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

  const fondoDe = (el) => {
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) capas.push(c);
      if (c[3] >= 1) break;
    }
    let acc = rgba(getComputedStyle(document.body).backgroundColor);
    if (acc[3] < 1) acc = sobre(acc, [255, 255, 255, 1]);
    for (let i = capas.length - 1; i >= 0; i--) acc = sobre(capas[i], acc);
    return acc;
  };
  const opacidadAcumulada = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
    return o;
  };
  const ruta = (el) => {
    const p = [];
    for (let e = el; e && p.length < 3; e = e.parentElement) {
      p.push(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    }
    return p.join(' < ');
  };

  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  let total = 0, pasa = 0;
  const fallos = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const texto = n.textContent.trim();
    const el = n.parentElement;
    if (!texto || !el || vistos.has(el) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[disabled],[aria-disabled="true"]')) continue;
    vistos.add(el);
    const fondo = fondoDe(el);
    let tinta = rgba(cs.color).slice();
    tinta[3] *= opacidadAcumulada(el);
    tinta = sobre(tinta, fondo);
    const px = parseFloat(cs.fontSize);
    const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const min = grande ? 3 : 4.5;
    const rt = ratio(tinta, fondo);
    total++;
    if (rt >= min) pasa++;
    else fallos.push({ ratio: +rt.toFixed(2), min, px, texto: texto.slice(0, 40), el: ruta(el) });
  }
  fallos.sort((a, b) => a.ratio - b.ratio);
  return { total, pasa, pct: total ? +((pasa / total) * 100).toFixed(1) : 100, fallos: fallos.slice(0, maxFallos), nFallos: fallos.length };
}
window.auditarContraste = auditarContraste;
