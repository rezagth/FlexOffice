# Recette Stripe en mode test (R1 → R14)

Objectif : prouver chaque flux d'argent **avec Stripe en mode test** avant le premier euro réel. Critère de sortie : pour chaque ligne, une capture d'écran Stripe + la ligne correspondante en base (ou la page de l'application) sont conservées. Aucune ligne n'est « à peu près verte ».

## Environnement de recette

- Un déploiement dédié (jamais la production), `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…`, clé publique de test, `STRIPE_WEBHOOK_SECRET` et `STRIPE_CONNECT_WEBHOOK_SECRET` de test.
- Les deux webhooks de test créés dans Stripe (mode test), comme dans `stripe.md`. En local : `stripe listen --forward-to localhost:3000/api/webhooks/stripe` pour l'endpoint plateforme, et `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe` pour le Connect (chaque commande affiche son secret).
- Les `PLATFORM_*` peuvent rester vides : en mode test, rien n'est bloqué (le garde-fou ne s'applique qu'avec une clé `sk_live_`). Les factures de recette porteront « [à compléter] » : normal.
- Trois comptes : un client, un bailleur (organisation VERIFIED, espace publié), un admin.
- Cartes de test Stripe : `4242 4242 4242 4242` (réussit), `4000 0025 0000 3155` (3-D Secure), `4000 0000 0000 0002` (refusée), `4000 0000 0000 0259` (litige / chargeback), `4000 0000 0000 0077` (crédite le solde **disponible** immédiatement, nécessaire pour R12). Date future, CVC quelconque.

## R0 — Préalable : onboarding Connect et visibilité (C1)

1. Avant l'onboarding : l'espace du bailleur **n'apparaît pas** dans la recherche ni sur sa fiche publique.
2. Le bailleur fait l'onboarding Express depuis sa page Vérification (en mode test, Stripe propose de pré-remplir ou de passer le formulaire avec des données de test).
3. Au retour : l'espace **apparaît** (l'état est mis en cache au retour d'onboarding, ou par `account.updated`, ou au plus tard par le balayage de 15 min).
4. Preuve : capture de `charges_enabled` / `payouts_enabled` dans Stripe, capture de la recherche avant/après.

## Les 14 scénarios

| # | Scénario | Résultat attendu | Où le prouver |
| --- | --- | --- | --- |
| R1 | Client, carte 4242, demande envoyée | PaymentIntent `requires_capture` (autorisé, **non débité**) ; réservation « en attente » après le webhook | Stripe → Payments ; page Mes réservations |
| R2 | Carte 3-D Secure | Le défi s'affiche, puis même résultat que R1 | Stripe ; navigateur |
| R3 | Carte refusée | Message d'erreur dans le formulaire, **aucune** demande créée, créneau libéré | Navigateur ; base : pas de réservation PENDING |
| R4 | Le bailleur accepte | Capture ; `payment_intent.succeeded` ; facture numérotée dans la série du bailleur, commission 15 % | Stripe (Succeeded) ; PDF de la facture |
| R5 | Le bailleur refuse | Autorisation annulée, **rien débité**, client prévenu | Stripe (Canceled) |
| R6 | Carte jamais confirmée | Au bout de 15 min la réservation « en attente de paiement » est libérée | Base (statut) ; créneau de nouveau réservable |
| R7 | Demande sans réponse | Expire à 48 h ou au début du créneau : autorisation annulée | Base ; Stripe (Canceled). En recette, avancer la date de la demande en base. |
| R8 | Annulation client avant le délai de gratuité | Remboursement total ; **avoir** émis | Stripe (Refunded) ; PDF de l'avoir |
| R9 | Annulation client après le délai (palier 2) | Remboursement partiel selon la politique ; avoir du montant remboursé | Stripe ; PDF |
| R10 | Annulation par le bailleur d'une réservation confirmée | Remboursement total du client ; **pénalité** au bailleur (ligne négative sur son prochain versement) | Stripe ; page Versements du bailleur |
| R11 | Chargeback simulé (carte 4000 0000 0000 0259) | `charge.dispute.created` enregistré ; le versement lié est **retenu** | Admin → litiges ; Versements |
| R12 | Versement après le séjour | Crédit du solde disponible avec la carte `…0077`, séjour terminé + 24 h, lundi/1er du mois atteint : **un** virement Stripe du bon montant (prix − 15 % − pénalités), statut « Versé », e-mail au bailleur | Stripe → Transfers ; Admin → Versements |
| R13 | Virement repris par Stripe (C5) | Dashboard Stripe → Connect → Transfers → **Reverse** : `transfer.reversed` ; le versement passe en « Annulé par Stripe — à traiter », **pas relancé**, alerte d'erreur dans le suivi | Admin → Versements ; journal d'audit |
| R14 | Événements Connect (C5/C1) | `stripe trigger payout.failed --stripe-account acct_…` : événement accepté (signé par le secret Connect), entrée d'audit « bank_payout_failed » + alerte ; un `account.updated` met à jour la visibilité | Journal d'audit ; réponse 200 du webhook dans Stripe |

## Contrôles transverses (à cocher une fois)

- **Rejeu** : renvoyer deux fois le même événement depuis Stripe (Dashboard → Webhooks → Resend) : aucun effet second (pas de double capture, double remboursement, double avoir).
- **Signature** : une requête sur `/api/webhooks/stripe` sans signature valide répond 400 et ne change rien.
- **Montants** : le prix et la commission affichés, facturés et capturés sont identiques ; aucune valeur ne vient du navigateur.
- **Solde plateforme** : avant R12, noter le solde disponible ; après, vérifier qu'il a baissé exactement du montant versé.
- **Arrêt en cours de route** : couper le déploiement entre l'autorisation et le webhook, le rallumer, rejouer : la réservation finit dans le bon état.

## Test automatisé du parcours carte (C6)

`tests/e2e/stripe-recette.spec.ts` couvre R1, R2, R3 et R4 dans un navigateur. Il est ignoré par défaut :

```bash
E2E_STRIPE_RECETTE=1 \
E2E_BASE_URL=https://<déploiement-de-recette> \
E2E_SPACE_SLUG=<slug-d-un-espace-dont-le-bailleur-est-prêt> \
E2E_TENANT_EMAIL=… E2E_TENANT_PASSWORD=… \
E2E_LANDLORD_EMAIL=… E2E_LANDLORD_PASSWORD=… \
pnpm test:e2e tests/e2e/stripe-recette.spec.ts --project=desktop
```

Les identifiants viennent de l'environnement, jamais du dépôt. Ce test a été écrit sans pouvoir être exécuté contre un vrai déploiement : au premier lancement, les sélecteurs de l'iframe Stripe (champs carte, défi 3-D Secure) sont les plus susceptibles de demander un ajustement ; le parcours manuel ci-dessus reste la référence.

## Résultat

Remplir un tableau « R1…R14 : date, vert/rouge, lien vers la preuve » dans Notion (Revues et audits) à la fin de la recette. Le passage en live (`stripe.md`) ne commence que lorsque tout est vert.
