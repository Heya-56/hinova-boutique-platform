// Vitrine composée de sections : définition, valeurs par défaut, validation stricte et rendu HTML.
import { esc, fmtXpf } from './lib.js';
import { illu, illuFor, ILLUS } from './art.js';
import { PAYMENT_METHODS, ISLANDS } from './plans.js';

export const MAX_SECTIONS = 12;

// Les éditeurs (navigateur) et le serveur partagent cette définition.
export const SECTION_TYPES = {
  annonce:   { label: 'Bandeau d’annonce', fields: [{ k: 'texte', label: 'Texte', max: 120 }] },
  hero:      { label: 'Bannière d’accueil', fields: [
    { k: 'titre', label: 'Titre', max: 80 }, { k: 'texte', label: 'Texte', max: 240, area: true },
    { k: 'bouton', label: 'Texte du bouton', max: 30 }, { k: 'motif', label: 'Illustration', options: ILLUS }] },
  produits:  { label: 'Produits et commande', unique: true, required: true, fields: [{ k: 'titre', label: 'Titre', max: 60 }] },
  texte:     { label: 'Texte (notre histoire)', fields: [{ k: 'titre', label: 'Titre', max: 80 }, { k: 'texte', label: 'Texte', max: 1200, area: true }] },
  avantages: { label: 'Points forts', fields: [{ k: 'titre', label: 'Titre', max: 60 }],
    items: { max: 4, label: 'Point fort', fields: [{ k: 'titre', label: 'Titre', max: 40 }, { k: 'texte', label: 'Texte', max: 140 }] } },
  faq:       { label: 'Questions fréquentes', fields: [{ k: 'titre', label: 'Titre', max: 60 }],
    items: { max: 8, label: 'Question', fields: [{ k: 'q', label: 'Question', max: 140 }, { k: 'r', label: 'Réponse', max: 500, area: true }] } },
  contact:   { label: 'Contact et livraison', fields: [{ k: 'titre', label: 'Titre', max: 60 }, { k: 'texte', label: 'Texte', max: 300, area: true }] },
};

const sid = () => Math.random().toString(36).slice(2, 10);

export function defaultSections(b = {}) {
  return [
    { id: sid(), type: 'annonce', visible: true, texte: 'Livraison dans toutes les îles · Paiement direct et sécurisé' },
    { id: sid(), type: 'hero', visible: true, titre: b.nom || 'Ma boutique', texte: b.slogan || 'Créations du fenua, faites avec soin.', bouton: 'Voir la collection', motif: 'vague' },
    { id: sid(), type: 'produits', visible: true, titre: 'La collection' },
    { id: sid(), type: 'avantages', visible: true, titre: 'Pourquoi nous choisir', items: [
      { titre: 'Fait main', texte: 'Chaque pièce est préparée à la main, ici en Polynésie.' },
      { titre: 'Envoi dans les îles', texte: 'Expédition par la poste vers toutes les îles.' },
      { titre: 'Paiement direct', texte: 'Vous payez directement la boutique, sans intermédiaire.' }] },
    { id: sid(), type: 'faq', visible: true, titre: 'Questions fréquentes', items: [
      { q: 'Comment payer ?', r: 'Par virement, en espèces au guichet ou par carte selon les moyens proposés par la boutique.' },
      { q: 'Quels délais de livraison ?', r: 'Comptez quelques jours à Tahiti, un peu plus dans les autres îles.' }] },
    { id: sid(), type: 'contact', visible: true, titre: 'Nous contacter', texte: 'Une question sur un produit ? Écrivez-nous.' },
  ];
}

// Validation stricte : seuls les types, champs et longueurs connus passent.
export function sanitizeSections(input) {
  let arr = input;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = null; } }
  if (!Array.isArray(arr)) return defaultSections();
  const out = [];
  const seen = new Set();
  for (const raw of arr.slice(0, MAX_SECTIONS * 2)) {
    if (!raw || typeof raw !== 'object') continue;
    const def = SECTION_TYPES[raw.type];
    if (!def || (def.unique && seen.has(raw.type))) continue;
    seen.add(raw.type);
    const s = { id: /^[a-z0-9]{1,16}$/.test(raw.id) ? raw.id : sid(), type: raw.type, visible: raw.visible !== false };
    for (const f of def.fields) {
      let v = String(raw[f.k] ?? '').slice(0, f.max ?? 40);
      if (f.options && !f.options.includes(v)) v = f.options[0];
      s[f.k] = v;
    }
    if (def.items) {
      s.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, def.items.max)
        .filter((it) => it && typeof it === 'object')
        .map((it) => Object.fromEntries(def.items.fields.map((f) => [f.k, String(it[f.k] ?? '').slice(0, f.max)])));
    }
    out.push(s);
    if (out.length >= MAX_SECTIONS) break;
  }
  if (!out.some((s) => s.type === 'produits')) out.push({ id: sid(), type: 'produits', visible: true, titre: 'La collection' });
  return out;
}

export function parseSections(json, b) {
  if (!json) return defaultSections(b);
  return sanitizeSections(json);
}

// ───────────── Rendu ─────────────

const para = (t) => esc(t).replace(/\n/g, '<br>');

function productCard(o, ctx) {
  const visual = o.image_url
    ? `<img src="${esc(o.image_url)}" alt="${esc(o.nom)}" loading="lazy">`
    : illu(o.illu || illuFor(o.id), ctx.primary, ctx.secondary, o.nom);
  const orderable = o.stock > 0 && ctx.canOrder;
  return `<article class="card-p">
    <div class="ph">${visual}</div>
    <div class="body">
      <h3>${esc(o.nom)}</h3>
      ${o.description ? `<p class="desc">${para(o.description)}</p>` : ''}
      <div class="price">${fmtXpf(o.prix_xpf)}</div>
      ${orderable
        ? `<label class="qty"><span>Quantité</span><input form="commande" name="q_${esc(o.id)}" type="number" min="0" max="${o.stock}" value="0" inputmode="numeric"></label>`
        : `<span class="tag">${o.stock > 0 ? 'Sur demande' : 'Épuisé'}</span>`}
    </div></article>`;
}

function orderForm(ctx) {
  if (!ctx.canOrder) return '';
  const dis = ctx.demo ? ' disabled' : '';
  return `<div class="order">
    <h3>Passer commande</h3>
    <p class="muted">Choisissez les quantités, puis vos coordonnées. Les instructions de paiement s’affichent à l’écran.</p>
    <form id="commande" method="post" action="${esc(ctx.base)}/commander">
      <div class="row">
        <label>Nom complet<input name="client_nom" required maxlength="80"${dis}></label>
        <label>Téléphone<input name="client_telephone" required maxlength="30" inputmode="tel"${dis}></label>
        <label>E-mail<input name="client_email" type="email" required maxlength="120"${dis}></label>
      </div>
      <div class="row">
        <label>Adresse de livraison (BP, quartier, PK…)<textarea name="client_adresse" required maxlength="400"${dis}></textarea></label>
        <div>
          <label>Île<select name="ile" required${dis}><option value=""></option>${ISLANDS.map((i) => `<option>${i}</option>`).join('')}</select></label>
          <label>Paiement<select name="moyen" required${dis}>${ctx.methods.map((m) => `<option value="${m}">${esc(PAYMENT_METHODS[m])}</option>`).join('')}</select></label>
        </div>
      </div>
      <label>Note (facultatif)<input name="note" maxlength="300"${dis}></label>
      <input type="text" name="site_web" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
      <button class="btn" type="submit"${dis}>${ctx.demo ? 'Boutique de démonstration' : 'Valider ma commande'}</button>
    </form></div>`;
}

const RENDER = {
  annonce: (s) => s.texte ? `<div class="s-annonce">${esc(s.texte)}</div>` : '',
  hero: (s, ctx) => `<section class="s s-hero"><div class="wrap hero-grid">
      <div><h1>${esc(s.titre || ctx.b.nom)}</h1>${s.texte ? `<p>${para(s.texte)}</p>` : ''}
      ${s.bouton ? `<a class="btn btn-on" href="#produits">${esc(s.bouton)}</a>` : ''}</div>
      <div class="hero-art">${illu(s.motif || 'vague', ctx.primary, ctx.secondary, '')}</div></div></section>`,
  produits: (s, ctx) => `<section class="s s-produits" id="produits"><div class="wrap">
      ${s.titre ? `<h2>${esc(s.titre)}</h2>` : ''}
      ${ctx.offres.length ? `<div class="grid-p">${ctx.offres.map((o) => productCard(o, ctx)).join('')}</div>` : '<p class="muted">La collection arrive bientôt.</p>'}
      ${orderForm(ctx)}</div></section>`,
  texte: (s) => `<section class="s s-texte"><div class="wrap narrow">${s.titre ? `<h2>${esc(s.titre)}</h2>` : ''}<p>${para(s.texte)}</p></div></section>`,
  avantages: (s) => (s.items || []).length ? `<section class="s s-avantages"><div class="wrap">${s.titre ? `<h2>${esc(s.titre)}</h2>` : ''}
      <div class="grid-a">${s.items.map((it, i) => `<div class="a"><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${esc(it.titre)}</h3><p>${esc(it.texte)}</p></div>`).join('')}</div></div></section>` : '',
  faq: (s) => (s.items || []).length ? `<section class="s s-faq"><div class="wrap narrow">${s.titre ? `<h2>${esc(s.titre)}</h2>` : ''}
      ${s.items.map((it) => `<details><summary>${esc(it.q)}</summary><p>${para(it.r)}</p></details>`).join('')}</div></section>` : '',
  contact: (s, ctx) => {
    const b = ctx.b;
    const wa = b.whatsapp ? `<a class="btn" href="https://wa.me/${esc(b.whatsapp)}" target="_blank" rel="noopener">Écrire sur WhatsApp</a>` : '';
    const tel = b.telephone ? `<a class="btn btn-ghost" href="tel:${esc(b.telephone.replace(/[^0-9+]/g, ''))}">Appeler ${esc(b.telephone)}</a>` : '';
    return `<section class="s s-contact"><div class="wrap narrow">${s.titre ? `<h2>${esc(s.titre)}</h2>` : ''}
      ${s.texte ? `<p>${para(s.texte)}</p>` : ''}
      ${b.infos_livraison ? `<p class="muted">${para(b.infos_livraison)}</p>` : ''}
      ${b.ile ? `<p class="muted">${esc(b.ile)} — Polynésie française</p>` : ''}
      <div class="row-btn">${wa}${tel}</div></div></section>`;
  },
};

export function renderSections(sections, ctx) {
  return sections.filter((s) => s.visible && RENDER[s.type]).map((s) => RENDER[s.type](s, ctx)).join('\n');
}
