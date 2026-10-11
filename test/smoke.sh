#!/usr/bin/env bash
# Test de bout en bout, en local uniquement (nécessite DEV_LOGIN="1" et ADMIN_EMAILS="admin@test.pf" dans .dev.vars).
# 1) npm run db:local   2) npm run dev   3) BASE=http://localhost:8787 npm test
set -u
BASE="${BASE:-http://localhost:8787}"
TMP="$(mktemp -d)"; J="$TMP/j"; J2="$TMP/j2"; JA="$TMP/ja"
R=$RANDOM$RANDOM; SLUG="test-$R"; EMAIL="marchand$R@test.pf"
PASS=0; FAIL=0
check(){ if eval "$2"; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1"; FAIL=$((FAIL+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
loc(){ curl -s -o /dev/null -w '%{redirect_url}' "$@"; }
H=(-H "Origin: $BASE")
login(){ curl -s -o /dev/null -c "$1" "$BASE/auth/dev?email=$2&next=${3:-/tableau-de-bord}"; }

echo "1. Accueil et démonstrations"
LAND=$(curl -s "$BASE/")
check "accueil : carrousel de 4 boutiques" '[ "$(echo "$LAND" | grep -o "class=\"slide" | wc -l)" = 4 ]'
check "chaque diapositive charge sa démo" '[ "$(echo "$LAND" | grep -o "src=\"/demo/" | wc -l)" = 4 ]'
for m in lagon pae tiare nuit; do check "démo $m en ligne et encadrable par le site" '[ "$(curl -s -D - -o /dev/null $BASE/demo/'$m' | grep -ci "x-frame-options: SAMEORIGIN")" = 1 ]'; done
check "démo : formulaire de commande désactivé" 'curl -s $BASE/demo/lagon | grep -q "Boutique de démonstration"'
check "pages internes non encadrables" 'curl -s -D - -o /dev/null $BASE/connexion | grep -qi "x-frame-options: DENY"'

echo "2. Connexion et création de boutique"
check "tableau de bord sans session → connexion" '[[ "$(loc $BASE/tableau-de-bord)" == */connexion* ]]'
check "redirection externe bloquée après connexion" '[[ "$(loc "$BASE/auth/dev?email=x@test.pf&next=//pirate.example")" == "$BASE/tableau-de-bord" ]]'
login "$J" "$EMAIL"
check "nouveau compte → création de boutique" '[[ "$(loc -b "$J" $BASE/tableau-de-bord)" == */demarrer ]]'
check "POST d’une autre origine refusé" '[ "$(code -b "$J" -H "Origin: https://pirate.example" -X POST $BASE/demarrer)" = 403 ]'
r=$(loc -b "$J" "${H[@]}" -X POST "$BASE/demarrer" --data-urlencode "nom=Boutique Test" -d sous_domaine=$SLUG -d modele=tiare -d plan=plan_1 -d cycle=mensuel -d cgu=on)
check "boutique créée" '[[ "$r" == */tableau-de-bord?ok=* ]]'
check "tableau de bord affiché" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "Boutique Test"'
login "$J2" "autre$R@test.pf"
check "adresse déjà prise refusée" 'curl -s -b "$J2" "${H[@]}" -X POST $BASE/demarrer --data-urlencode "nom=X" -d sous_domaine=$SLUG -d modele=lagon -d plan=plan_1 -d cgu=on | grep -q "déjà prise"'
curl -s -o /dev/null -b "$J2" "${H[@]}" -X POST "$BASE/demarrer" --data-urlencode "nom=Autre" -d sous_domaine=autre-$R -d modele=lagon -d plan=plan_1 -d cgu=on

echo "3. Paramètres et paiements"
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/parametres" --data-urlencode "nom=Boutique Test" \
  --data-urlencode "rib=Titulaire TEST - IBAN FR76 1234" --data-urlencode "consignes_ccp=Guichet Marara, citer la référence" \
  -d telephone=89000000 -d whatsapp=68989000000 -d ile=Moorea --data-urlencode "numero_tahiti=A12345" --data-urlencode "mentions_facture=Patente n° 999"
check "paramètres enregistrés" 'curl -s -b "$J" $BASE/tableau-de-bord/parametres | grep -q "IBAN FR76 1234"'
check "lien carte non https refusé" '[[ "$(loc -b "$J" "${H[@]}" -X POST $BASE/tableau-de-bord/parametres -d nom=X -d lien_paiement_carte=http://x)" == *err=* ]]'

echo "4. Produits (quota Mini : 9) et images R2"
printf '\x89PNG\r\n\x1a\n0000000000000000' > "$TMP/p.png"
curl -s -o /dev/null -b "$J" "${H[@]}" -F "nom=Monoï tiare" -F prix_xpf=1800 -F stock=3 -F ordre=1 -F "image=@$TMP/p.png;type=image/png" "$BASE/tableau-de-bord/produits"
for i in $(seq 2 9); do curl -s -o /dev/null -b "$J" "${H[@]}" -F "nom=Produit $i" -F prix_xpf=1000 -F stock=5 -F ordre=$i "$BASE/tableau-de-bord/produits"; done
check "10e produit bloqué" '[[ "$(loc -b "$J" "${H[@]}" -F nom=X -F prix_xpf=1 -F stock=1 $BASE/tableau-de-bord/produits)" == *Limite* ]]'
check "fichier non image refusé" '[[ "$(loc -b "$J" "${H[@]}" -F nom=Y -F prix_xpf=1 -F stock=1 -F "image=@$TMP/p.png;type=text/html" $BASE/tableau-de-bord/produits)" == *err=* ]]'
SHOP=$(curl -s "$BASE/b/$SLUG")
check "vitrine publique" 'echo "$SHOP" | grep -q "Monoï tiare"'
IMG=$(echo "$SHOP" | grep -o '/img/[a-f0-9]*/[a-f0-9]*\.png' | head -1)
check "photo servie depuis R2" '[ -n "$IMG" ] && [ "$(code $BASE$IMG)" = 200 ]'
OID=$(echo "$SHOP" | tr '\n' ' ' | grep -o 'Monoï tiare.\{0,600\}' | grep -o 'q_[a-f0-9]\{32\}' | head -1 | sed 's/q_//')
P2=$(curl -s -b "$J" "$BASE/tableau-de-bord/produits" | tr '\n' ' ' | grep -o 'Produit 2</td>.\{0,200\}/tableau-de-bord/produits/[a-f0-9]*' | grep -o '[a-f0-9]\{32\}')
curl -s -o /dev/null -b "$J" "${H[@]}" --form-string "nom=<script>alert(1)</script>" -F prix_xpf=1 -F stock=1 "$BASE/tableau-de-bord/produits/$P2"
check "XSS dans un nom de produit neutralisé" 'S=$(curl -s $BASE/b/$SLUG); echo "$S" | grep -q "&lt;script&gt;alert" && ! echo "$S" | grep -q "<script>alert"'
check "un commerçant ne peut pas modifier le produit d’un autre" '[ "$(code -b "$J2" $BASE/tableau-de-bord/produits/$P2)" = 404 ]'

echo "5. Apparence et sections"
SEC='[{"type":"hero","visible":true,"titre":"Bienvenue chez nous","texte":"<img src=x onerror=alert(1)>","bouton":"Voir","motif":"fleur"},{"type":"inconnu","titre":"x"},{"type":"faq","visible":true,"titre":"FAQ","items":[{"q":"Livrez-vous ?","r":"Oui"}]},{"type":"texte","visible":false,"titre":"Cachée","texte":"secret"}]'
curl -s -o /dev/null -b "$J" "${H[@]}" -F modele=pae -F couleur_principale=#123456 -F couleur_secondaire=#abcdef -F "sections_json=$SEC" "$BASE/tableau-de-bord/apparence"
SHOP=$(curl -s "$BASE/b/$SLUG")
check "sections enregistrées et affichées" 'echo "$SHOP" | grep -q "Bienvenue chez nous" && echo "$SHOP" | grep -q "Livrez-vous"'
check "section inconnue ignorée, section masquée invisible" '! echo "$SHOP" | grep -q "secret"'
check "HTML injecté dans une section neutralisé" '! echo "$SHOP" | grep -q "<img src=x"'
check "produits réinsérés automatiquement" 'echo "$SHOP" | grep -q "id=\"produits\""'
check "modèle et couleurs appliqués" 'echo "$SHOP" | grep -q "DM Serif" && echo "$SHOP" | grep -q "#123456"'
check "éditeur de sections chargé" 'curl -s -b "$J" $BASE/tableau-de-bord/apparence | grep -q "/static/editeur.js"'

echo "6. Commande, paiement, facture"
r=$(loc "${H[@]}" -X POST "$BASE/b/$SLUG/commander" -d "q_$OID=2" --data-urlencode "client_nom=Hina Teriitehau" -d client_telephone=87112233 \
  -d client_email=hina@test.pf --data-urlencode "client_adresse=PK 12 côté mer, Paea" -d ile=Tahiti -d moyen=virement)
check "commande créée → confirmation" '[[ "$r" == */commande/* ]]'
CMD=$(echo "$r" | grep -o '[a-f0-9]\{32\}$')
check "instructions de virement affichées" 'curl -s "$r" | grep -q "IBAN FR76 1234"'
check "stock réservé (3 → 1)" 'curl -s -b "$J" $BASE/tableau-de-bord/produits | tr "\n" " " | grep -q "Monoï tiare</td><td>[^<]*</td><td>1<"'
check "surcommande refusée" '[[ "$(loc "${H[@]}" -X POST $BASE/b/$SLUG/commander -d q_$OID=5 -d client_nom=A -d client_telephone=1 -d client_email=a@b.pf -d client_adresse=B -d ile=Tahiti -d moyen=virement)" == *Stock* ]]'
check "moyen non proposé refusé" '[[ "$(loc "${H[@]}" -X POST $BASE/b/$SLUG/commander -d q_$OID=1 -d client_nom=A -d client_telephone=1 -d client_email=a@b.pf -d client_adresse=B -d ile=Tahiti -d moyen=carte)" == *err=* ]]'
check "un autre commerçant ne voit pas la commande" '[ "$(code -b "$J2" $BASE/tableau-de-bord/commandes/$CMD)" = 404 ]'
check "pas de facture avant paiement" '[ "$(code $BASE/f/$CMD)" = 404 ]'
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/commandes/$CMD/avancer"
Y=$(TZ=Pacific/Tahiti date +%Y)
check "paiement → facture F$Y-0001" 'curl -s -b "$J" $BASE/tableau-de-bord/commandes/$CMD | grep -q "F$Y-0001"'
check "facture publique avec n° Tahiti et mentions" 'F=$(curl -s $BASE/f/$CMD); echo "$F" | grep -q "A12345" && echo "$F" | grep -q "Patente n° 999"'
check "vente payée comptée (1 / 50)" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "<b>1 / 50</b>"'
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/commandes/$CMD/avancer"
check "expédition enregistrée" 'curl -s -b "$J" $BASE/tableau-de-bord/commandes/$CMD | grep -q ">Expédiée<"'
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/commandes/$CMD/avancer"
check "pas de retour en arrière ni de 2e facture" '[ "$(curl -s -b "$J" $BASE/tableau-de-bord | grep -c "<b>1 / 50</b>")" = 1 ]'
r=$(loc "${H[@]}" -X POST "$BASE/b/$SLUG/commander" -d "q_$OID=1" -d client_nom=B -d client_telephone=1 -d client_email=b@test.pf -d client_adresse=C -d ile=Moorea -d moyen=ccp)
CMD2=$(echo "$r" | grep -o '[a-f0-9]\{32\}$')
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/commandes/$CMD2/supprimer"
check "commande en attente supprimée, stock remis (0 → 1)" 'curl -s -b "$J" $BASE/tableau-de-bord/produits | tr "\n" " " | grep -q "Monoï tiare</td><td>[^<]*</td><td>1<"'
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/commandes/$CMD/supprimer"
check "commande payée non supprimable" '[ "$(code $BASE/f/$CMD)" = 200 ]'

echo "7. Dossier OSB"
curl -s -o /dev/null -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/osb" --data-urlencode "raison_sociale=Boutique Test" -d numero_tahiti=A12345 \
  --data-urlencode "responsable=Hina T" -d telephone=89000000 -d email=$EMAIL --data-urlencode "banque=Socredo"
check "dossier OSB enregistré" 'curl -s -b "$J" $BASE/tableau-de-bord/osb | grep -q "En attente"'

echo "8. Administration"
check "admin interdit aux commerçants" '[ "$(code -b "$J" $BASE/admin)" = 404 ]'
login "$JA" "admin@test.pf" "/admin"
ADM=$(curl -s -b "$JA" "$BASE/admin")
check "admin liste la boutique" 'echo "$ADM" | grep -q "$SLUG"'
BID=$(echo "$ADM" | tr '\n' ' ' | grep -o "$SLUG.\{0,1500\}" | grep -o '/admin/b/[a-f0-9]\{32\}/paiement' | head -1 | cut -d/ -f4)
check "dossier OSB visible côté admin" 'curl -s -b "$JA" $BASE/admin/osb | grep -q "Hina T"'
curl -s -o /dev/null -b "$JA" "${H[@]}" -X POST "$BASE/admin/b/$BID/suspendre"
check "boutique suspendue → vitrine 503" '[ "$(code $BASE/b/$SLUG)" = 503 ]'
check "le commerçant voit l’alerte" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "hors ligne"'
curl -s -o /dev/null -b "$JA" "${H[@]}" -X POST "$BASE/admin/b/$BID/paiement" -d mois=12
check "encaissement 12 mois → vitrine en ligne" '[ "$(code $BASE/b/$SLUG)" = 200 ]'
check "cycle passé en annuel" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "annuel"'

echo "9. Session"
curl -s -o /dev/null -c "$J" "$BASE/deconnexion"
check "déconnexion effective" '[[ "$(loc -b "$J" $BASE/tableau-de-bord)" == */connexion* ]]'
check "cookie de session falsifié refusé" '[[ "$(loc -H "Cookie: hb_s=eyJlIjoiYWRtaW5AdGVzdC5wZiJ9.AAAA" $BASE/admin)" == */connexion* ]]'

echo; echo "Résultat : $PASS réussis, $FAIL échoués"
rm -rf "$TMP"; [ "$FAIL" = 0 ]
