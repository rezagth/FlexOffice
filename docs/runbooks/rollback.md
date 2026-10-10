# Revenir en arrière

1. **Coolify** → application → *Image tag* : remettre le tag précédent (`<ancien sha>-production`, visible dans GHCR ou dans l'historique du workflow Deploy) → *Redeploy*.
2. Vérifier `/api/health/ready` et les logs `app.boot`.

Les migrations ne sont **pas** annulées : elles sont « expand-only » par convention (ajouter des colonnes/tables, jamais supprimer ou renommer dans la même version), donc l'ancienne image fonctionne sur le nouveau schéma. Une suppression de colonne se fait dans une version **ultérieure**, une fois qu'aucune image en service ne la lit.

Si une migration a corrompu des données : [sauvegarde-restauration.md](sauvegarde-restauration.md).
