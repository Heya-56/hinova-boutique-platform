-- Migration 0007 : suivi de l'envoi des documents d'une commande payée (facture + étiquette, PDF) au commerçant.
ALTER TABLE commandes ADD COLUMN documents_envoyes_le TEXT;
ALTER TABLE commandes ADD COLUMN documents_statut TEXT;

-- Attestation de titularité (anti-usurpation) : le commerçant certifie représenter l'activité et détenir
-- les droits sur le nom, le logo et les images utilisés. Datée à l'inscription puis reportée sur la boutique.
ALTER TABLE inscriptions ADD COLUMN attestation_le TEXT;
ALTER TABLE boutiques ADD COLUMN attestation_le TEXT;
