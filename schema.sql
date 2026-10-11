-- Hinova Boutiques — schéma D1 (multi-boutiques sur une seule base)
-- Appliquer : npx wrangler d1 execute hinova_boutiques --remote --file=schema.sql

PRAGMA foreign_keys = ON;

-- Une ligne = une boutique cliente (un commerçant)
CREATE TABLE IF NOT EXISTS tenants (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,          -- adresse : /s/<slug> ou <slug>.domaine
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'mini',       -- mini | standard | plus (cf. src/plans.js)
  billing       TEXT NOT NULL DEFAULT 'mensuel',    -- mensuel | annuel
  status        TEXT NOT NULL DEFAULT 'essai',      -- essai | actif | suspendu
  paid_until    TEXT NOT NULL,                      -- ISO date ; au-delà + délai de grâce => suspension auto
  tagline       TEXT DEFAULT '',
  theme         TEXT NOT NULL DEFAULT 'lagon',      -- lagon | sable | nuit
  phone         TEXT DEFAULT '',
  whatsapp      TEXT DEFAULT '',
  island        TEXT DEFAULT '',
  bank_details  TEXT DEFAULT '',                    -- RIB affiché pour le virement
  ccp_details   TEXT DEFAULT '',                    -- consignes paiement espèces / CCP Marara Paiement
  osb_link      TEXT DEFAULT '',                    -- lien de paiement carte fourni par OSB/PayZen (optionnel)
  pickup_info   TEXT DEFAULT '',                    -- retrait / expédition
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_xpf   INTEGER NOT NULL CHECK (price_xpf >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_key   TEXT DEFAULT '',                      -- clé R2
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, active);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number         TEXT NOT NULL,                     -- ex. CMD-2610-0007
  customer_name  TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  customer_phone TEXT NOT NULL,
  address        TEXT NOT NULL,
  island         TEXT NOT NULL,
  note           TEXT DEFAULT '',
  items_json     TEXT NOT NULL,                     -- [{id,name,qty,price}]
  total_xpf      INTEGER NOT NULL,
  payment_method TEXT NOT NULL,                     -- virement | ccp | carte
  status         TEXT NOT NULL DEFAULT 'en_attente',-- en_attente | payee | expediee | annulee
  over_quota     INTEGER NOT NULL DEFAULT 0,        -- vente au-delà du quota mensuel du plan
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, created_at);

-- Journal des paiements d'abonnement saisis par l'admin Hinova
CREATE TABLE IF NOT EXISTS billing_events (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                         -- paiement | suspension | reactivation | changement_plan
  detail     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
