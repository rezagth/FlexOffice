# Sauvegardes et restauration

## Objectifs proposés (à valider)
- **RPO** (perte de données maximale) : 1 heure.
- **RTO** (remise en service) : 4 heures.

## Ce qui est sauvegardé
| Quoi | Comment | Rétention |
|---|---|---|
| Base Supabase | `pg_dump -Fc` horaire vers le stockage objet (Garage), copie quotidienne hors site | 48 h d'horaires, 30 jours de quotidiennes, 12 mensuelles |
| VM complètes | Proxmox Backup Server, chiffré, chaque nuit | 7 jours, 4 semaines, 6 mois |
| Fichiers (photos, KYC) | volume Storage inclus dans la sauvegarde de VM + rclone quotidien | 30 jours |

La clé de chiffrement PBS est conservée à **deux** endroits (Bitwarden + papier).

## Restaurer la base (incident)
1. Couper l'écriture : Coolify → arrêter l'application (la page de maintenance Cloudflare prend le relais).
2. Restaurer dans une base **neuve** : `createdb officeflex_restore` puis `pg_restore -d officeflex_restore --no-owner <dump>`.
3. Vérifier : nombre de réservations et paiements du jour, dernière ligne de `audit_logs`, contrôle RLS (`SELECT relname FROM pg_class ... WHERE NOT relrowsecurity` doit être vide).
4. Basculer `DATABASE_URL`/`DIRECT_URL` vers la base restaurée (ou renommer les bases), redémarrer, `/api/health/ready`.
5. Rapprocher avec Stripe les paiements postérieurs au dump (tableau de bord Stripe → paiements de la fenêtre perdue) ; les webhooks rejoués sont idempotents.

## Test mensuel (obligatoire)
Le premier lundi du mois : restaurer le dump de la veille sur la base de staging, lancer `pnpm test:integration` contre elle, noter durée et résultat dans le carnet d'infra. Une sauvegarde jamais restaurée n'est pas une sauvegarde.
