// Générateur PDF minimal, sans dépendance : pages A4, texte Helvetica (normal / gras), traits et cadres.
// Encodage WinAnsi : couvre le français (accents, « », ’, —, €).

const W = 595.28, H = 841.89; // A4 en points
export const PAGE = { W, H };

const WIN = { 0x20ac: 0x80, 0x2019: 0x92, 0x2018: 0x91, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x0153: 0x9c, 0x0152: 0x8c, 0x2022: 0x95 };

function winAnsi(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    let c = ch.codePointAt(0);
    if (c === 0x202f || c === 0xa0 || c === 0x2009) c = 0x20;
    if (WIN[c]) c = WIN[c];
    else if (c > 0xff) c = 0x3f;
    if (c === 0x28 || c === 0x29 || c === 0x5c) out.push(0x5c);
    if (c === 0x0a || c === 0x0d) continue;
    out.push(c);
  }
  return out;
}

// Largeur approximative (Helvetica) pour le retour à la ligne.
const avg = (bold) => (bold ? 0.56 : 0.52);
export function wrap(text, width, size, bold = false) {
  const max = Math.max(8, Math.floor(width / (size * avg(bold))));
  const lines = [];
  for (const para of String(text ?? '').split(/\n/)) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((cur + ' ' + word).trim().length > max) { if (cur) lines.push(cur); cur = word.length > max ? word.slice(0, max) : word; }
      else cur = (cur + ' ' + word).trim();
    }
    lines.push(cur);
  }
  return lines;
}

// Une page = liste d'opérations, coordonnées depuis le HAUT de la page (y vers le bas), plus naturel à écrire.
export class Page {
  constructor() { this.ops = []; }
  text(x, y, s, { size = 10, bold = false } = {}) { this.ops.push({ t: 'text', x, y, s, size, bold }); return this; }
  // Paragraphe avec retour à la ligne ; renvoie le y suivant.
  para(x, y, s, width, { size = 10, bold = false, lead = 1.35 } = {}) {
    for (const line of wrap(s, width, size, bold)) { this.text(x, y, line, { size, bold }); y += size * lead; }
    return y;
  }
  line(x1, y1, x2, y2, w = 0.6) { this.ops.push({ t: 'line', x1, y1, x2, y2, w }); return this; }
  rect(x, y, w, h, { width = 0.8, dash = false } = {}) { this.ops.push({ t: 'rect', x, y, w, h, width, dash }); return this; }
}

function content(page) {
  const parts = [];
  const num = (n) => (Math.round(n * 100) / 100).toString();
  for (const o of page.ops) {
    if (o.t === 'text') {
      parts.push({ head: `BT /${o.bold ? 'F2' : 'F1'} ${num(o.size)} Tf ${num(o.x)} ${num(H - o.y)} Td (`, body: winAnsi(o.s), tail: ') Tj ET\n' });
    } else if (o.t === 'line') {
      parts.push({ head: `${num(o.w)} w ${num(o.x1)} ${num(H - o.y1)} m ${num(o.x2)} ${num(H - o.y2)} l S\n` });
    } else if (o.t === 'rect') {
      parts.push({ head: `${o.dash ? '[4 3] 0 d ' : ''}${num(o.width)} w ${num(o.x)} ${num(H - o.y - o.h)} ${num(o.w)} ${num(o.h)} re S${o.dash ? ' [] 0 d' : ''}\n` });
    }
  }
  const enc = new TextEncoder();
  const chunks = [];
  for (const p of parts) { chunks.push(enc.encode(p.head)); if (p.body) { chunks.push(new Uint8Array(p.body)); chunks.push(enc.encode(p.tail)); } }
  return concat(chunks);
}

function concat(chunks) {
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function makePdf(pages, { title = 'Document' } = {}) {
  const enc = new TextEncoder();
  const objs = []; // contenu binaire de chaque objet, index = numéro - 1
  const add = (bytes) => { objs.push(bytes); return objs.length; };
  const catalog = add(null), pagesObj = add(null);
  const f1 = add(enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  const f2 = add(enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  const kids = [];
  for (const p of pages) {
    const body = content(p);
    const c = add(concat([enc.encode(`<< /Length ${body.length} >>\nstream\n`), body, enc.encode('\nendstream')]));
    kids.push(add(enc.encode(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`)));
  }
  objs[catalog - 1] = enc.encode(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  objs[pagesObj - 1] = enc.encode(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const info = add(concat([enc.encode('<< /Producer (Hinova Boutiques) /Title ('), new Uint8Array(winAnsi(title)), enc.encode(') >>')]));

  const chunks = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let offset = chunks[0].length;
  const xref = [];
  objs.forEach((b, i) => {
    xref.push(offset);
    const piece = concat([enc.encode(`${i + 1} 0 obj\n`), b, enc.encode('\nendobj\n')]);
    chunks.push(piece); offset += piece.length;
  });
  const table = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref.map((x) => `${String(x).padStart(10, '0')} 00000 n \n`).join('')}`;
  chunks.push(enc.encode(`${table}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return concat(chunks);
}
