// Grille des formules (colonne boutiques.plan) et modèles graphiques (colonne boutiques.modele).
// Prix en XPF. Annuel = 10 mois payés, 2 offerts. Renommer les libellés ici suffit.
export const PLANS = {
  plan_1: { key: 'plan_1', label: 'Boutique Mini',     monthly: 1500, maxProducts: 9,  salesQuota: 50 },
  plan_2: { key: 'plan_2', label: 'Boutique Standard', monthly: 4900, maxProducts: 16, salesQuota: 85 },
  plan_3: { key: 'plan_3', label: 'Boutique Plus',     monthly: 9900, maxProducts: 32, salesQuota: 125 },
};
export const annualPrice = (plan) => plan.monthly * 10;
export const getPlan = (key) => PLANS[key] || PLANS.plan_1;

// Chaque modèle fixe l'ambiance (fond, typographie, arrondis) ; les deux couleurs restent celles de la boutique.
export const MODELES = {
  lagon: {
    label: 'Lagon', pitch: 'Clair et lumineux, comme une eau turquoise.',
    primary: '#08343A', secondary: '#2BA7A0',
    tokens: { bg: '#F3FAF9', surface: '#FFFFFF', ink: '#0B2629', muted: '#56716F', line: '#D3E6E3', radius: '18px', btnRadius: '999px', head: "'Fraunces', Georgia, serif", headWeight: 600, headCase: 'none', headSpacing: '0' },
    fonts: 'family=Fraunces:opsz,wght@9..144,600;9..144,700',
  },
  pae: {
    label: 'Pae', pitch: 'Terre, pierre et sable : brut et chaleureux.',
    primary: '#4A2E1C', secondary: '#B5823A',
    tokens: { bg: '#F4EDE3', surface: '#FBF7F1', ink: '#2B1D12', muted: '#7A6450', line: '#E2D4C1', radius: '4px', btnRadius: '4px', head: "'DM Serif Display', Georgia, serif", headWeight: 400, headCase: 'uppercase', headSpacing: '.04em' },
    fonts: 'family=DM+Serif+Display',
  },
  tiare: {
    label: 'Tiare', pitch: 'Doux et floral, pour la beauté et le bien-être.',
    primary: '#2F4A3A', secondary: '#D98C93',
    tokens: { bg: '#FFFBF7', surface: '#FFFFFF', ink: '#26332B', muted: '#6E7A72', line: '#F0E2DA', radius: '26px', btnRadius: '999px', head: "'Cormorant Garamond', Georgia, serif", headWeight: 600, headCase: 'none', headSpacing: '.01em' },
    fonts: 'family=Cormorant+Garamond:wght@600;700',
  },
  nuit: {
    label: 'Nuit', pitch: 'Sombre et précieux, pour la perle et le luxe.',
    primary: '#D4A64A', secondary: '#3FC1B0',
    tokens: { bg: '#0D1315', surface: '#161F22', ink: '#EEF3F2', muted: '#98AAA7', line: '#24323A', radius: '10px', btnRadius: '10px', head: "'Fraunces', Georgia, serif", headWeight: 600, headCase: 'none', headSpacing: '0', hero: 'surface' },
    fonts: 'family=Fraunces:opsz,wght@9..144,600;9..144,700',
    dark: true,
  },
};
export const getModele = (key) => MODELES[key] || MODELES.lagon;

export const PAYMENT_METHODS = {
  virement: 'Virement bancaire',
  ccp: 'Espèces au guichet (CCP / Marara Paiement)',
  carte: 'Carte bancaire (paiement sécurisé OSB)',
};

// Statuts autorisés par la base : on n'avance que vers l'avant (une facture émise ne se défait pas).
export const ORDER_STATUSES = { en_attente: 'En attente de paiement', payee: 'Payée', expediee: 'Expédiée' };
export const NEXT_STATUS = { en_attente: 'payee', payee: 'expediee' };

export const BANQUES = ['Banque de Polynésie', 'Socredo', 'Banque de Tahiti', 'Autre'];

export const OSB_STATUTS = { en_attente: 'En attente', transmis: 'Transmis à OSB', valide: 'Validé', refuse: 'Refusé' };

export const ISLANDS = [
  'Tahiti', 'Moorea', 'Bora Bora', 'Raiatea', 'Tahaa', 'Huahine', 'Maupiti',
  'Rangiroa', 'Tikehau', 'Fakarava', 'Nuku Hiva', 'Hiva Oa', 'Ua Pou',
  'Tubuai', 'Rurutu', 'Raivavae', 'Rimatara', 'Autre île',
];

// Option mensuelle « paiement en ligne par carte » (PayZen via OSB), facturée par Hinova en plus de la formule.
// Ajoutée à l'abonnement Stripe quand le dossier OSB est validé. Le contrat OSB reste réglé directement à OSB.
export const PAYZEN_OPTION = { label: 'Paiement en ligne par carte (PayZen / OSB)', fraisXpf: 2200, periode: 'mois' };

// Nature des justificatifs joints au dossier OSB. Liste à aligner sur la liste officielle fournie par OSB.
export const OSB_PIECES = {
  identite: 'Pièce d’identité du responsable',
  rib: 'RIB du compte professionnel (Banque de Polynésie ou Socredo)',
  immatriculation: 'Justificatif d’immatriculation (n° Tahiti)',
  autre: 'Autre pièce demandée par OSB',
};
// Seules ces banques sont acceptées par OSB pour un contrat de paiement en ligne.
export const BANQUES_OSB = ['Banque de Polynésie', 'Socredo'];
