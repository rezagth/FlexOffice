# Observabilité

## Erreurs — GlitchTip
`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` = DSN du projet GlitchTip. Sans DSN, rien n'est envoyé. Les événements passent par `/monitoring` (même origine, non bloqué par les bloqueurs de pub). Données personnelles retirées avant envoi (e-mails, IP, cookies, en-têtes d'autorisation). Source maps envoyées au build si `SENTRY_AUTH_TOKEN` est fourni.

## Logs
JSON sur la sortie standard (Pino), collectés par Loki. Chaque requête porte un `x-request-id` (renvoyé au client et présent dans les logs). Événements utiles : `app.boot`, `config.production_problem`, `payments.provider_refused_misconfigured`, `refund.failed_needs_attention`, `payment.orphan_capture_refunded`, `rate_limit.denied`, `booking.expire_run`.

## Sondes
- Conteneur : `/api/health/live` (sans dépendance).
- Externe (UptimeRobot / Uptime Kuma hors du serveur) : `https://<domaine>/api/health/ready` (base + Supabase Auth), toutes les minutes.
- Tâche planifiée : Healthchecks.io (voir [taches-planifiees.md](taches-planifiees.md)).

## Alertes à configurer
| Alerte | Seuil |
|---|---|
| `/api/health/ready` en échec | 2 minutes |
| Taux de 5xx | > 2 % sur 5 min |
| Latence p95 | > 2 s sur 10 min |
| `refund.failed_needs_attention`, `payment.orphan_capture_refunded` | dès 1 occurrence |
| `config.production_problem` | dès 1 occurrence après un déploiement |
| Sauvegarde horaire manquante | 2 h |
| Certificat / tunnel Cloudflare | expiration < 14 j, tunnel down |
