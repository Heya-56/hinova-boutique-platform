// Documents d'une commande payée, en PDF : facture, étiquette d'expédition, déclaration en douane (CN23) sur demande.
import { Page, PAGE, makePdf } from './pdf.js';
import { fmtXpf, fmtDate } from './lib.js';
import { PAYMENT_METHODS } from './plans.js';

const M = 48; // marge
const ref = (o) => o.id.slice(0, 8).toUpperCase();

function sender(b) {
  return [b.nom, b.numero_tahiti ? `N° Tahiti : ${b.numero_tahiti}` : '', b.ile || '', b.telephone ? `Tél. ${b.telephone}` : ''].filter(Boolean);
}
function recipient(o) {
  return [o.client_nom, ...String(o.client_adresse || '').split(/\n/), o.ile ? `${o.ile} — Polynésie française` : '', o.client_telephone ? `Tél. ${o.client_telephone}` : ''].filter(Boolean);
}

function invoicePage(b, o, lignes) {
  const p = new Page();
  let y = M + 10;
  p.text(M, y, b.nom, { size: 16, bold: true });
  p.text(PAGE.W - M - 150, y, 'FACTURE', { size: 18, bold: true });
  y += 18;
  sender(b).slice(1).forEach((l) => { p.text(M, y, l, { size: 9 }); y += 12; });
  p.text(PAGE.W - M - 150, M + 30, `N° ${o.numero_facture || '—'}`, { size: 11, bold: true });
  p.text(PAGE.W - M - 150, M + 44, `Commande ${ref(o)} du ${fmtDate(o.cree_le)}`, { size: 9 });
  p.text(PAGE.W - M - 150, M + 56, `Payée par : ${PAYMENT_METHODS[o.moyen] || o.moyen}`, { size: 9 });

  y = Math.max(y, M + 80) + 16;
  p.text(M, y, 'Facturé à', { size: 9, bold: true }); y += 13;
  recipient(o).forEach((l) => { p.text(M, y, l, { size: 10 }); y += 13; });
  if (o.client_email) { p.text(M, y, o.client_email, { size: 9 }); y += 13; }

  y += 18;
  const cols = [M, M + 290, M + 350, M + 430];
  p.line(M, y, PAGE.W - M, y, 0.8); y += 14;
  ['Désignation', 'Qté', 'Prix unitaire', 'Total'].forEach((h, i) => p.text(cols[i], y, h, { size: 9, bold: true }));
  y += 8; p.line(M, y, PAGE.W - M, y); y += 14;
  for (const l of lignes) {
    const end = p.para(cols[0], y, l.nom, 280, { size: 10 });
    p.text(cols[1], y, String(l.qte), { size: 10 });
    p.text(cols[2], y, fmtXpf(l.prix), { size: 10 });
    p.text(cols[3], y, fmtXpf(l.prix * l.qte), { size: 10 });
    y = end + 4;
  }
  p.line(M, y, PAGE.W - M, y, 0.8); y += 18;
  p.text(cols[2], y, 'Total', { size: 11, bold: true });
  p.text(cols[3], y, fmtXpf(o.total_xpf), { size: 11, bold: true });
  y += 30;
  if (b.mentions_facture) y = p.para(M, y, b.mentions_facture, PAGE.W - 2 * M, { size: 8 }) + 6;
  p.para(M, PAGE.H - M - 20, 'Facture émise par le commerçant via Hinova Boutiques. Le paiement a été reçu directement par le commerçant.', PAGE.W - 2 * M, { size: 7 });
  return p;
}

function labelPage(b, o, lignes) {
  const p = new Page();
  const x = M, w = PAGE.W - 2 * M, h = 300;
  p.text(M, M - 14, 'Étiquette d’expédition — découpez le long des pointillés', { size: 8 });
  p.rect(x - 6, M - 6, w + 12, h + 12, { dash: true, width: 0.6 });
  p.rect(x, M, w, h, { width: 1.4 });
  p.text(x + 14, M + 22, 'EXPÉDITEUR', { size: 8, bold: true });
  let y = M + 36;
  sender(b).forEach((l, i) => { p.text(x + 14, y, l, { size: i ? 9 : 11, bold: !i }); y += 13; });
  p.line(x, M + 104, x + w, M + 104, 1);
  p.text(x + 14, M + 126, 'DESTINATAIRE', { size: 9, bold: true });
  y = M + 150;
  recipient(o).forEach((l, i) => { p.text(x + 14, y, l, { size: i ? 13 : 16, bold: !i }); y += i ? 18 : 22; });
  p.text(x + w - 150, M + h - 16, `Commande ${ref(o)}`, { size: 9, bold: true });

  y = M + h + 50;
  p.text(M, y, 'Bon de préparation', { size: 13, bold: true }); y += 20;
  for (const l of lignes) { p.text(M, y, `☐  ${l.qte} × ${l.nom}`.replace('☐', '[ ]'), { size: 10 }); y += 15; }
  if (o.note) { y += 6; y = p.para(M, y, `Note du client : ${o.note}`, PAGE.W - 2 * M, { size: 9 }); }
  return p;
}

function cn23Page(b, o, lignes) {
  const p = new Page();
  let y = M + 10;
  p.text(M, y, 'DÉCLARATION EN DOUANE — CN 23 (pré-remplie)', { size: 14, bold: true }); y += 16;
  p.para(M, y, 'Brouillon préparé par Hinova Boutiques à partir de la commande. À vérifier, compléter (codes SH, poids) et signer, puis à joindre au formulaire officiel remis par le bureau de poste.', PAGE.W - 2 * M, { size: 8 });
  y += 34;
  const half = (PAGE.W - 2 * M - 12) / 2;
  p.rect(M, y, half, 96); p.rect(M + half + 12, y, half, 96);
  p.text(M + 8, y + 14, 'Expéditeur', { size: 8, bold: true });
  p.text(M + half + 20, y + 14, 'Destinataire', { size: 8, bold: true });
  sender(b).forEach((l, i) => p.text(M + 8, y + 30 + i * 13, l, { size: 9 }));
  recipient(o).forEach((l, i) => p.text(M + half + 20, y + 30 + i * 13, l, { size: 9 }));
  y += 116;
  const cols = [M, M + 250, M + 300, M + 370, M + 440];
  p.line(M, y, PAGE.W - M, y, 0.8); y += 14;
  ['Description détaillée du contenu', 'Qté', 'Poids (kg)', 'Valeur', 'Code SH'].forEach((h, i) => p.text(cols[i], y, h, { size: 8, bold: true }));
  y += 8; p.line(M, y, PAGE.W - M, y); y += 14;
  for (const l of lignes) {
    const end = p.para(cols[0], y, l.nom, 240, { size: 9 });
    p.text(cols[1], y, String(l.qte), { size: 9 });
    p.text(cols[2], y, '……', { size: 9 });
    p.text(cols[3], y, fmtXpf(l.prix * l.qte), { size: 9 });
    p.text(cols[4], y, '……', { size: 9 });
    y = end + 4;
  }
  p.line(M, y, PAGE.W - M, y, 0.8); y += 16;
  p.text(cols[2], y, 'Valeur totale', { size: 9, bold: true }); p.text(cols[3], y, fmtXpf(o.total_xpf), { size: 9, bold: true });
  y += 26;
  p.text(M, y, 'Catégorie de l’envoi : [x] Vente de marchandises   [ ] Cadeau   [ ] Échantillon   [ ] Retour', { size: 9 }); y += 16;
  p.text(M, y, 'Pays d’origine des marchandises : Polynésie française', { size: 9 }); y += 16;
  p.text(M, y, `Facture jointe : ${o.numero_facture || '—'}`, { size: 9 }); y += 34;
  p.text(M, y, 'Date et signature de l’expéditeur : ……………………………………………', { size: 9 });
  return p;
}

export function orderDocumentsPdf(b, o, lignes, { douane = false } = {}) {
  const pages = [invoicePage(b, o, lignes), labelPage(b, o, lignes)];
  if (douane) pages.push(cn23Page(b, o, lignes));
  return makePdf(pages, { title: `${b.nom} — commande ${ref(o)}` });
}
