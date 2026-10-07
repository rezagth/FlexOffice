# Stripe

## Webhook
Stripe → Developers → Webhooks → endpoint `https://<domaine>/api/webhooks/stripe`, événements :
- `payment_intent.amount_capturable_updated` (carte autorisée → la demande part chez l'hôte)
- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
- `refund.created`, `refund.updated`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`

Signing secret → `STRIPE_WEBHOOK_SECRET`. `account.updated` arrive sur un endpoint **Connect** distinct (secret différent) : à brancher si l'on veut suivre l'état Connect en temps réel ; aujourd'hui l'état est relu à la demande.

Cloudflare : *Bot Fight Mode* désactivé (il bloque les webhooks sur l'offre gratuite).

## Connect
Les bailleurs passent par l'onboarding Express depuis leur page Vérification. Tant que `charges_enabled` et `payouts_enabled` ne sont pas vrais, leurs espaces ne sont pas réservables (refus 409 à la réservation). Commission : `application_fee_amount` = 15 % sur chaque destination charge.

## Passage en live
1. Activer le compte Stripe (identité, IBAN de la plateforme), Radar activé.
2. Clés live dans Coolify (`STRIPE_SECRET_KEY`), clé publique live dans la variable GitHub de l'environnement `production` (rebuild).
3. Recréer le webhook en mode live.
4. `PAYMENT_PROVIDER=stripe`. Faire une réservation réelle de 1 € avec acceptation puis annulation (> 48 h) pour vérifier capture, commission, remboursement et facture/avoir.
