# Hinova Boutique Platform

Plateforme de boutiques en ligne pour la Polynésie française. Un seul Worker Cloudflare sert **toutes** les boutiques : une base D1, un bucket R2, aucun serveur.

- **Le visiteur** arrive sur un carrousel de boutiques réelles (4 modèles). Il choisit celle qui lui plaît, se connecte avec Google, et sa boutique est créée.
- **Le commerçant** gère tout depuis son téléphone : produits, vitrine par sections, commandes, factures, dossier OSB.
- **Ses clients** commandent et paient **directement le commerçant** (virement, espèces au guichet CCP / Marara Paiement, carte via son lien OSB / PayZen). Hinova ne touche jamais l'argent des ventes.
- **Hinova** encaisse l'abonnement. Une boutique impayée passe automatiquement hors ligne.

## Fonctionnalités

| Module | Détail |
|---|---|
| Générateur IA | Le visiteur décrit son activité en une phrase : Workers AI (Llama 3.3 70B, sortie JSON) propose nom, modèle, couleurs, textes, sections et 4 à 6 produits ; aperçu en direct dans un téléphone ; la boutique créée reprend tout. Si l'IA est indisponible ou lente (15 s), une proposition automatique par mots-clés prend le relais, annoncée comme telle |
| Accueil | Look « IA / tech » : générateur en tête, carrousel des 4 modèles, étapes, formules |
| Panier | Bouton « Ajouter au panier », compteur, panneau latéral (quantités, total, coordonnées et validation), mémorisé sur le téléphone ; sans JavaScript, la commande classique reste disponible |
| Connexion | Google uniquement (`utilisateurs.email_google`) ; session signée HMAC, 30 jours ; les e-mails de `ADMIN_EMAILS` deviennent administrateurs |
| Création | Modèle, adresse, formule, cycle ; 14 jours offerts ; sections par défaut |
| Modèles | Lagon, Pae, Tiare, Nuit : ambiance, typographie, arrondis ; couleurs principale et secondaire, logo |
| Sections | Bandeau, bannière, produits et commande, texte, points forts, FAQ, contact. Ordonner, masquer, modifier, ajouter (12 max). Validation stricte côté serveur |
| Produits | Table `offres` : photo R2 (2 Mo), stock, position ; blocage au quota de la formule |
| Commandes | Réservation de stock atomique, instructions de paiement, bon de commande + étiquette postale imprimables |
| Factures | Numéro séquentiel par boutique (`compteurs_factures`) émis au paiement, page facture imprimable, envoi par e-mail ou WhatsApp |
| Quotas | Ventes payées comptées par mois (`ventes_mensuelles`) ; dépassement signalé |
| Dossier OSB | Formulaire commerçant → `dossiers_osb` + webhook `OSB_WEBHOOK_URL` ; suivi des statuts dans l'admin |
| Admin | Boutiques, revenu mensuel récurrent, encaisser +1 / +12 mois, changer de formule, suspendre / réactiver, dossiers OSB |
| Suspension | Tâche planifiée quotidienne : échéance dépassée + 3 jours → hors ligne |
| Sécurité | Échappement HTML partout, contrôle d'origine sur les POST, cookies HttpOnly / Secure / SameSite, isolation par boutique dans chaque requête, redirections internes uniquement, anti-robots |

Formules (`src/plans.js`) : `plan_1` Mini 1 500 XPF · 9 produits · 50 ventes ; `plan_2` Standard 4 900 · 16 · 85 ; `plan_3` Plus 9 900 · 32 · 125. Annuel = 10 mois payés.

## Mise en production

**A. Google (15 min)** : Google Cloud Console → Identifiants → ID client OAuth « Application Web ».
URI de redirection autorisée : `https://<domaine-de-l-app>/auth/google/callback`.

**B. Cloudflare**
1. `npm install` puis `npx wrangler login`
2. `npx wrangler d1 create hinova_boutiques` → copier l'`database_id` dans `wrangler.toml`
3. `npx wrangler r2 bucket create hinova-boutiques-images`
4. `npm run db:remote` (applique `migrations/0001` puis `0002`)
5. Secrets : `npx wrangler secret put GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (64 caractères aléatoires), et si besoin `OSB_WEBHOOK_URL`
6. `wrangler.toml` : `ADMIN_EMAILS`, liens `PAY_LINK_PLAN_1/2/3`
7. `npm run deploy`

**C. Domaine**
8. Route `boutiques.hinovadigitalcorp.com/*` → Worker
9. Sous-domaines boutiques : DNS `*.boutiques` + route `*.boutiques.hinovadigitalcorp.com/*`, puis `ROOT_DOMAIN = "boutiques.hinovadigitalcorp.com"`. Sans cela, les boutiques sont à `/b/<adresse>`.

**D. Protection** : règle de limitation de débit (WAF) sur `POST */commander` et `/demarrer`.

**E. Juridique** : CGU de l'abonnement, mentions légales, politique de confidentialité (validées par la juriste).

> Ne jamais définir `DEV_LOGIN` en production : il permet de se connecter sans Google.

**Workers AI** : la liaison `AI` est déclarée dans `wrangler.toml`. Chaque génération consomme des « neurones » Workers AI ; l'offre gratuite en couvre un volume quotidien limité (voir la page de tarification Workers AI). Ajouter une règle de limitation de débit (WAF) sur `POST /api/generer`.

## Développement local

```bash
npm install
npm run db:local
cat > .dev.vars <<'EOF'
SESSION_SECRET="dev-secret-0123456789abcdef0123456789abcdef"
DEV_LOGIN="1"
ADMIN_EMAILS="admin@test.pf"
EOF
npm run dev                            # http://localhost:8787 (environnement « test », sans Workers AI : la proposition automatique est utilisée)
BASE=http://localhost:8787 npm test    # 64 vérifications de bout en bout
```

## Structure

```
migrations/0001_initial_schema.sql         Schéma initial (boutiques, utilisateurs, offres, commandes, dossiers OSB, compteurs)
migrations/0002_sections_contacts_paiements.sql  Ajouts : sections, contacts, moyens de paiement, infos de livraison
src/index.js     Routage, connexion Google, tableau de bord, vitrines, factures, admin, tâche planifiée
src/landing.js   Accueil : générateur IA et carrousel
src/ai.js        Génération par Workers AI et proposition automatique de secours
src/sections.js  Types de sections, validation, rendu
src/editor.js    Éditeur de sections (navigateur)
src/demo.js      Boutiques de démonstration
src/plans.js     Formules, modèles, moyens de paiement, îles
src/views.js     Gabarits application et vitrine
src/art.js       Illustrations SVG originales (démos, produits sans photo)
src/lib.js       Sessions signées, sécurité, dates, formatage
test/smoke.sh    Test de bout en bout
```

## Prochaines étapes

1. Envoi automatique des factures et notifications de commande par e-mail
2. Prolongation automatique de l'abonnement par webhook de paiement
3. Domaine personnalisé par boutique (option payante)
4. Statistiques de visite par boutique

Hinova Digital — Heianui Tapare
