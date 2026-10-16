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
check "chaque diapositive charge sa démo" '[ "$(echo "$LAND" | grep -o "src=\"/demo/" | wc -l)" -ge 4 ]'
for m in lagon pae tiare nuit; do check "démo $m en ligne et encadrable par le site" '[ "$(curl -s -D - -o /dev/null $BASE/demo/'$m' | grep -ci "x-frame-options: SAMEORIGIN")" = 1 ]'; done
check "démo : formulaire de commande désactivé" 'curl -s $BASE/demo/lagon | grep -q "Boutique de démonstration"'
check "pages internes non encadrables" 'curl -s -D - -o /dev/null $BASE/connexion | grep -qi "x-frame-options: DENY"'

echo "2. Connexion et création de boutique"
check "tableau de bord sans session → connexion" '[[ "$(loc $BASE/tableau-de-bord)" == */connexion* ]]'
check "redirection externe bloquée après connexion" '[[ "$(loc "$BASE/auth/dev?email=x@test.pf&next=//pirate.example")" == "$BASE/tableau-de-bord" ]]'
check "page d’inscription : compte, formule, mensuel ou annuel" 'F=$(curl -s "$BASE/demarrer?plan=plan_2"); echo "$F" | grep -q "name=\"password\"" && echo "$F" | grep -q "Annuel, payé comptant"'
check "POST d’une autre origine refusé" '[ "$(code -H "Origin: https://pirate.example" -X POST $BASE/demarrer)" = 403 ]'
check "mot de passe trop court refusé" 'curl -s "${H[@]}" -X POST $BASE/demarrer --data-urlencode "nom=X" -d sous_domaine=x-$R -d email=x$R@test.pf -d password=court -d cgu=on | grep -q "8 caractères"'
r=$(loc -c "$J" "${H[@]}" -X POST "$BASE/demarrer" --data-urlencode "nom=Boutique Test" -d sous_domaine=$SLUG -d modele=tiare -d plan=plan_1 -d cycle=mensuel \
  -d email=$EMAIL -d password=motdepasse123 -d cgu=on)
check "inscription sans Stripe configuré → espace créé et connecté" '[[ "$r" == */tableau-de-bord?ok=* ]]'
check "tableau de bord affiché" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "Boutique Test"'
check "e-mail déjà utilisé refusé" 'curl -s "${H[@]}" -X POST $BASE/demarrer --data-urlencode "nom=X" -d sous_domaine=y-$R -d email=$EMAIL -d password=motdepasse123 -d cgu=on | grep -q "existe déjà"'
check "adresse déjà prise refusée" 'curl -s "${H[@]}" -X POST $BASE/demarrer --data-urlencode "nom=X" -d sous_domaine=$SLUG -d email=z$R@test.pf -d password=motdepasse123 -d cgu=on | grep -q "déjà prise"'
curl -s -o /dev/null -c "$J2" "${H[@]}" -X POST "$BASE/demarrer" --data-urlencode "nom=Autre" -d sous_domaine=autre-$R -d modele=lagon -d plan=plan_1 -d email=autre$R@test.pf -d password=motdepasse123 -d cgu=on
check "connexion par mot de passe" '[[ "$(loc "${H[@]}" -X POST $BASE/connexion -d email=$EMAIL -d password=motdepasse123)" == */tableau-de-bord ]]'
check "mauvais mot de passe refusé" '[[ "$(loc "${H[@]}" -X POST $BASE/connexion -d email=$EMAIL -d password=fauxfauxfaux)" == *err=* ]]'
check "déjà client → /demarrer renvoie vers son espace" '[[ "$(loc -b "$J" $BASE/demarrer)" == */tableau-de-bord ]]'

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

echo "7. Dossier OSB (justificatifs privés)"
printf '%%PDF-1.4\n%%test\n' > "$TMP/id.pdf"; printf '%%PDF-1.4\n%%rib\n' > "$TMP/rib.pdf"; printf '%%PDF-1.4\n%%imm\n' > "$TMP/imm.pdf"
printf 'pas un pdf' > "$TMP/faux.pdf"
osb(){ curl -s -o /dev/null -w '%{redirect_url}' -b "$J" "${H[@]}" -X POST "$BASE/tableau-de-bord/osb" -F "raison_sociale=Boutique Test" -F numero_tahiti=A12345 \
  -F "responsable=Hina T" -F telephone=89000000 -F email=$EMAIL -F "banque=$1" -F "piece_identite=@$2;type=application/pdf" \
  -F "piece_rib=@$TMP/rib.pdf;type=application/pdf" -F "piece_immatriculation=@$TMP/imm.pdf;type=application/pdf" ${3:-}; }
check "dossier OSB : banque hors Banque de Polynésie / Socredo refusée" '[[ "$(osb "Banque de Tahiti" "$TMP/id.pdf" "-F consentement=on")" == *err=* ]]'
check "dossier OSB : consentement obligatoire" '[[ "$(osb Socredo "$TMP/id.pdf")" == *err=* ]]'
check "dossier OSB : faux PDF refusé" '[[ "$(osb Socredo "$TMP/faux.pdf" "-F consentement=on")" == *err=* ]]'
check "dossier OSB complet enregistré" '[[ "$(osb Socredo "$TMP/id.pdf" "-F consentement=on")" == *ok=* ]]'
OSBP=$(curl -s -b "$J" $BASE/tableau-de-bord/osb)
check "dossier OSB en attente, option PayZen mensuelle affichée" 'echo "$OSBP" | grep -q "En attente" && echo "$OSBP" | grep -q "par mois"'
PIECE=$(echo "$OSBP" | grep -o '/tableau-de-bord/osb/piece/[a-f0-9]\{32\}' | head -1 | sed 's#.*/##')
check "justificatif téléchargeable par son propriétaire" '[ "$(code -b "$J" $BASE/tableau-de-bord/osb/piece/$PIECE)" = 200 ]'
check "justificatif invisible pour une autre boutique" '[ "$(code -b "$J2" $BASE/tableau-de-bord/osb/piece/$PIECE)" = 404 ]'
check "justificatif invisible sans connexion" '[ "$(code $BASE/tableau-de-bord/osb/piece/$PIECE)" != 200 ]'
check "justificatif non servi par le chemin public des images" '[ "$(code "$BASE/img/prive%2Fosb%2F$PIECE")" = 404 ]'

echo "8. Administration"
check "admin interdit aux commerçants" '[ "$(code -b "$J" $BASE/admin)" = 404 ]'
login "$JA" "admin@test.pf" "/admin"
ADM=$(curl -s -b "$JA" "$BASE/admin")
check "admin liste la boutique" 'echo "$ADM" | grep -q "$SLUG"'
BID=$(echo "$ADM" | tr '\n' ' ' | grep -o "$SLUG.\{0,1500\}" | grep -o '/admin/b/[a-f0-9]\{32\}/paiement' | head -1 | cut -d/ -f4)
check "dossier OSB visible côté admin" 'curl -s -b "$JA" $BASE/admin/osb | grep -q "Hina T"'
DOS=$(curl -s -b "$JA" $BASE/admin/osb | grep -o '/admin/osb/[a-f0-9]\{32\}/statut' | head -1 | cut -d/ -f4)
check "admin : justificatif téléchargeable" '[ "$(code -b "$JA" $BASE/admin/osb/piece/$PIECE)" = 200 ]'
check "dossier validé sans Stripe → option PayZen signalée à facturer" '[[ "$(loc -b "$JA" "${H[@]}" -X POST $BASE/admin/osb/$DOS/statut -d statut=valide)" == *err=*facturer* ]]'
curl -s -o /dev/null -b "$JA" "${H[@]}" -X POST "$BASE/admin/b/$BID/suspendre"
check "boutique suspendue → vitrine 503" '[ "$(code $BASE/b/$SLUG)" = 503 ]'
check "le commerçant voit l’alerte" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "hors ligne"'
curl -s -o /dev/null -b "$JA" "${H[@]}" -X POST "$BASE/admin/b/$BID/paiement" -d mois=12
check "encaissement 12 mois → vitrine en ligne" '[ "$(code $BASE/b/$SLUG)" = 200 ]'
check "cycle passé en annuel" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "annuel"'

echo "9. Générateur IA et panier"
check "accueil : formulaire du générateur" 'curl -s $BASE/ | grep -q "id=\"gen\""'
check "description trop courte refusée" '[ "$(code "${H[@]}" -H "content-type: application/json" -X POST -d "{\"description\":\"abc\"}" $BASE/api/generer)" = 400 ]'
check "générateur appelé d’une autre origine refusé" '[ "$(code -H "Origin: https://pirate.example" -H "content-type: application/json" -X POST -d "{}" $BASE/api/generer)" = 403 ]'
GEN=$(curl -s "${H[@]}" -H "content-type: application/json" -X POST -d '{"description":"Je fais du monoï et des savons à Moorea","nom":"Vai Soins"}' "$BASE/api/generer")
check "génération : modèle Tiare deviné, nom gardé" 'echo "$GEN" | grep -q "\"modele\":\"tiare\"" && echo "$GEN" | grep -q "Vai Soins"'
APERCU=$(echo "$GEN" | grep -o '"apercu":"[^"]*"' | cut -d'"' -f4); CREER=$(echo "$GEN" | grep -o '"creer":"[^"]*"' | cut -d'"' -f4)
check "aperçu en direct affichable dans l’accueil" 'curl -s -D - "$BASE$APERCU" | grep -qi "x-frame-options: SAMEORIGIN"'
check "aperçu falsifié refusé" '[ "$(code "$BASE/apercu?g=nimporte")" = 404 ]'
JG="$TMP/jg"
G=$(echo "$CREER" | sed 's/.*g=//')
check "formulaire de création pré-rempli par la génération" 'curl -s "$BASE$CREER" | grep -q "value=\"Vai Soins\""'
curl -s -o /dev/null -c "$JG" "${H[@]}" -X POST "$BASE/demarrer" --data-urlencode "nom=Vai Soins" -d sous_domaine=vai-$R -d modele=tiare -d plan=plan_1 -d cgu=on --data-urlencode "g=$G" -d email=gen$R@test.pf -d password=motdepasse123
check "boutique créée avec les 4 produits générés" 'curl -s -b "$JG" $BASE/tableau-de-bord | grep -q "<b>4 / 9</b>"'
check "vitrine générée avec ses textes" 'curl -s $BASE/b/vai-$R | grep -q "parfum du fenua"'
check "panier en overlay présent dans une boutique qui vend" 'S=$(curl -s $BASE/b/$SLUG); echo "$S" | grep -q "id=\"cart-open\"" && echo "$S" | grep -q "data-add="'
check "pas de panier tant qu’aucun paiement n’est configuré" '! curl -s $BASE/b/vai-$R | grep -q "id=\"cart-open\""'

echo "10. Abonnements Stripe (webhook signé)"
WHS="${WHS:-whsec_test_local_123}"
hook(){ local t=$(date +%s); local sig=$(printf '%s' "$t.$1" | openssl dgst -sha256 -hmac "$WHS" -hex | sed 's/^.* //'); curl -s -o /dev/null -w '%{http_code}' -X POST -H "content-type: application/json" -H "stripe-signature: t=$t,v1=$sig" --data-binary "$1" "$BASE/api/stripe/webhook"; }
check "webhook sans signature refusé" '[ "$(code -X POST -H "content-type: application/json" -d "{}" $BASE/api/stripe/webhook)" = 400 ]'
check "webhook mal signé refusé" '[ "$(code -X POST -H "stripe-signature: t=$(date +%s),v1=abc" -d "{}" $BASE/api/stripe/webhook)" = 400 ]'
SUB="sub_test_$R"; END=$(( $(date +%s) + 400*86400 ))
check "paiement Stripe rattaché à la boutique" '[ "$(hook "{\"id\":\"evt_co_$R\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"mode\":\"subscription\",\"customer\":\"cus_$R\",\"subscription\":\"$SUB\",\"payment_status\":\"paid\",\"metadata\":{\"boutique\":\"$BID\"}}}}")" = 200 ]'
hook "{\"id\":\"evt_pay_$R\",\"type\":\"invoice.paid\",\"data\":{\"object\":{\"customer\":\"cus_$R\",\"parent\":{\"subscription_details\":{\"subscription\":\"$SUB\"}},\"lines\":{\"data\":[{\"period\":{\"end\":$END}}]}}}}" >/dev/null
Y2=$(TZ=Pacific/Tahiti date -d @$END +%Y)
check "renouvellement payé → échéance prolongée" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "/$Y2"'
check "bouton « Gérer mon abonnement » absent tant que Stripe n’est pas branché" '! curl -s -b "$J" $BASE/tableau-de-bord | grep -q "Gérer mon abonnement"'
hook "{\"id\":\"evt_del_$R\",\"type\":\"customer.subscription.deleted\",\"data\":{\"object\":{\"id\":\"$SUB\"}}}" >/dev/null
check "résiliation → boutique hors ligne" '[ "$(code $BASE/b/$SLUG)" = 503 ]'
PAY2="{\"id\":\"evt_pay2_$R\",\"type\":\"invoice.paid\",\"data\":{\"object\":{\"subscription\":\"$SUB\",\"lines\":{\"data\":[{\"period\":{\"end\":$END}}]}}}}"
hook "{\"id\":\"evt_pay_$R\",\"type\":\"invoice.paid\",\"data\":{\"object\":{\"subscription\":\"$SUB\",\"lines\":{\"data\":[{\"period\":{\"end\":$END}}]}}}}" >/dev/null
check "événement déjà traité rejoué → ignoré (boutique reste hors ligne)" '[ "$(code $BASE/b/$SLUG)" = 503 ]'
check "événement sans identifiant refusé" '[ "$(hook "{\"type\":\"invoice.paid\",\"data\":{\"object\":{}}}")" = 400 ]'
hook "$PAY2" >/dev/null
check "nouveau paiement → boutique en ligne" '[ "$(code $BASE/b/$SLUG)" = 200 ]'

hook "{\"id\":\"evt_fail_$R\",\"type\":\"invoice.payment_failed\",\"data\":{\"object\":{\"id\":\"in_$R\",\"subscription\":\"$SUB\"}}}" >/dev/null
check "échec de paiement → alerte dans le tableau de bord, boutique encore en ligne" 'curl -s -b "$J" $BASE/tableau-de-bord | grep -q "Paiement de l’abonnement refusé" && [ "$(code $BASE/b/$SLUG)" = 200 ]'
hook "{\"id\":\"evt_pay3_$R\",\"type\":\"invoice.paid\",\"data\":{\"object\":{\"subscription\":\"$SUB\",\"lines\":{\"data\":[{\"period\":{\"end\":$END}}]}}}}" >/dev/null
check "paiement régularisé → alerte levée" '! curl -s -b "$J" $BASE/tableau-de-bord | grep -q "Paiement de l’abonnement refusé"'

echo "11. Session"
curl -s -o /dev/null -c "$J" "$BASE/deconnexion"
check "déconnexion effective" '[[ "$(loc -b "$J" $BASE/tableau-de-bord)" == */connexion* ]]'
check "cookie de session falsifié refusé" '[[ "$(loc -H "Cookie: hb_s=eyJlIjoiYWRtaW5AdGVzdC5wZiJ9.AAAA" $BASE/admin)" == */connexion* ]]'

echo; echo "Résultat : $PASS réussis, $FAIL échoués"
rm -rf "$TMP"; [ "$FAIL" = 0 ]
