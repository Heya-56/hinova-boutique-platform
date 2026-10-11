-- Migration 0003 : comptes par e-mail + mot de passe, inscriptions payées par Stripe, configuration.
-- Ajouts uniquement : aucune colonne existante n'est modifiée.

-- Paramètres internes de la plateforme (secret de session généré, secret du webhook Stripe…)
CREATE TABLE IF NOT EXISTS config (
  cle TEXT PRIMARY KEY NOT NULL,
  valeur TEXT NOT NULL
);

-- Connexion par e-mail et mot de passe (la connexion Google reste possible).
-- La colonne email_google contient l'e-mail du compte, quel que soit le mode de connexion.
ALTER TABLE utilisateurs ADD COLUMN mot_de_passe TEXT;  -- PBKDF2-SHA256
ALTER TABLE utilisateurs ADD COLUMN sel TEXT;

-- Abonnement Stripe de la boutique
ALTER TABLE boutiques ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE boutiques ADD COLUMN stripe_subscription_id TEXT;
CREATE INDEX IF NOT EXISTS idx_boutiques_stripe_sub ON boutiques(stripe_subscription_id);

-- Inscription en attente de paiement : devient une boutique quand Stripe confirme le paiement.
CREATE TABLE IF NOT EXISTS inscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  mot_de_passe TEXT NOT NULL,
  sel TEXT NOT NULL,
  nom TEXT NOT NULL,
  domaine TEXT NOT NULL,
  modele TEXT NOT NULL,
  plan TEXT NOT NULL,
  cycle TEXT NOT NULL,
  gen TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'terminee')),
  boutique_id TEXT,
  cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inscriptions_email ON inscriptions(email);
