# CONFORMITÉ — RGPD, ISO 27001, Polynésie française

> Document technique. Il ne remplace pas l'avis de la juriste ni d'un auditeur. Les points marqués **À valider** doivent l'être avant la mise en production.

## 1. Cadre
- **RGPD** : Hinova Digital est une EI immatriculée en France (RCS Lorient). Elle traite des données de commerçants et de leurs clients : le RGPD s'applique à ses traitements.
- **Polynésie française** : le régime applicable aux données personnelles et au paiement en ligne local (OSB, interdiction de l'intermédiation de paiement sans agrément) est **à valider** avec la juriste. Aucune règle locale n'est supposée dans le code au-delà de : Hinova ne touche jamais l'argent des ventes.
- **ISO 27001** : c'est une certification d'**organisation** (système de management de la sécurité), pas une propriété du code. Cloudflare publie ses certifications ; Hinova peut s'appuyer dessus pour l'hébergement, mais une certification Hinova suppose une démarche propre (politique, analyse de risques, audit). Le code fournit les mesures techniques et les preuves (journaux, contrôles d'accès, tests).
- **Tahiti Nui Fortress** (hébergement souverain envisagé) : capacités et calendrier **à confirmer** ; l'architecture reste portable (SQL standard SQLite, stockage objet compatible S3, aucune dépendance propriétaire hors Workers).

## 2. Localisation des données — action requise
Vérifié dans la documentation Cloudflare (15/10/2026) :
- D1 et R2 acceptent une **juridiction `eu`** qui garantit l'exécution et le stockage dans l'Union européenne.
- La juridiction **ne peut être fixée qu'à la création** ; elle ne s'ajoute pas à une base ou un bucket existants.
- La base actuelle (`hinova_boutiques`) et le bucket (`hinova-boutiques-images`) ont été créés **sans juridiction**.

**Plan** : créer `hinova_boutiques_eu` (`wrangler d1 create … --jurisdiction eu`) et un bucket R2 `eu`, rejouer les migrations, transférer les données (export/import D1, copie R2), basculer les liaisons, conserver l'ancienne base en lecture le temps de la vérification puis la supprimer **sur confirmation**.

## 3. Mesures en place (incrément du 15/10/2026)
| Exigence | Mesure |
|---|---|
| Minimisation | Le dossier OSB ne collecte que les champs utiles et les justificatifs requis ; aucune donnée de carte n'est stockée (Stripe / OSB). |
| Pas de transfert non maîtrisé | Le dossier OSB n'est plus envoyé à une URL externe (`OSB_WEBHOOK_URL` supprimé) : il reste dans la base et est traité depuis l'administration. |
| Confidentialité des pièces | Justificatifs dans R2 sous `prive/`, jamais servis par `/img/`, téléchargeables seulement par la boutique propriétaire ou l'administration, en `no-store`. |
| Intégrité des fichiers | Type et signature binaire vérifiés (PDF, JPG, PNG), 5 Mo maximum. |
| Consentement / information | Case obligatoire datée (`consentement_le`) avant le dépôt du dossier. |
| Traçabilité | `journal_audit` (dépôt de dossier, changements de statut OSB, actions admin, événements d'abonnement) ; `paiements_evenements` (chaque événement Stripe une seule fois). |
| Paiement fiable | Statut d'abonnement mis à jour uniquement par le webhook signé ou la lecture serveur de Stripe. |
| Environnements séparés | Connexion de développement et inscription sans paiement impossibles hors `ENVIRONMENT = "test"`. |

## 4. Reste à faire (avec la juriste)
1. Registre des traitements ; politique de confidentialité et mentions légales publiées sur chaque vitrine.
2. Durées de conservation (dossiers OSB refusés, justificatifs après transmission, journaux) + purge automatique.
3. Droits des personnes : export et suppression des données d'un compte depuis le dashboard.
4. Contrat de sous-traitance (DPA) avec Cloudflare et Stripe ; liste publique des sous-traitants.
5. Notification de violation de données : procédure et contact.
6. Liste officielle des justificatifs OSB (la liste actuelle est provisoire, dans `src/plans.js`).
