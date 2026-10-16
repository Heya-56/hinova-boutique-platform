-- Migration 0005 : copie publiée de chaque vitrine.
-- La vitrine publique ne lit que cette table (contenu public : identité, sections, catalogue) et le stock en direct.
-- Elle ne lit jamais les comptes, abonnements, commandes des autres, dossiers OSB ni journaux.
CREATE TABLE IF NOT EXISTS publications (
  boutique_id TEXT PRIMARY KEY NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  contenu_json TEXT NOT NULL CHECK (json_valid(contenu_json)),
  publie_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
