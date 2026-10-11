# Hinova Boutiques — MVP

Générateur de boutiques en ligne multi-commerçants pour la Polynésie française.
Un seul Worker Cloudflare sert **toutes** les boutiques : une base D1, un bucket R2, zéro serveur.

- Le commerçant s'inscrit, choisit sa formule, ajoute ses produits depuis son téléphone : sa boutique est en ligne.
- Ses clients commandent et paient **directement le commerçant** (virement, espèces au guichet CCP / Marara Paiement, carte via son lien OSB/PayZen). Hinova ne touche jamais l'argent des ventes.
- Hinova encaisse l'abonnement ; une boutique impayée passe automatiquement hors ligne.

## Ce que fait le MVP

| Module | Détail |
|---|---|
| Inscription / connexion | E-mail + mot de passe (PBKDF2 100 000 itérations), session 30 jours, 14 jours d'essai |
| Formules | Mini 1 500 / Standard 4 900 / Plus 9 900 XPF par mois ; 9 / 16 / 32 produits ; 50 / 85 / 125 ventes par mois ; annuel = 10 mois payés. Tout se règle dans `src/plans.js` |
| Tableau de bord | Étapes d'ouverture, jauges produits et ventes, CA du mois, commandes à traiter, lien de paiement de l'abonnement |
| Produits | Ajout, modification, suppression, photo (R2, 2 Mo max), stock, visibilité ; blocage au quota |
| Vitrine | `/s/<boutique>` ou sous-domaine `<boutique>.votre-domaine`, 3 modèles graphiques (Lagon, Sable, Nuit), mobile d'abord |
| Commandes | Panier sur la vitrine, réservation de stock atomique, n° `CMD-AAMM-0001`, instructions de paiement, bouton WhatsApp, ventes hors quota signalées |
| Bon de commande | Page imprimable avec **étiquette postale** (expéditeur, destinataire, île, téléphone, référence) |
| Statuts | En attente → Payée → Expédiée / Annulée (l'annulation remet le stock) |
| Admin Hinova | `/admin` : toutes les boutiques, revenu mensuel récurrent, encaisser +1 / +12 mois, changer de formule, suspendre / réactiver, journal de facturation |
| Suspension auto | Tâche planifiée chaque jour : impayé + 3 jours de grâce → boutique hors ligne (page « indisponible ») |
| Sécurité | Échappement HTML partout, contrôle d'origine sur tous les POST, cookies HttpOnly/Secure/SameSite, anti-robots sur le formulaire de commande, isolation des données par boutique dans chaque requête |

## Checklist de mise en production

**A. Cloudflare (30 min)**
1. `npm install` puis `npx wrangler login`
2. `npx wrangler d1 create hinova_boutiques` → copier l'`database_id` dans `wrangler.toml`
3. `npx wrangler r2 bucket create hinova-boutiques-images`
4. `npm run db:remote` (crée les tables)
5. `npx wrangler secret put ADMIN_TOKEN` (clé longue et aléatoire, à garder dans un gestionnaire de mots de passe)
6. Renseigner dans `wrangler.toml` : `PAY_LINK_MINI`, `PAY_LINK_STANDARD`, `PAY_LINK_PLUS` (liens de paiement d'abonnement)
7. `npm run deploy`

**B. Domaine**
8. Route personnalisée : `boutiques.hinovadigitalcorp.com` → Worker
9. Sous-domaines boutiques : enregistrement DNS `*.boutiques` + route `*.boutiques.hinovadigitalcorp.com/*`, puis `ROOT_DOMAIN = "boutiques.hinovadigitalcorp.com"`

**C. Protection**
10. Règle de limitation de débit Cloudflare (WAF) sur `POST /connexion`, `/inscription`, `*/commander` : 10 requêtes / minute / IP
11. Activer Turnstile sur l'inscription si des robots apparaissent

**D. Juridique et commercial**
12. CGU / CGV abonnement (validées par ta juriste) : hors ligne en cas d'impayé, quotas, surplus, résiliation
13. Mentions légales et politique de confidentialité sur la page d'accueil
14. Procédure dossier OSB : le commerçant écrit au support, tu montes le dossier, il colle son lien de paiement dans « Ma boutique »

**E. Vérification finale**
15. Créer une vraie boutique test, passer une commande depuis un téléphone, imprimer le bon, encaisser l'abonnement dans `/admin`
16. Lancer `npm test` contre l'URL de production : `BASE=https://... ADMIN_TOKEN=... bash test/smoke.sh`

## Développement local

```bash
npm install
npm run db:local
echo 'ADMIN_TOKEN="dev-admin-cle-test"' > .dev.vars
npm run dev                       # http://localhost:8787
BASE=http://localhost:8787 npm test   # 28 vérifications de bout en bout
```

## Prochaines étapes (après les 10 premiers clients payants)

1. **Notifications** : e-mail ou WhatsApp au commerçant à chaque commande (Cloudflare Email Workers ou fournisseur transactionnel)
2. **Abonnement automatique** : webhook du prestataire de paiement → prolongation `paid_until` sans action manuelle
3. **Mot de passe oublié** (lien par e-mail)
4. **Facture automatique** au client final
5. **Statistiques** par boutique et nom de domaine personnalisé (option payante)

## Structure

```
schema.sql        Tables D1 : tenants, sessions, products, orders, billing_events
wrangler.toml     Config Worker, D1, R2, tâche planifiée, variables
src/index.js      Routage + toutes les pages (vitrine, tableau de bord, admin, cron)
src/plans.js      Grille des formules, moyens de paiement, statuts, îles
src/views.js      Gabarit HTML, 3 thèmes, styles
src/lib.js        Sécurité, cookies, mots de passe, dates, formatage XPF
test/smoke.sh     Test de bout en bout
```

Hinova Digital — Heianui Tapare
