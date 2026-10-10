# Créer le premier administrateur

1. La personne crée son compte normalement sur le site et confirme son e-mail.
2. Depuis une machine qui atteint la base (runner `ops`), avec la `DATABASE_URL` de l'environnement voulu :
   ```bash
   DATABASE_URL=postgresql://... pnpm admin:promote prenom@societe.fr            # simulation
   DATABASE_URL=postgresql://... OPERATOR=noam pnpm admin:promote prenom@societe.fr --confirm
   ```
3. La personne se reconnecte : le back-office `/admin` est accessible.

Retirer le rôle : même commande avec `--demote --confirm`. Chaque changement est inscrit dans `audit_logs` (`admin.promoted` / `admin.demoted`) avec l'opérateur. Le script ne crée jamais de compte et ignore toute métadonnée d'inscription.
