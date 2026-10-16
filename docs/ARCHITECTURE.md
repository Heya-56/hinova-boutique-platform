# ARCHITECTURE — cible recommandée

Principe : **faire évoluer l'existant, tout sur Cloudflare.** Aucune réécriture React/Supabase ; on renforce ce qui marche (76/76 tests).

## 1. Vue d'ensemble

```
Visiteur ─┐                         ┌─ D1  (comptes, boutiques, catalogue, commandes, journaux)
Commerçant├─► Worker « hinova-boutique-platform » ─┼─ R2  (images)
Acheteur ─┤   (routage par hôte)    ├─ Workers AI (optionnel, repli déterministe)
Admin ────┘                         └─ API Cloudflare (Custom Hostnames, Registrar)
                 ▲                ▲
         Stripe (abonnements     OSB / PayZen, virement, CCP
         Hinova uniquement)      (ventes : argent direct au commerçant)
```

## 2. Choix et justification

| Couche | Choix | Pourquoi pas l'alternative de la mission |
|---|---|---|
| Calcul | 1 Worker mutualisé, routage par `Host` | Un Worker + un dépôt + un projet Pages par client = N× quotas, N× déploiements, mises à jour du modèle à propager. Le mutualisé met tout le monde à jour en un déploiement. |
| Données | D1 | Reste sur un seul cloud, pas de coût fixe. L'absence de RLS est compensée par une couche d'accès obligatoire (§3). |
| Auth | Maison (PBKDF2 + session HMAC) + Google | Déjà testée. Supabase Auth ajouterait un second fournisseur. |
| Images | R2 (2 Mo max) | Déjà en place. |
| IA | Workers AI derrière `src/ai.js`, repli par mots-clés | Hugging Face possible plus tard : même interface. Le mode sans IA existe déjà. |
| Abonnements Hinova | Stripe (Hinova = EI domiciliée en France) | — |
| Ventes commerçants | Liens/coordonnées propres au commerçant (OSB/PayZen, virement, CCP) | Pas de marketplace : interdit localement (licence EDP), et principe Hinova. |
| Domaines | **Cloudflare for SaaS** (Custom Hostnames) + **Cloudflare Registrar API** | OVH ajouterait un 2e fournisseur ; l'API Registrar Cloudflare existe (bêta, voir §5). |
| Airtable | Non retenu pour le catalogue | Le catalogue est déjà dans D1 ; Airtable doublerait la source de vérité et coûterait par base. |

## 3. Isolation multi-tenant

- Tenant = `boutiques.id`. Chaque table métier porte `boutique_id NOT NULL`.
- La boutique courante vient **toujours** de la session (dashboard) ou de l'hôte (vitrine), **jamais** d'un paramètre d'URL ou de formulaire.
- Règle à rendre structurelle : toute requête métier passe par un helper `scoped(env, b)` qui injecte `boutique_id`. Un test de non-régression parcourt les routes avec la session d'une boutique A et les identifiants d'une boutique B → 404 attendu partout.

## 4. Modèle de données (correspondance avec la mission)

| Mission | Existant | Action |
|---|---|---|
| profiles, tenant_members | `utilisateurs` (1 compte ↔ 1 boutique) | Suffisant pour le MVP |
| tenants, sites | `boutiques` | — |
| plans | `src/plans.js` (côté serveur) | Garder en code, versionné |
| subscriptions | colonnes Stripe sur `boutiques` | Ajouter `abonnement_statut` |
| orders / order_items | `commandes` + `lignes_json` | Suffisant |
| payment_events | — | **Créer** (idempotence par `event.id`) |
| audit_logs | — | **Créer** |
| legal_documents + acceptations | — | **Créer** |
| custom_domains | — | **Créer** (phase domaines) |
| provisioning_jobs | — | Inutile en mutualisé |
| catalog_connections | — | Inutile (pas d'Airtable) |

## 5. Domaines

1. **Sous-domaine inclus** : `<slug>.boutiques.hinovadigitalcorp.com` (wildcard DNS + route Worker). Déjà codé ; à activer (`ROOT_DOMAIN`).
2. **Domaine du client déjà possédé** : Custom Hostname Cloudflare for SaaS → le client pose un CNAME → validation + certificat TLS automatiques → statut suivi dans `custom_domains`.
3. **Achat par Hinova** : Registrar API Cloudflare (bêta, vérifiée le 15/10/2026 dans la doc officielle) : recherche, vérification prix/disponibilité en temps réel, enregistrement. Limites actuelles : sous-ensemble de TLD seulement, **pas de renouvellement, transfert ni modification de contact par API** (à faire au tableau de bord), achat débité sur le moyen de paiement du compte Hinova, non remboursable. Le contact titulaire doit être celui du **client** (passé dans la requête), pas celui par défaut d'Hinova.
4. Règle : afficher le prix réel retourné par `check` avant toute validation ; aucun achat sans confirmation explicite du client.

## 6. Flux d'abonnement

`/demarrer` → `inscriptions` (en attente) → Stripe Checkout → webhook signé (source de vérité) **et** `/bienvenue` (lecture serveur de la session Checkout, jamais du seul retour navigateur) → création idempotente de la boutique.
États : `essai → active → impayee (grâce 3 j) → suspendue → resiliee`.
