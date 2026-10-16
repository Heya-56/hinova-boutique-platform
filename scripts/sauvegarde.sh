#!/usr/bin/env bash
# Duplicata chez OVHcloud : export de la base D1 + copie des fichiers R2 vers OVHcloud Object Storage (S3, région France).
# Variables : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
#             OVH_S3_ENDPOINT (ex. https://s3.gra.io.cloud.ovh.net), OVH_S3_REGION (ex. gra), OVH_ACCESS_KEY_ID,
#             OVH_SECRET_ACCESS_KEY, OVH_BUCKET, BACKUP_PASSPHRASE.
# La base est chiffrée (AES-256, clé dérivée PBKDF2) avant de quitter la machine ; le bucket OVH doit rester privé.
set -euo pipefail
STAMP=$(date -u +%Y-%m-%dT%H%MZ); OUT=$(mktemp -d)
echo "1/4 Export de la base D1"
npx wrangler d1 export hinova_boutiques --remote --output "$OUT/base.sql"
echo "2/4 Vérification de la restauration"
python3 scripts/verifier-restauration.py "$OUT/base.sql"
echo "3/4 Chiffrement et envoi chez OVHcloud"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$OUT/base.sql" -out "$OUT/base.sql.enc" -pass env:BACKUP_PASSPHRASE
AWS_ACCESS_KEY_ID=$OVH_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$OVH_SECRET_ACCESS_KEY \
  aws s3 cp "$OUT/base.sql.enc" "s3://$OVH_BUCKET/base/$STAMP.sql.enc" --endpoint-url "$OVH_S3_ENDPOINT" --region "$OVH_S3_REGION"
echo "4/4 Copie des fichiers (images, justificatifs) R2 → OVHcloud"
mkdir -p "$OUT/r2"
AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
  aws s3 sync "s3://hinova-boutiques-images" "$OUT/r2" --endpoint-url "https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com" --region auto --only-show-errors
AWS_ACCESS_KEY_ID=$OVH_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$OVH_SECRET_ACCESS_KEY \
  aws s3 sync "$OUT/r2" "s3://$OVH_BUCKET/fichiers" --endpoint-url "$OVH_S3_ENDPOINT" --region "$OVH_S3_REGION" --sse AES256 --only-show-errors
rm -rf "$OUT"
echo "Sauvegarde $STAMP terminée."
