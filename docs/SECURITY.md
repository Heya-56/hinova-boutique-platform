# SECURITY

## Acquis (vérifiés par les tests)
- Échappement HTML systématique, contrôle d'origine sur tous les POST, cookies HttpOnly/Secure/SameSite.
- Mots de passe PBKDF2-SHA256 salés ; sessions signées HMAC (cookie falsifié refusé).
- Webhook Stripe : signature HMAC vérifiée, tolérance 5 min, comparaison à temps constant.
- Isolation : `boutique_id` dans chaque requête du dashboard ; accès croisé testé.
- Quota produits contrôlé côté serveur ; réservation de stock atomique.
- Redirections internes uniquement ; pages internes `X-Frame-Options: DENY`.
- Aucune donnée de carte stockée : Stripe (abonnements) et OSB (ventes) les détiennent.

## À corriger (par priorité)
| # | Action | Phase |
|---|---|---|
| S1 | Refuser `/demarrer` en production si Stripe n'est pas configuré (mode gratuit autorisé seulement si `ENVIRONMENT = "test"`) | 1er incrément |
| S2 | Table `paiements_evenements` : `event.id` unique → un événement déjà traité est ignoré ; journal complet | 1er incrément |
| S3 | Traiter `invoice.payment_failed` → statut `impayee` + journal | 1er incrément |
| S4 | `DEV_LOGIN` ignoré hors `ENVIRONMENT = "test"` (garde-fou technique, plus seulement une consigne) | 1er incrément |
| S5 | `SESSION_SECRET` et `STRIPE_WEBHOOK_SECRET` en secrets Worker obligatoires ; la table `config` ne sert plus que de repli migratoire | Phase 2 |
| S6 | Journal d'audit (connexion, changement de formule, suspension, publication, actions admin) | Phase 2 |
| S7 | Quota produits atomique (`INSERT … SELECT … WHERE (SELECT COUNT(*)) < ?`) | Phase 2 |
| S8 | Limitation de débit versionnée (binding Rate Limiting du Worker) sur `/api/generer`, `/demarrer`, `/connexion`, `/commander` | Phase 3 |
| S9 | Jeton API Cloudflare à périmètre minimal (Custom Hostnames + Registrar), jamais exposé au navigateur | Phase domaines |

## Règles permanentes
- Aucun secret dans le dépôt, le HTML ou les journaux.
- Aucune action réelle (achat de domaine, paiement, suppression, déploiement production) sans confirmation explicite.
- Documents juridiques : jamais rédigés ni modifiés par l'IA sans validation de la juriste.
