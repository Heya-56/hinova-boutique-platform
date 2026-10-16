// Générateur de boutique : Workers AI rédige la boutique à partir d'une phrase du commerçant.
// Si l'IA est indisponible ou lente, une proposition automatique par mots-clés prend le relais : la démo ne casse jamais.
import { clean, int, isColor, b64url, b64urlDecode } from './lib.js';
import { MODELES, getModele } from './plans.js';
import { ILLUS } from './art.js';
import { sanitizeSections } from './sections.js';
import { DEMOS } from './demo.js';
import { heroPhoto } from './photos.js';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const AI_TIMEOUT_MS = 25000;

const SCHEMA = {
  type: 'object',
  properties: {
    nom: { type: 'string' }, slogan: { type: 'string' },
    modele: { type: 'string', enum: Object.keys(MODELES) },
    couleur_principale: { type: 'string' }, couleur_secondaire: { type: 'string' },
    annonce: { type: 'string' }, hero_titre: { type: 'string' }, hero_texte: { type: 'string' },
    motif: { type: 'string', enum: ILLUS },
    histoire: { type: 'string' },
    produits: { type: 'array', items: { type: 'object', properties: {
      nom: { type: 'string' }, description: { type: 'string' }, prix_xpf: { type: 'integer' }, motif: { type: 'string', enum: ILLUS } },
      required: ['nom', 'prix_xpf'] } },
    points_forts: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, texte: { type: 'string' } }, required: ['titre', 'texte'] } },
    faq: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, r: { type: 'string' } }, required: ['q', 'r'] } },
  },
  required: ['nom', 'slogan', 'modele', 'hero_titre', 'hero_texte', 'produits', 'points_forts', 'faq'],
};

const SYSTEM = `Tu es le concepteur de boutiques en ligne d'Hinova Digital pour les commerçants et artisans de Polynésie française.
À partir de la description du commerçant, tu proposes sa boutique en JSON, en français, ton chaleureux et simple.
Règles :
- modele : "nuit" pour perles, bijoux de luxe ou produits haut de gamme ; "tiare" pour beauté, soins, monoï, bien-être, fleurs ; "pae" pour bois, sculpture, tapa, pierre, objets bruts ou déco ; "lagon" pour le reste (bijoux de plage, vêtements, alimentation, loisirs).
- couleurs en hexadécimal #RRGGBB, harmonieuses avec le modèle ; la couleur principale doit rester lisible sous du texte blanc ou noir.
- 4 à 6 produits plausibles pour cette activité, prix en francs Pacifique (XPF) réalistes pour la Polynésie, entiers.
- 3 points forts et 2 questions fréquentes utiles à ses clients (paiement, livraison dans les îles, entretien…).
- N'invente aucun label, certification, récompense, avis client ni chiffre : rien que le commerçant n'a pas dit.
- Si le commerçant donne un nom de boutique, garde-le exactement ; sinon propose un nom court et original.
- Textes courts : slogan ≤ 110 caractères, hero_texte ≤ 180, histoire ≤ 350, annonce ≤ 80.`;

const RULES = [
  [/perle|perlier|keshi|nacre noire|bijou(x)? (en )?or|luxe|haut de gamme/i, 'nuit', 'perle'],
  [/mono[iï]|savon|soin|cosm[ée]ti|beaut[ée]|massage|bien-[êe]tre|huile|tamanu|tiare|fleur|parfum|bougie|ongle|coiff/i, 'tiare', 'fleur'],
  [/bois|sculpt|tapa|tiki|pierre|d[ée]co|meuble|vannerie|tressage|pandanus|artisanat d'art|poterie/i, 'pae', 'tapa'],
];

export function guessModele(text) {
  for (const [re, modele, motif] of RULES) if (re.test(text)) return { modele, motif };
  return { modele: 'lagon', motif: 'vague' };
}

// ───────────── Normalisation commune (IA, secours, URL, création) ─────────────

export function sanitizeGen(g) {
  if (!g || typeof g !== 'object') return null;
  const modele = MODELES[g.modele] ? g.modele : 'lagon';
  const m = getModele(modele);
  const offres = (Array.isArray(g.offres) ? g.offres : []).slice(0, 6).map((o, i) => ({
    id: 'g' + i, nom: clean(o?.nom, 80) || `Produit ${i + 1}`, description: clean(o?.description, 300),
    prix_xpf: Math.min(10000000, Math.max(0, int(o?.prix_xpf, 0))), illu: ILLUS.includes(o?.illu) ? o.illu : ILLUS[i % ILLUS.length],
    stock: 5, image_url: null,
  }));
  return {
    nom: clean(g.nom, 60) || 'Ma boutique', slogan: clean(g.slogan, 140), modele,
    couleur_principale: isColor(g.couleur_principale) ? g.couleur_principale : m.primary,
    couleur_secondaire: isColor(g.couleur_secondaire) ? g.couleur_secondaire : m.secondary,
    sections: sanitizeSections(g.sections), offres,
    source: g.source === 'ia' ? 'ia' : 'auto',
  };
}

export const encodeGen = (g) => b64url(new TextEncoder().encode(JSON.stringify(g)));
export function decodeGen(s) {
  if (!s || s.length > 12000) return null;
  try { return sanitizeGen(JSON.parse(new TextDecoder().decode(b64urlDecode(s)))); } catch { return null; }
}

const sid = () => Math.random().toString(36).slice(2, 10);

function toGen(raw, source) {
  const pf = (raw.points_forts || []).slice(0, 4).map((x) => ({ titre: clean(x?.titre, 40), texte: clean(x?.texte, 140) })).filter((x) => x.titre);
  const faq = (raw.faq || []).slice(0, 6).map((x) => ({ q: clean(x?.q, 140), r: clean(x?.r, 500) })).filter((x) => x.q && x.r);
  const sections = [
    raw.annonce ? { id: sid(), type: 'annonce', visible: true, texte: clean(raw.annonce, 120) } : null,
    { id: sid(), type: 'hero', visible: true, titre: clean(raw.hero_titre, 80) || clean(raw.nom, 80), texte: clean(raw.hero_texte, 240), bouton: 'Découvrir', motif: ILLUS.includes(raw.motif) ? raw.motif : 'vague', image: heroPhoto(MODELES[raw.modele] ? raw.modele : 'lagon') },
    { id: sid(), type: 'produits', visible: true, titre: 'La collection' },
    pf.length ? { id: sid(), type: 'avantages', visible: true, titre: 'Pourquoi nous choisir', items: pf } : null,
    raw.histoire ? { id: sid(), type: 'texte', visible: true, titre: 'Notre histoire', texte: clean(raw.histoire, 1200) } : null,
    faq.length ? { id: sid(), type: 'faq', visible: true, titre: 'Questions fréquentes', items: faq } : null,
    { id: sid(), type: 'contact', visible: true, titre: 'Nous contacter', texte: 'Une question sur un produit ? Écrivez-nous.' },
  ].filter(Boolean);
  return sanitizeGen({
    nom: raw.nom, slogan: raw.slogan, modele: raw.modele, couleur_principale: raw.couleur_principale, couleur_secondaire: raw.couleur_secondaire,
    sections, source,
    offres: (raw.produits || []).map((p) => ({ nom: p?.nom, description: p?.description, prix_xpf: p?.prix_xpf, illu: p?.motif })),
  });
}

// Proposition automatique sans IA : modèle deviné, produits d'exemple du modèle, textes neutres.
const PITCH = {
  lagon: ['Créations du fenua, faites avec soin.', 'Des pièces préparées à la main et expédiées dans toutes les îles.'],
  tiare: ['Soins et douceurs au parfum du fenua.', 'Des soins simples, préparés avec les ingrédients de nos îles.'],
  pae: ['Objets façonnés à la main, faits pour durer.', 'Bois, fibres et matières du fenua, travaillés lentement.'],
  nuit: ['La perle de Tahiti, choisie avec exigence.', 'Des pièces sélectionnées une à une et montées avec sobriété.'],
};

export function fallbackGen(description, nom) {
  const { modele, motif } = guessModele(description);
  const d = DEMOS[modele];
  const label = nom || 'Ma boutique';
  return toGen({
    nom: label, modele, motif,
    slogan: PITCH[modele][0],
    annonce: 'Livraison dans toutes les îles · Paiement direct',
    hero_titre: label, hero_texte: PITCH[modele][1],
    produits: d.offres.slice(0, 4).map((o) => ({ nom: o.nom, description: o.description, prix_xpf: o.prix_xpf, motif: o.illu })),
    points_forts: [
      { titre: 'Fait au fenua', texte: 'Des produits préparés avec soin, ici en Polynésie.' },
      { titre: 'Envoi dans les îles', texte: 'Expédition par la poste vers toutes les îles.' },
      { titre: 'Paiement direct', texte: 'Vous payez directement la boutique, sans intermédiaire.' },
    ],
    faq: [
      { q: 'Comment payer ?', r: 'Par virement, en espèces au guichet ou par carte, selon les moyens proposés.' },
      { q: 'Livrez-vous dans les îles ?', r: 'Oui, par la poste, dans toute la Polynésie française.' },
    ],
  }, 'auto');
}

export async function generateShop(env, description, nom) {
  if (env.AI && env.AI_OFF !== '1') {
    try {
      const user = `Description du commerçant : ${description}${nom ? `\nNom de la boutique : ${nom}` : ''}`;
      const run = env.AI.run(MODEL, {
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: SCHEMA }, max_tokens: 1000, temperature: 0.6,
      });
      const res = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('IA trop lente')), AI_TIMEOUT_MS))]);
      let out = res?.response ?? res;
      if (typeof out === 'string') out = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      if (out && Array.isArray(out.produits) && out.produits.length) {
        if (nom) out.nom = nom;
        return toGen(out, 'ia');
      }
    } catch (e) { console.error('Génération IA en échec, secours activé :', e && e.message); }
  }
  return fallbackGen(description, nom);
}

// ───────────── Lecture d'une image (capture de page Facebook / Instagram, photo de produits, vitrine…) ─────────────
// L'image n'est jamais enregistrée : elle est lue en mémoire, analysée, puis oubliée.
const VISION_PROMPT = `Cette image vient d'un commerçant ou artisan de Polynésie française (capture d'écran de sa page de réseau social, photo de ses produits, de sa boutique ou de son logo).
Réponds uniquement en JSON, en français, avec : {"nom": nom de la boutique s'il est lisible sinon "", "activite": une phrase décrivant l'activité et les produits, "produits": [jusqu'à 6 noms de produits visibles], "couleurs": [2 couleurs dominantes de la marque en #RRGGBB]}.
N'invente rien qui ne soit pas visible.`;

export async function readImage(env, bytes, type) {
  if (!env.AI || env.AI_OFF === '1') return null;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const run = env.AI.run(VISION_MODEL, {
    messages: [{ role: 'user', content: VISION_PROMPT }], image: `data:${type};base64,${btoa(bin)}`, max_tokens: 400, temperature: 0.2,
  });
  const res = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('Lecture d’image trop lente')), AI_TIMEOUT_MS))]);
  let out = res?.response ?? res;
  if (typeof out === 'string') out = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  if (!out || typeof out !== 'object') return null;
  const couleurs = (Array.isArray(out.couleurs) ? out.couleurs : []).filter(isColor).slice(0, 2);
  return {
    nom: clean(out.nom, 60), activite: clean(out.activite, 300),
    produits: (Array.isArray(out.produits) ? out.produits : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, 6), couleurs,
  };
}
