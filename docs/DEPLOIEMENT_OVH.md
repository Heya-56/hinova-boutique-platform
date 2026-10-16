# Duplicata OVHcloud

Objectif : une copie complète et récente de la plateforme chez un hébergeur français, pour réduire l'exposition au CLOUD Act (Cloudflare est une société américaine) et pouvoir basculer si besoin. Le statut juridique exact de la copie (OVHcloud SAS, région France) est **à faire confirmer par la juriste**.

## Étape 1 — Sauvegarde quotidienne chiffrée (prête)
| Élément | Détail |
|---|---|
| Quoi | Base complète (`wrangler d1 export`) + tous les fichiers R2 (images, justificatifs OSB) |
| Où | OVHcloud Object Storage (S3), région France (ex. Gravelines `gra`), bucket **privé** |
| Quand | Tous les jours à 5 h 30 (Tahiti) — `.github/workflows/sauvegarde-ovh.yml`, ou à la main : `bash scripts/sauvegarde.sh` |
| Protection | Base chiffrée AES-256 (PBKDF2, 200 000 itérations) avant envoi ; fichiers chiffrés côté serveur (`--sse AES256`) |
| Contrôle | Chaque export est restauré dans un SQLite neuf avant l'envoi (`scripts/verifier-restauration.py` : intégrité, clés étrangères, tables, volumes). Testé le 16/10/2026 sur la base locale : intégrité ok, 0 orphelin, 13 tables présentes. |

### À créer chez OVHcloud (15 min)
1. Public Cloud → Object Storage → conteneur S3 **privé**, région France.
2. Utilisateur S3 dédié à la sauvegarde (droits limités à ce conteneur) → clé d'accès + secret.
3. GitHub → dépôt → Settings → Environments → `production` :
   - Secrets : `CLOUDFLARE_API_TOKEN` (droits D1 lecture), `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (lecture seule), `OVH_ACCESS_KEY_ID`, `OVH_SECRET_ACCESS_KEY`, `BACKUP_PASSPHRASE` (longue phrase, conservée hors ligne : sans elle, la sauvegarde est illisible).
   - Variables : `OVH_S3_ENDPOINT`, `OVH_S3_REGION`, `OVH_BUCKET`.
4. Activer une règle de cycle de vie : conserver 30 sauvegardes quotidiennes + 12 mensuelles.

### Restaurer
```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in base.sql.enc -out base.sql -pass env:BACKUP_PASSPHRASE
python3 scripts/verifier-restauration.py base.sql
npx wrangler d1 execute <nouvelle_base> --remote --file base.sql   # vers Cloudflare
# ou : sqlite3 hinova.db < base.sql                                # vers un serveur OVH
```

## Étape 2 — Plateforme de secours en service chez OVHcloud (à construire)
Le code tourne sur Cloudflare Workers. Pour qu'il tourne aussi sur un serveur OVH :
- **Adaptateur** : remplacer les liaisons Cloudflare par des équivalents standards — `env.DB` → SQLite (fichier local), `env.IMAGES` → OVHcloud Object Storage (S3), `env.AI` → désactivé (le générateur a déjà un mode sans IA).
- **Serveur** : un VPS ou une instance Public Cloud OVH (France), Node.js derrière un reverse proxy HTTPS.
- **Bascule** : DNS des domaines `app.` et `boutiques.` vers OVH ; restauration de la dernière sauvegarde.
- **Limite connue** : le paiement Stripe et l'API Brevo restent des services externes, quelle que soit la plateforme.

Ce chantier se fait après la mise en production, une fois la sauvegarde de l'étape 1 en place.
