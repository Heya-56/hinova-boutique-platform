-- Migration 0002 : ajouts pour le MVP (aucune colonne existante modifiée)
-- Vitrine par sections, coordonnées de la boutique, consignes de paiement, infos client de commande.

-- Boutique : présentation et contact
ALTER TABLE boutiques ADD COLUMN slogan TEXT;
ALTER TABLE boutiques ADD COLUMN telephone TEXT;
ALTER TABLE boutiques ADD COLUMN whatsapp TEXT;          -- format international sans +, ex. 68989123456
ALTER TABLE boutiques ADD COLUMN ile TEXT;

-- Boutique : moyens de paiement (l'argent va directement au commerçant)
ALTER TABLE boutiques ADD COLUMN rib TEXT;               -- coordonnées affichées pour le virement
ALTER TABLE boutiques ADD COLUMN consignes_ccp TEXT;     -- espèces au guichet CCP / Marara Paiement
ALTER TABLE boutiques ADD COLUMN lien_paiement_carte TEXT; -- lien de paiement OSB / PayZen du commerçant
ALTER TABLE boutiques ADD COLUMN infos_livraison TEXT;

-- Boutique : vitrine composée de sections (JSON validé par le Worker)
ALTER TABLE boutiques ADD COLUMN sections_json TEXT CHECK (sections_json IS NULL OR json_valid(sections_json));

-- Commande : informations nécessaires à la livraison dans les îles
ALTER TABLE commandes ADD COLUMN client_telephone TEXT;
ALTER TABLE commandes ADD COLUMN ile TEXT;
ALTER TABLE commandes ADD COLUMN note TEXT;

CREATE INDEX IF NOT EXISTS idx_boutiques_statut_echeance ON boutiques(statut, date_echeance);
