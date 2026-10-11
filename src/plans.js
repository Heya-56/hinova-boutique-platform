// Grille des boutiques modèles — modifier ici, tout le reste suit (quotas, affichage, contrôles).
// Prix en XPF. Annuel = 10 mois payés, 2 offerts.
export const PLANS = {
  mini:     { key: 'mini',     label: 'Boutique Mini',     monthly: 1500, maxProducts: 9,  salesQuota: 50 },
  standard: { key: 'standard', label: 'Boutique Standard', monthly: 4900, maxProducts: 16, salesQuota: 85 },
  plus:     { key: 'plus',     label: 'Boutique Plus',     monthly: 9900, maxProducts: 32, salesQuota: 125 },
};

export const annualPrice = (plan) => plan.monthly * 10;

export function getPlan(key) {
  return PLANS[key] || PLANS.mini;
}

export const PAYMENT_METHODS = {
  virement: 'Virement bancaire',
  ccp: 'Espèces au guichet (CCP / Marara Paiement)',
  carte: 'Carte bancaire (lien OSB du commerçant)',
};

export const ORDER_STATUSES = {
  en_attente: 'En attente de paiement',
  payee: 'Payée',
  expediee: 'Expédiée',
  annulee: 'Annulée',
};

export const ISLANDS = [
  'Tahiti', 'Moorea', 'Bora Bora', 'Raiatea', 'Tahaa', 'Huahine', 'Maupiti',
  'Rangiroa', 'Tikehau', 'Fakarava', 'Nuku Hiva', 'Hiva Oa', 'Ua Pou',
  'Tubuai', 'Rurutu', 'Raivavae', 'Rimatara', 'Autre île',
];
