-- Migration 0004 : journal des paiements (idempotence Stripe), journal d'audit, statut d'impayé,
-- justificatifs du dossier OSB stockés en privé, option paiement en ligne PayZen.
-- Ajouts uniquement : aucune colonne existante n'est modifiée.

-- Chaque événement Stripe n'est traité qu'une fois (clé = identifiant d'événement Stripe).
CREATE TABLE IF NOT EXISTS paiements_evenements (
  event_id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  boutique_id TEXT,
  objet_id TEXT,
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'traite', 'ignore')),
  recu_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_paiements_evenements_boutique ON paiements_evenements(boutique_id, recu_le);

-- Journal d'audit : qui a fait quoi, quand (sans données de paiement ni mots de passe).
CREATE TABLE IF NOT EXISTS journal_audit (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  boutique_id TEXT,
  acteur TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_journal_audit_boutique ON journal_audit(boutique_id, cree_le);

-- Abonnement : 'actif' ou 'impaye' (échec de paiement signalé par Stripe, en attente de régularisation).
ALTER TABLE boutiques ADD COLUMN abonnement_statut TEXT NOT NULL DEFAULT 'actif';

-- Dossier OSB : option paiement en ligne, frais annoncés, consentement au traitement des données.
ALTER TABLE dossiers_osb ADD COLUMN paiement_en_ligne INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossiers_osb ADD COLUMN frais_xpf INTEGER;
ALTER TABLE dossiers_osb ADD COLUMN consentement_le TEXT;

-- Justificatifs : fichiers rangés dans R2 sous le préfixe privé « prive/ », jamais servis par /img/.
CREATE TABLE IF NOT EXISTS osb_justificatifs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  dossier_id TEXT NOT NULL REFERENCES dossiers_osb(id) ON DELETE CASCADE,
  boutique_id TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  nature TEXT NOT NULL,
  cle_r2 TEXT NOT NULL UNIQUE,
  nom_fichier TEXT NOT NULL,
  type_mime TEXT NOT NULL,
  taille INTEGER NOT NULL,
  cree_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_osb_justificatifs_dossier ON osb_justificatifs(boutique_id, dossier_id);
