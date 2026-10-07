# Tâche planifiée (toutes les 15 minutes)

Coolify → application → *Scheduled tasks* → `*/15 * * * *` :
```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/expire-bookings
```
`CRON_SECRET` différent par environnement. Sans lui, la route refuse tout appel.

Ce que fait chaque passage (`runBookingMaintenance`, chaque étape indépendante) :
1. libère les paiements abandonnés (carte non confirmée après 15 min) ;
2. fait expirer les demandes sans réponse (48 h ou début du créneau) ;
3. passe les réservations terminées en `COMPLETED` ;
4. relance les remboursements dont l'issue était incertaine (même clé d'idempotence) ;
5. envoie les rappels de la veille ;
6. émet les factures et avoirs manquants ;
7. le 1er du mois après 02:00 (Paris) : relevés de commission de tous les bailleurs ;
8. purge RGPD (payloads webhook > 90 j, recherches > 13 mois, pièces KYC > 12 mois après décision).

Surveillance : une sonde Healthchecks.io « ping » après la commande (`&& curl -fsS https://hc-ping.com/<uuid>`) alerte si la tâche ne tourne plus.
