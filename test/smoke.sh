#!/usr/bin/env bash
# Test de bout en bout : à lancer pendant que `npm run dev` tourne (base locale initialisée avec `npm run db:local`).
# Usage : BASE=http://localhost:8787 ADMIN_TOKEN=dev-admin-cle-test bash test/smoke.sh
set -u
BASE="${BASE:-http://localhost:8787}"
ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin-cle-test}"
TMP="$(mktemp -d)"; JAR="$TMP/jar"; AJAR="$TMP/ajar"
SLUG="test-$RANDOM$RANDOM"; EMAIL="$SLUG@exemple.pf"
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
ko()   { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else ko "$1"; fi; }
H=(-H "Origin: $BASE")

echo "1. Accueil et inscription"
check "page d'accueil 200" '[ "$(curl -s -o /dev/null -w %{http_code} $BASE/)" = 200 ]'
loc=$(curl -s -o /dev/null -w '%{redirect_url}' -c "$JAR" "${H[@]}" -X POST "$BASE/inscription" \
  --data-urlencode "name=Boutique Test" --data-urlencode "slug=$SLUG" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=motdepasse123" -d plan=mini -d billing=mensuel -d cgu=on)
check "inscription → tableau de bord" '[[ "$loc" == *tableau-de-bord* ]]'
check "inscription en double refusée" 'curl -s "${H[@]}" -X POST "$BASE/inscription" --data-urlencode "name=X" --data-urlencode "slug=$SLUG" --data-urlencode "email=autre$EMAIL" -d password=motdepasse123 -d cgu=on | grep -q "déjà prise"'
check "requête POST d'une autre origine refusée" '[ "$(curl -s -o /dev/null -w %{http_code} -H "Origin: https://pirate.example" -X POST $BASE/connexion)" = 403 ]'

echo "2. Tableau de bord et réglages"
check "tableau de bord accessible" 'curl -s -b "$JAR" $BASE/tableau-de-bord | grep -q "Période d’essai"'
check "sans session → connexion" '[[ "$(curl -s -o /dev/null -w %{redirect_url} $BASE/tableau-de-bord)" == */connexion ]]'
curl -s -o /dev/null -b "$JAR" "${H[@]}" -X POST "$BASE/tableau-de-bord/boutique" --data-urlencode "name=Boutique Test" -d theme=sable \
  --data-urlencode "bank_details=Titulaire TEST - Banque X - IBAN FR76 0000" --data-urlencode "ccp_details=Guichet Marara Paiement, référence obligatoire" \
  -d phone=89000000 -d whatsapp=68989000000 -d island=Moorea -d osb_link=
check "moyens de paiement enregistrés" 'curl -s -b "$JAR" $BASE/tableau-de-bord/boutique | grep -q "IBAN FR76"'
check "lien OSB non https refusé" '[[ "$(curl -s -o /dev/null -w %{redirect_url} -b "$JAR" "${H[@]}" -X POST $BASE/tableau-de-bord/boutique -d name=X -d osb_link=http://x)" == *err=* ]]'

echo "3. Produits (quota 9) et image R2"
printf '\x89PNG\r\n\x1a\n0000000000000000' > "$TMP/p.png"
curl -s -o /dev/null -b "$JAR" "${H[@]}" -F "name=Collier nacre" -F price=4500 -F stock=3 -F active=on -F "description=Nacre de Tahiti" -F "image=@$TMP/p.png;type=image/png" "$BASE/tableau-de-bord/produits"
for i in $(seq 2 9); do curl -s -o /dev/null -b "$JAR" "${H[@]}" -F "name=Produit $i" -F price=1000 -F stock=5 -F active=on "$BASE/tableau-de-bord/produits"; done
r=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR" "${H[@]}" -F "name=Produit 10" -F price=1000 -F stock=5 -F active=on "$BASE/tableau-de-bord/produits")
check "10e produit bloqué par le quota Mini" '[[ "$r" == *Limite* ]]'
check "fichier non image refusé" '[[ "$(curl -s -o /dev/null -w %{redirect_url} -b "$JAR" "${H[@]}" -F name=Y -F price=1 -F stock=1 -F "image=@$TMP/p.png;type=text/html" $BASE/tableau-de-bord/produits)" == *err=* ]]'
PAGE=$(curl -s "$BASE/s/$SLUG")
IMG=$(echo "$PAGE" | grep -o '/img/t_[a-f0-9]*/[a-f0-9]*\.png' | head -1)
check "vitrine publique avec produits" 'echo "$PAGE" | grep -q "Collier nacre"'
check "image servie depuis R2" '[ -n "$IMG" ] && [ "$(curl -s -o /dev/null -w %{http_code} $BASE$IMG)" = 200 ]'
P9=$(curl -s -b "$JAR" "$BASE/tableau-de-bord/produits" | tr '\n' ' ' | grep -o 'Produit 2</td>.\{0,200\}/tableau-de-bord/produits/p_[a-f0-9]*' | grep -o '/tableau-de-bord/produits/p_[a-f0-9]*')
curl -s -o /dev/null -b "$JAR" "${H[@]}" --form-string "name=<script>alert(1)</script>" -F price=1 -F stock=1 -F active=on "$BASE$P9"
check "XSS échappé (nom de produit piégé)" 'S=$(curl -s "$BASE/s/$SLUG"); echo "$S" | grep -q "&lt;script&gt;alert" && ! echo "$S" | grep -q "<script>alert"'
PID=$(echo "$PAGE" | grep -o 'name="q_p_[a-f0-9]*"' | head -1 | sed 's/name="q_//;s/"//')
COLLIER=$(echo "$PAGE" | grep -B6 'Collier nacre' >/dev/null; echo "$PAGE" | tr '\n' ' ' | grep -o 'Collier nacre.\{0,900\}' | grep -o 'q_p_[a-f0-9]*' | head -1 | sed 's/q_//')

echo "4. Commande client"
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "${H[@]}" -X POST "$BASE/s/$SLUG/commander" -d "q_$COLLIER=2" \
  --data-urlencode "customer_name=Hina Teriitehau" -d customer_phone=87112233 --data-urlencode "address=PK 12 côté mer, Paea" -d island=Tahiti -d payment_method=virement)
check "commande créée → confirmation" '[[ "$loc" == */commande/o_* ]]'
CONF=$(curl -s "$loc")
check "instructions de virement + référence" 'echo "$CONF" | grep -q "IBAN FR76" && echo "$CONF" | grep -q "CMD-"'
check "stock décrémenté (3 → 1)" '[[ "$(curl -s -b "$JAR" $BASE/tableau-de-bord/produits | tr "\n" " " | grep -o "Collier nacre</td><td>[^<]*</td><td>[0-9]*" )" == *">1" ]]'
check "surcommande refusée" '[[ "$(curl -s -o /dev/null -w %{redirect_url} "${H[@]}" -X POST $BASE/s/$SLUG/commander -d q_$COLLIER=5 -d customer_name=A -d customer_phone=1 -d address=B -d island=Tahiti -d payment_method=virement)" == *Stock* ]]'
check "moyen de paiement non configuré refusé" '[[ "$(curl -s -o /dev/null -w %{redirect_url} "${H[@]}" -X POST $BASE/s/$SLUG/commander -d q_$COLLIER=1 -d customer_name=A -d customer_phone=1 -d address=B -d island=Tahiti -d payment_method=carte)" == *err=* ]]'
OID=$(echo "$loc" | grep -o 'o_[a-f0-9]*')
check "bon de commande + étiquette" 'curl -s -b "$JAR" $BASE/tableau-de-bord/commandes/$OID | grep -q "Hina Teriitehau"'
curl -s -o /dev/null -b "$JAR" "${H[@]}" -X POST "$BASE/tableau-de-bord/commandes/$OID/statut" -d status=annulee
check "annulation → stock remis (1 → 3)" '[[ "$(curl -s -b "$JAR" $BASE/tableau-de-bord/produits | tr "\n" " " | grep -o "Collier nacre</td><td>[^<]*</td><td>[0-9]*" )" == *">3" ]]'

echo "5. Admin, encaissement, suspension"
check "admin protégé" '[[ "$(curl -s -o /dev/null -w %{redirect_url} $BASE/admin)" == */admin/connexion ]]'
curl -s -o /dev/null -c "$AJAR" "${H[@]}" -X POST "$BASE/admin/connexion" -d "token=$ADMIN_TOKEN"
ADMIN=$(curl -s -b "$AJAR" "$BASE/admin")
check "admin liste la boutique" 'echo "$ADMIN" | grep -q "$SLUG"'
TID=$(echo "$ADMIN" | grep -o "/admin/t_[a-f0-9]*/paiement" | head -1 | cut -d/ -f3)
curl -s -o /dev/null -b "$AJAR" "${H[@]}" -X POST "$BASE/admin/$TID/paiement" -d months=1
check "encaissement → statut actif" 'curl -s -b "$JAR" $BASE/tableau-de-bord | grep -q ">Actif<"'
curl -s -o /dev/null -b "$AJAR" "${H[@]}" -X POST "$BASE/admin/$TID/suspendre"
check "boutique suspendue → vitrine 503" '[ "$(curl -s -o /dev/null -w %{http_code} $BASE/s/$SLUG)" = 503 ]'
check "commerçant voit l'alerte hors ligne" 'curl -s -b "$JAR" $BASE/tableau-de-bord | grep -q "hors ligne"'
curl -s -o /dev/null -b "$AJAR" "${H[@]}" -X POST "$BASE/admin/$TID/reactiver"
check "réactivation → vitrine 200" '[ "$(curl -s -o /dev/null -w %{http_code} $BASE/s/$SLUG)" = 200 ]'

echo "6. Connexion / déconnexion"
curl -s -o /dev/null -b "$JAR" "$BASE/deconnexion"
check "mauvais mot de passe refusé" '[[ "$(curl -s -o /dev/null -w %{redirect_url} "${H[@]}" -X POST $BASE/connexion -d email=$EMAIL -d password=faux12345)" == *err=* ]]'
check "bon mot de passe accepté" '[[ "$(curl -s -o /dev/null -w %{redirect_url} "${H[@]}" -X POST $BASE/connexion -d email=$EMAIL -d password=motdepasse123)" == *tableau-de-bord ]]'

echo; echo "Résultat : $PASS réussis, $FAIL échoués"
rm -rf "$TMP"; [ "$FAIL" = 0 ]
