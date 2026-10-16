# IMPLEMENTATION PLAN

Chaque phase : tests exécutés, build vérifié, résumé des fichiers, secrets manquants signalés. Pas de phase suivante si un risque critique reste ouvert.

## 0. Décisions validées (15/10/2026)
1. Architecture : Worker mutualisé + D1 (pas de Supabase).
2. Grille : Mini 1 500 / Standard 4 900 / Plus 9 900 XPF (9/16/32 produits) conservée ; option paiement en ligne PayZen avec dossier OSB justifié, **2 200 XPF par mois**, ajoutée à l'abonnement Stripe à la validation du dossier ou **20 000 XPF par an** pour les abonnements annuels (prix Stripe `price_1UR31eCVrYZbi1ZGheJAKAPz` mensuel et `price_1UR3BCCVrYZbi1ZGXnBC8QZI` annuel, créés le 15/10/2026).
3. Quotas de ventes 50/85/125 conservés.
4. Domaine personnalisé : 2 000 XPF/an.
5. Tout sur Cloudflare, avec données en juridiction UE (RGPD) ; portabilité vers un hébergement souverain polynésien plus tard.

## Phase 1 — Fiabilité des paiements et dossier OSB : FAITE (88/88 tests)
- Migration `0004` : `paiements_evenements`, `journal_audit`, `abonnement_statut`, `osb_justificatifs`.
- Webhook idempotent, `invoice.payment_failed` géré, audit des événements.
- Inscription sans paiement et connexion de test bloquées hors `ENVIRONMENT = "test"`.
- Dossier OSB : justificatifs privés, consentement daté, frais PayZen, plus aucun envoi externe.

## PayZen : quelle formule OSB pour quel usage (d'après la présentation OSB)
- **START** (TPE virtuel, lien ou e-mail de paiement) : ce que la plateforme gère déjà — le commerçant colle son lien de paiement, le statut de commande est mis à jour à la main.
- **PRO** (paiement intégré au site) : prochaine étape — page de paiement OSB appelée depuis le panier et confirmation automatique de la commande par notification signée. Documentation : https://secure.osb.pf/doc/fr-FR/ (à étudier avant de coder).
- **EXPERT** (API REST, abonnements) : non nécessaire pour les boutiques ; utile plus tard si Hinova encaisse ses propres abonnements via OSB.

## Phase 2 (16/10/2026) — Séparation et parcours d'essai : FAITE (102/102 + 16/16)
- Application privée (`APP_HOST`) et vitrines (`<boutique>.ROOT_DOMAIN`) strictement séparées ; aucune route privée sur une vitrine, même avec un cookie.
- Vitrine en lecture seule sur `publications` (copie publique), republiée à chaque modification du tableau de bord.
- 3 essais gratuits sans compte ; import d'image (capture de réseau social ou photo) lue par le modèle vision, jamais stockée.
- Monogramme automatique quand la boutique n'a pas de logo ; panier toujours visible en haut à droite.
- Acheteurs sans compte ; fiches clients = offre sur devis via le commercial Hinova (à ajouter sur la page des formules).

## Phase 1 bis — Données en UE (avant mise en production)
- Nouvelle base D1 et nouveau bucket R2 en juridiction `eu`, transfert, bascule (voir CONFORMITE.md §2).

## (archive) Périmètre initial de la phase 1
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
