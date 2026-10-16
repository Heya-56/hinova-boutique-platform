# AUDIT — Hinova Boutique Platform

Date : 15/10/2026 · Dépôt : `Heya-56/hinova-boutique-platform` · Branche : `main` (seule branche) · Commit audité : `fdf6046` « parcours complet d'inscription avec abonnement Stripe »

## 1. État réel du projet

Le générateur n'est pas un prototype : c'est une plateforme multi-commerçants **déjà fonctionnelle**, en JavaScript vanilla (ES modules), sur un **unique Worker Cloudflare** + **D1** (SQLite) + **R2** + **Workers AI**. ~2 900 lignes, une seule dépendance (`wrangler`, en dev).

Le projet `open-lovable-main` et un éventuel prototype React « Hinova Studio » **ne sont pas présents** dans ce dépôt ni fournis : non audités.

| Module | État | Preuve |
|---|---|---|
| Générateur IA (Workers AI Llama 3.3, repli par mots-clés) | Fonctionne | `src/ai.js`, tests §9 |
| Aperçu en direct, 4 modèles (Lagon, Pae, Tiare, Nuit) | Fonctionne | `src/landing.js`, `src/plans.js` |
| Inscription e-mail + mot de passe (PBKDF2), Google en option | Fonctionne | `src/index.js`, tests §2 |
| Abonnement Stripe (Checkout, portail, webhook signé) | Fonctionne, avec lacunes (§3) | `src/stripe.js` |
| Dashboard : produits, sections, commandes, factures, dossier OSB | Fonctionne | tests §3–§8 |
| Quota produits contrôlé côté serveur | Oui | `src/index.js:806` |
| Isolation par boutique | Oui, `AND boutique_id = ?` dans chaque requête | tests d'accès croisé |
| Paiement des ventes | Hors Hinova (virement, CCP/Marara, lien OSB/PayZen du commerçant) | conforme au principe « Hinova ne touche jamais l'argent des ventes » |
| Sous-domaine `<slug>.boutiques.hinovadigitalcorp.com` | Codé, non activé (`ROOT_DOMAIN` vide → `/b/<slug>`) | `wrangler.toml` |
| Domaine personnalisé | **Absent** | README « prochaines étapes » |
| Documents juridiques versionnés | **Absents** (case CGU cochée, aucune trace de version) | — |
| Journal d'audit, journal des paiements | **Absents** | — |
| E-mails transactionnels | **Absents** | README |
| Admin Hinova | Fonctionne (boutiques, MRR, suspension, OSB) | `src/index.js:1100+` |
| Suspension auto des impayés | Cron quotidien 16h UTC (6h Tahiti) | `wrangler.toml` |

## 2. Tests réellement exécutés

`npm ci` → migrations locales `0001→0003` → `wrangler dev --env test` → `test/smoke.sh`.

- 1er passage : **74/76**. Échecs : webhook Stripe (rattachement, résiliation).
- Cause : `STRIPE_WEBHOOK_SECRET` absent de `.dev.vars` ; le README ne le mentionne pas.
- 2e passage avec ce secret : **76/76 réussis**.

Non testé (impossible sans accès) : déploiement réel, Stripe réel, Workers AI réel, Google OAuth, état de la base D1 distante.

## 3. Constats et risques

| # | Gravité | Constat |
|---|---|---|
| R1 | **Critique** | `/demarrer` crée une boutique **sans paiement** si `STRIPE_SECRET_KEY` est absente (comportement voulu en dev, testé). Une clé oubliée ou expirée en production = boutiques gratuites. |
| R2 | Élevée | Webhook Stripe sans **idempotence** ni **journal** : pas de stockage de `event.id`, pas de gestion d'ordre des événements, `invoice.payment_failed` ignoré. |
| R3 | Élevée | Aucune trace d'acceptation des CGU/CGV (version, date, compte). Non opposable. |
| R4 | Moyenne | Secrets de session et du webhook rangés dans la table D1 `config` plutôt qu'en secrets Worker : toute fuite de la base expose la signature des sessions. |
| R5 | Moyenne | `DEV_LOGIN=1` permet une connexion sans mot de passe : aucun garde-fou technique en production (seulement une consigne). |
| R6 | Moyenne | Changement de formule à la baisse : aucun traitement des produits au-delà du nouveau quota. |
| R7 | Faible | Contrôle de quota en deux temps (compter puis insérer) : course possible sur requêtes simultanées. |
| R8 | Faible | Limitation de débit (`/api/generer`, `/commander`, `/demarrer`) confiée à des règles WAF manuelles, non versionnées. |
| R9 | Info | README incomplet : `STRIPE_WEBHOOK_SECRET` absent, étape 4 cite 2 migrations sur 3. |

## 4. Écarts entre la mission et l'existant (décisions requises)

| Sujet | Mission | Existant | Recommandation |
|---|---|---|---|
| Base de données | Supabase PostgreSQL + RLS | D1 (Cloudflare) | **Garder D1.** Tout tient sur un seul cloud (Cloudflare), sans coût fixe. Migrer vers Supabase = réécrire 100 % de l'accès aux données pour un gain RLS compensable par une couche d'accès et des tests d'isolation. |
| Déploiement | Un dépôt + un projet Pages + un Worker **par client** | Un Worker mutualisé pour toutes les boutiques | **Garder le mutualisé.** À 1 500–14 500 XPF/mois, un dépôt et un projet par client multiplient les quotas, les coûts et la maintenance. Les mises à jour de modèle sont instantanées pour tous. Le déploiement isolé reste une option « Premium/sur devis ». |
| Frontend | React + TypeScript + Vite | HTML rendu serveur, JS vanilla | Garder. Fonctionne sur mobile, sans build, tests passants. |
| Grille | Essentiel 4 200 · 6 produits / Business 9 900 · 17 / Premium 14 500 · 36 | Mini 1 500 · 9 / Standard 4 900 · 16 / Plus 9 900 · 32 (+ quotas de ventes 50/85/125) et 6 prix Stripe déjà créés | **Décision à prendre.** Changer = nouveaux prix Stripe + migration des boutiques existantes. |
| Registrar | OVHcloud | — | À vérifier avant de choisir (voir ARCHITECTURE §5). |
| Domaine perso | 20 USD/an | Grille interne : domaine offert 1re année puis 2 000 XPF/an | **Décision à prendre.** |

## 5. Secrets et accès

Présence non vérifiable depuis ici (aucun accès au compte Cloudflare de production). Valeurs jamais affichées.

| Secret / accès | Obligatoire | Statut |
|---|---|---|
| `STRIPE_SECRET_KEY` | Oui | À confirmer en production |
| `STRIPE_WEBHOOK_SECRET` | Oui | Non documenté — à confirmer |
| `SESSION_SECRET` | Oui | Actuellement généré en table `config` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Non | Optionnel |
| `OSB_WEBHOOK_URL` | Non | Optionnel |
| Jeton API Cloudflare (Custom Hostnames, DNS) | Pour domaines perso | Absent |
| Accès push au dépôt depuis Claude | Pour livrer | Lecture seule dans cette session |

## 6. Skills existants

Aucun dossier `.claude/skills/` dans le dépôt. Les 9 skills demandés n'existent pas encore ; voir IMPLEMENTATION_PLAN §3.
