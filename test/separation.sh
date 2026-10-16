#!/usr/bin/env bash
# Séparation application privée / vitrines publiques.
# Lancer un second serveur : npx wrangler dev --env test --port 8790 --var ROOT_DOMAIN:boutiques.test --var APP_HOST:app.test
# puis : BASE=http://localhost:8790 bash test/separation.sh
set -u
BASE="${BASE:-http://localhost:8790}"; R=$RANDOM$RANDOM; PASS=0; FAIL=0
check(){ if eval "$2"; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1"; FAIL=$((FAIL+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
APP=(-H 'Host: app.test'); SHOP=(-H "Host: sep-$R.boutiques.test")
C=$(curl -s -D - -o /dev/null "${APP[@]}" -H 'Origin: http://app.test' -X POST "$BASE/demarrer" -d nom=Sep -d sous_domaine=sep-$R -d modele=lagon -d plan=plan_1 \
  -d email=s$R@test.pf -d password=motdepasse123 -d cgu=on -d titulaire=on | grep -i '^set-cookie' | sed 's/^[^:]*: //; s/;.*//' | tr -d '\r')
echo "Séparation application / vitrines"
check "le cookie de session n'a pas d'attribut Domain (envoyé à l'application seule)" '! curl -s -D - -o /dev/null "${APP[@]}" -H "Origin: http://app.test" -X POST "$BASE/connexion" -d email=s$R@test.pf -d password=motdepasse123 | grep -qi "set-cookie:.*domain="'
check "tableau de bord accessible sur l'application" '[ "$(code -H "Cookie: $C" "${APP[@]}" $BASE/tableau-de-bord)" = 200 ]'
check "vitrine en ligne sur son sous-domaine" '[ "$(code "${SHOP[@]}" $BASE/)" = 200 ]'
for p in /tableau-de-bord /tableau-de-bord/produits /admin /admin/osb /connexion /demarrer /api/generer /auth/dev /bienvenue /api/stripe/webhook /f/0123456789abcdef0123456789abcdef; do
  check "vitrine : $p inexistant, même avec un cookie" '[ "$(code -H "Cookie: $C" "${SHOP[@]}" "$BASE$p")" = 404 ]'
done
check "autre hôte → redirigé vers l'application" '[ "$(code $BASE/tableau-de-bord)" = 301 ]'
check "/b/<boutique> sur l'application → redirigé vers la vitrine" '[[ "$(curl -s -o /dev/null -w "%{redirect_url}" "${APP[@]}" $BASE/b/sep-$R)" == "https://sep-$R.boutiques.test/" ]]'
echo; echo "Résultat : $PASS réussis, $FAIL échoués"; [ "$FAIL" = 0 ]
