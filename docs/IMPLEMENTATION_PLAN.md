# IMPLEMENTATION PLAN

Chaque phase : tests exécutés, build vérifié, résumé des fichiers, secrets manquants signalés. Pas de phase suivante si un risque critique reste ouvert.

## 0. Décisions à valider avant de coder
1. **Architecture** : garder Worker mutualisé + D1 (recommandé) ou migrer Supabase + un déploiement par client.
2. **Grille** : garder Mini 1 500 / Standard 4 900 / Plus 9 900 (9/16/32 produits) ou passer à Essentiel 4 200 / Business 9 900 / Premium 14 500 (6/17/36). Si changement : créer 6 nouveaux prix Stripe et décider du sort des boutiques existantes.
3. **Quotas de ventes** (50/85/125) : garder ou supprimer.
4. **Domaine perso** : 20 USD/an ou 2 000 XPF/an (domaine offert la 1re année).
5. **Registrar** : Cloudflare (recommandé, un seul cloud) ou OVH.

## Phase 1 — Fiabilité des paiements (1er incrément proposé, ~1 jour)
- Migration `0004` : `paiements_evenements` (event_id unique, type, boutique_id, payload résumé, traité_le), `journal_audit`.
- Webhook : idempotence, `invoice.payment_failed` → `impayee`, journalisation.
- `/demarrer` : plus de boutique gratuite hors environnement de test (S1) ; `DEV_LOGIN` verrouillé (S4).
- README : `STRIPE_WEBHOOK_SECRET`, 3 migrations.
- Tests ajoutés : événement rejoué une seule fois, échec de paiement, refus d'inscription sans Stripe en mode production.

## Phase 2 — Juridique et traçabilité
- Tables `documents_juridiques` (type, version, date, texte validé) et `acceptations` (compte, document, version, date, IP tronquée).
- Footer de chaque vitrine : CGV/CGU Hinova, mentions légales, confidentialité, + CGV propres du commerçant (champ dédié, séparé du contrat Hinova).
- Textes fournis par la juriste uniquement.

## Phase 3 — Grille, changements de formule, sécurité
- Application de la grille décidée ; rétrogradation : produits au-delà du quota masqués (pas supprimés).
- S5, S7, S8. Test d'isolation exhaustif sur toutes les routes.

## Phase 4 — Sous-domaines
- DNS wildcard + route, `ROOT_DOMAIN` ; tests de routage par hôte. Confirmation requise avant modification DNS production.

## Phase 5 — Domaines personnalisés
- Table `domaines_perso` ; Custom Hostnames (domaine existant) ; Registrar API (achat), prix réel affiché, confirmation explicite, titulaire = client.
- Rappels d'échéance (cron) ; renouvellement manuel tant que l'API ne le permet pas.

## Phase 6 — Dashboard et e-mails
- Historique des opérations, état des domaines, documents contractuels dans le dashboard.
- E-mails transactionnels (commande, facture, échec de paiement).

## Phase 7 — Mise en production
- Revue de sécurité, tests de bout en bout sur l'environnement de préproduction, puis déploiement après accord.

## 3. Skills Claude Code à créer (`.claude/skills/`)
Aucun n'existe. Créés au fil des phases, pas en bloc :
| Skill | Phase | Rôle |
|---|---|---|
| `ecommerce-payments` | 1 | Webhooks, idempotence, états d'abonnement |
| `security-audit` | 1 | Checklist S1–S9, isolation |
| `testing-and-qa` | 1 | Lancer `smoke.sh` local, règles « aucun test marqué réussi sans exécution » |
| `cloudflare-deployments` | 4 | D1, R2, routes, secrets, déploiement confirmé |
| `domain-provisioning` | 5 | Custom Hostnames, Registrar, confirmation d'achat |
| `github-automation` | au besoin | Branches, PR |
| `architecture-saas`, `ui-design-system` | au besoin | — |
`supabase-security` : non créé si D1 est retenu.
