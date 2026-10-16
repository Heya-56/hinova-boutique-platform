-- Migration 0006 : essais gratuits du générateur (sans compte).
-- La clé est une empreinte HMAC de l'adresse IP (aucune IP en clair) ; le compteur repart à zéro après 30 jours.
CREATE TABLE IF NOT EXISTS essais_generation (
  cle TEXT PRIMARY KEY NOT NULL,
  nombre INTEGER NOT NULL DEFAULT 0 CHECK (nombre >= 0),
  depuis TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
