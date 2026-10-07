# Runbooks d'exploitation

Cible : serveur Proxmox (chez l'associé), Coolify, images GHCR construites par GitHub Actions, Supabase auto-hébergé, Cloudflare (tunnel) devant Traefik, GlitchTip, Umami. `develop` → staging, `main` → production.

| Fiche | Quand |
|---|---|
| [deployer.md](deployer.md) | Mettre en ligne (staging automatique, prod avec approbation) |
| [rollback.md](rollback.md) | Revenir à la version précédente |
| [migrations.md](migrations.md) | Faire évoluer le schéma sans casser la version en ligne |
| [sauvegarde-restauration.md](sauvegarde-restauration.md) | Sauvegardes, restauration, test mensuel, RPO/RTO |
| [secrets.md](secrets.md) | Rotation des secrets |
| [promouvoir-admin.md](promouvoir-admin.md) | Créer le premier administrateur |
| [stripe.md](stripe.md) | Webhook Stripe, Connect, passage en live |
| [taches-planifiees.md](taches-planifiees.md) | Tâche de maintenance toutes les 15 min |
| [supabase.md](supabase.md) | GoTrue (e-mails, mots de passe, liens), Kong, Storage |
| [emails.md](emails.md) | Domaine d'envoi Resend, SPF / DKIM / DMARC |
| [observabilite.md](observabilite.md) | GlitchTip, logs, alertes, sondes |

Toutes les variables sont décrites dans `.env.example`. Au démarrage, l'app journalise en erreur chaque variable manquante en production (`config.production_problem`) : c'est la première chose à regarder après un déploiement.
