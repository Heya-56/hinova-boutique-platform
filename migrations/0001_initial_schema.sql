-- Migration 0001 : schéma initial de Hinova Boutique Platform
-- SQLite / Cloudflare D1. Les dates sont stockées en ISO 8601.
-- Les limites de produits et de ventes seront imposées par le Worker, jamais
-- uniquement par l'interface.

PRAGMA foreign_keys = ON;

-- Boutiques hébergées par le Worker mutualisé.
CREATE TABLE boutiques (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  nom TEXT NOT NULL,
  domaine TEXT NOT NULL UNIQUE,
  modele TEXT NOT NULL CHECK (modele IN ('lagon', 'pae', 'tiare', 'nuit')),
  statut TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'suspendue')),
  date_echeance TEXT,
  banque TEXT,
  plan TEXT NOT NULL DEFAULT 'plan_1' CHECK (plan IN ('plan_1', 'plan_2', 'plan_3')),
  cycle TEXT NOT NULL DEFAULT 'mensuel' CHECK (cycle IN ('mensuel', 'annuel')),
  logo_url TEXT,
  couleur_principale TEXT NOT NULL DEFAULT '#08343A',
  couleur_secondaire TEXT NOT NULL DEFAULT '#B5823A',
  mentions_facture TEXT,
  numero_tahiti TEXT,
  cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Les comptes administrateurs globaux peuvent ne pas être rattachés à une boutique.
CREATE TABLE utilisateurs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  email_google TEXT NOT NULL UNIQUE COLLATE NOCASE,
  boutique_id TEXT REFERENCES boutiques(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  CHECK (role <> 'client' OR boutique_id IS NOT NULL)
);

-- Catalogue de chaque boutique. Le plafond dépend du plan et sera contrôlé par le Worker.
CREATE TABLE offres (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  boutique_id TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  prix_xpf INTEGER NOT NULL CHECK (prix_xpf >= 0),
  image_url TEXT,
  ordre INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);

-- Commandes clients. lignes_json conserve un instantané des lignes et prix au moment de la commande.
CREATE TABLE commandes (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  boutique_id TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  client_nom TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_adresse TEXT NOT NULL,
  lignes_json TEXT NOT NULL CHECK (json_valid(lignes_json)),
  total_xpf INTEGER NOT NULL CHECK (total_xpf >= 0),
  moyen TEXT NOT NULL CHECK (moyen IN ('carte', 'virement', 'ccp')),
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'payee', 'expediee')),
  numero_facture TEXT,
  cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dossiers OSB transmis au webhook configuré dans l'environnement du Worker.
CREATE TABLE dossiers_osb (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  boutique_id TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  raison_sociale TEXT NOT NULL,
  numero_tahiti TEXT,
  responsable TEXT NOT NULL,
  telephone TEXT NOT NULL,
  email TEXT NOT NULL,
  banque TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Compteur des ventes payées par boutique et par mois (mois au format YYYY-MM).
CREATE TABLE ventes_mensuelles (
  boutique_id TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  mois TEXT NOT NULL CHECK (length(mois) = 7),
  ventes_count INTEGER NOT NULL DEFAULT 0 CHECK (ventes_count >= 0),
  PRIMARY KEY (boutique_id, mois)
);

-- Numérotation séquentielle des factures, indépendante pour chaque boutique.
CREATE TABLE compteurs_factures (
  boutique_id TEXT PRIMARY KEY NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  dernier_numero INTEGER NOT NULL DEFAULT 0 CHECK (dernier_numero >= 0)
);

-- Index utilisés par les requêtes du catalogue, du dashboard et des commandes.
CREATE INDEX idx_utilisateurs_boutique ON utilisateurs(boutique_id);
CREATE INDEX idx_offres_boutique_ordre ON offres(boutique_id, ordre, id);
CREATE INDEX idx_commandes_boutique_date ON commandes(boutique_id, cree_le);
CREATE INDEX idx_commandes_boutique_statut ON commandes(boutique_id, statut);
CREATE INDEX idx_dossiers_osb_boutique_date ON dossiers_osb(boutique_id, cree_le);
