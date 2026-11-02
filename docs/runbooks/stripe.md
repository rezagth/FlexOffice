# Stripe

Modèle d'argent en vigueur depuis le 10/10/2026 (remplace l'ancien « destination charge » avec `application_fee`) :

1. Le client paie **la plateforme** : PaymentIntent en `capture_method: manual`, `transfer_group: booking:<id>`, sans destination ni frais d'application. L'autorisation de carte est prise à la réservation.
2. Le bailleur accepte → **capture** (c'est le seul moment où le client est débité). Il refuse, ou la demande expire → l'autorisation est annulée, rien n'est débité.
3. La plateforme **garde les fonds**. Après la fin du séjour + 24 h, au prochain lundi (ou 1er du mois) selon le choix du bailleur, un **virement Stripe** (`transfers.create`, une clé d'idempotence par versement) envoie au bailleur *prix − commission (15 %)* − pénalités éventuelles.
4. Un remboursement avant versement diminue simplement ce qui sera versé : rien à reprendre sur le compte du bailleur.

La commission est la constante serveur `COMMISSION_RATE` (`src/server/domains/payments/constants.ts`), jamais une valeur venant d'une requête.

## Webhooks : deux endpoints, deux secrets

Stripe → Developers → Webhooks. Chaque endpoint a **son propre** secret de signature.

**1. Endpoint plateforme** — `https://<domaine>/api/webhooks/stripe` — « Events on your account » :
- `payment_intent.amount_capturable_updated` (carte autorisée → la demande part chez l'hôte)
- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
- `refund.created`, `refund.updated`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
- `transfer.reversed` (Stripe a repris un virement : le versement passe en « REVERSED », jamais relancé seul, alerte)

Signing secret → `STRIPE_WEBHOOK_SECRET`.

**2. Endpoint Connect** — même URL `https://<domaine>/api/webhooks/stripe` — « Events on Connected accounts » :
- `account.updated` (le bailleur a fini ou perdu son onboarding : l'état est relu en direct chez Stripe puis mis en cache, ce qui fait apparaître ou disparaître ses espaces dans la recherche)
- `payout.failed` (la banque du bailleur a refusé le virement Stripe → alerte, le bailleur doit corriger son IBAN dans son tableau de bord Stripe)

Signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`. Sans lui, ces événements sont rejetés (400) : l'application l'indique au démarrage, et un balayage de maintenance (toutes les 15 min, 10 comptes max) rattrape les bailleurs dont l'événement n'est pas arrivé.

La route accepte un événement signé par l'un **ou** l'autre secret, rien d'autre. Un événement est enregistré une seule fois (clé = identifiant Stripe) et rejouer un événement ne produit aucun effet second.

Cloudflare (si utilisé) : *Bot Fight Mode* désactivé, il bloque les webhooks sur l'offre gratuite. Sur Vercel : rien à configurer côté pare-feu.

## Connect (bailleurs)

Les bailleurs passent par l'onboarding Express depuis leur page Vérification (l'IBAN est saisi chez Stripe, jamais chez nous). Tant que `charges_enabled` **et** `payouts_enabled` ne sont pas vrais :
- leurs espaces **ne sont pas listés** (recherche, fiche publique, plan du site) et ne peuvent pas être réservés ;
- à la réservation, l'état est de toute façon relu en direct chez Stripe (refus 409 sinon) : le cache ne sert qu'à l'affichage ;
- un versement dû attend (il n'est pas perdu).

Ce filtre ne s'applique que si `PAYMENT_PROVIDER=stripe` (en mode `mock`, développement et démo montrent tout).

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `PAYMENT_PROVIDER=stripe` | Active le vrai paiement (obligatoire en production, plus de défaut). |
| `STRIPE_SECRET_KEY` | `sk_test_…` en recette, `sk_live_…` en réel. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique, **intégrée au build** : après changement, redéployer. |
| `STRIPE_WEBHOOK_SECRET` | Secret de l'endpoint plateforme. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Secret de l'endpoint Connect. |
| `PLATFORM_LEGAL_NAME`, `PLATFORM_LEGAL_FORM`, `PLATFORM_SHARE_CAPITAL`, `PLATFORM_ADDRESS`, `PLATFORM_SIRET`, `PLATFORM_RCS`, `PLATFORM_VAT_NUMBER`, `PLATFORM_BILLING_EMAIL` | Identité de la société, imprimée sur les factures. **Avec une clé `sk_live_`, l'application refuse de prendre un paiement et d'émettre une facture tant qu'une seule est vide.** |

## Passage en live

Prérequis : société créée, PLATFORM_* remplies, recette en mode test entièrement verte (`recette-stripe.md`), avis du juriste sur la détention de fonds de tiers, TVA validée par l'expert-comptable.

1. Activer le compte Stripe (identité de la société, IBAN de la plateforme), Radar activé.
2. Clés live dans les variables d'environnement de l'hébergeur (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), puis **redéployer** (la clé publique est dans le build).
3. Recréer **les deux** webhooks en mode live et renseigner leurs deux secrets.
4. Renseigner les `PLATFORM_*`. Contrôle : au démarrage, aucun message `PLATFORM_*` ni `STRIPE_CONNECT_WEBHOOK_SECRET` dans les journaux.
5. Le bailleur de test refait son onboarding **en live** (les comptes Connect du mode test n'existent pas en live).
6. Une réservation réelle de 1 € : acceptation, capture, facture ; puis une annulation (> 48 h) pour vérifier remboursement et avoir ; puis le premier versement.
7. Avant chaque versement : le **solde disponible** de la plateforme doit couvrir le montant. Les fonds d'un paiement par carte ne sont disponibles chez Stripe qu'après quelques jours : un virement qui échoue pour solde insuffisant est relancé toutes les 10 minutes, rien n'est perdu.

## Pendant la bêta : contrôle quotidien (en attendant la réconciliation automatique)

Chaque jour, dans Stripe (mode live) : les paiements capturés correspondent aux réservations confirmées, aucun remboursement n'a été fait hors application, les virements du jour correspondent aux versements « Versé » de la page Admin → Versements, aucun versement « Annulé par Stripe » ni échec de virement bancaire.
