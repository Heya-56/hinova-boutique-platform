// Illustrations SVG originales : visuels des boutiques de démonstration et des produits sans photo.
import { esc } from './lib.js';

export const ILLUS = ['vague', 'fleur', 'perle', 'feuille', 'soleil', 'tapa'];

let n = 0;
export function illu(kind, primary, secondary, label = '') {
  const id = `g${++n}`;
  const p = esc(primary), s = esc(secondary);
  const shapes = {
    vague: `<rect width="200" height="200" fill="${s}" opacity=".18"/>
      ${[60, 95, 130, 165].map((y, i) => `<path d="M-10 ${y} C 30 ${y - 22}, 60 ${y + 22}, 100 ${y} S 170 ${y - 22}, 210 ${y}" fill="none" stroke="${i % 2 ? s : p}" stroke-width="${7 - i}" stroke-linecap="round" opacity="${0.95 - i * 0.15}"/>`).join('')}`,
    fleur: `<rect width="200" height="200" fill="${s}" opacity=".16"/>
      <g transform="translate(100 100)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="22" ry="52" cy="-44" fill="#fff" stroke="${p}" stroke-width="2.5" transform="rotate(${a})"/>`).join('')}
      <circle r="15" fill="${s}"/><circle r="6" fill="${p}"/></g>`,
    perle: `<defs><radialGradient id="${id}" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${s}" stop-opacity=".55"/><stop offset="1" stop-color="${p}"/></radialGradient></defs>
      <rect width="200" height="200" fill="${p}" opacity=".12"/>
      <circle cx="100" cy="104" r="56" fill="url(#${id})"/><ellipse cx="80" cy="82" rx="14" ry="9" fill="#fff" opacity=".8"/>
      <path d="M30 168 Q100 140 170 168" fill="none" stroke="${p}" stroke-width="2" opacity=".5"/>`,
    feuille: `<rect width="200" height="200" fill="${s}" opacity=".15"/>
      <g transform="rotate(-28 100 100)"><path d="M100 22 C 160 60, 160 140, 100 178 C 40 140, 40 60, 100 22 Z" fill="${p}" opacity=".9"/>
      <path d="M100 30 V 172" stroke="#fff" stroke-width="3" opacity=".7"/>
      ${[60, 90, 120, 150].map((y) => `<path d="M100 ${y} L ${132 - (y - 60) / 6} ${y - 22} M100 ${y} L ${68 + (y - 60) / 6} ${y - 22}" stroke="#fff" stroke-width="2" opacity=".55"/>`).join('')}</g>`,
    soleil: `<rect width="200" height="200" fill="${s}" opacity=".2"/>
      <g transform="translate(100 100)">${Array.from({ length: 16 }, (_, i) => `<line y1="-48" y2="-74" stroke="${p}" stroke-width="5" stroke-linecap="round" transform="rotate(${i * 22.5})"/>`).join('')}
      <circle r="38" fill="${p}"/><circle r="24" fill="${s}" opacity=".7"/></g>`,
    tapa: `<rect width="200" height="200" fill="${s}" opacity=".18"/>
      ${[0, 1, 2, 3, 4].map((r) => Array.from({ length: 5 }, (_, c) => {
        const x = c * 40, y = r * 40;
        return (r + c) % 2 ? `<path d="M${x} ${y + 40} L${x + 20} ${y + 8} L${x + 40} ${y + 40} Z" fill="${p}" opacity=".85"/>` : `<circle cx="${x + 20}" cy="${y + 22}" r="7" fill="none" stroke="${p}" stroke-width="3"/>`;
      }).join('')).join('')}`,
  };
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid slice">${shapes[kind] || shapes.vague}</svg>`;
}

// Illustration stable pour un produit sans photo (même produit → même motif)
export function illuFor(key) {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ILLUS[h % ILLUS.length];
}

// Motif léger en fond de la bannière d'accueil
export function heroPattern(color) {
  const c = encodeURIComponent(color);
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpath d='M0 30 Q15 18 30 30 T60 30' fill='none' stroke='${c}' stroke-opacity='.18' stroke-width='2'/%3E%3C/svg%3E")`;
}
