# Déployer

## Chaîne
1. Push sur `develop` ou `main` → **CI** (`.github/workflows/ci.yml`) : gitleaks, audit des dépendances, lint, build, typecheck, tests unitaires, tests d'intégration sur PostgreSQL, et (indicatif) migrations sur l'image `supabase/postgres`.
2. CI verte → **Deploy** (`.github/workflows/deploy.yml`) :
   - construit l'image de l'environnement (`ghcr.io/rezagth/flexoffice:<sha>-staging` ou `-production`, plus le tag mobile `:staging` / `:production`) ;
   - la scanne avec Trivy (CRITICAL/HIGH bloquants) puis la pousse ;
   - applique les migrations depuis le runner auto-hébergé (`self-hosted, officeflex`) ;
   - déclenche Coolify (webhook) ;
   - vérifie `APP_URL/api/health/ready` pendant 5 minutes.
3. Production : l'environnement GitHub `production` exige un relecteur. Rien ne part en prod sans clic.

## Configuration une fois pour toutes
- **GitHub → Settings → Environments** : `staging` et `production` (avec *Required reviewers* et restriction à la branche `main`). Variables et secrets listés en tête de `deploy.yml`.
- **Protection de `main`** : PR obligatoire, checks requis `security`, `quality`, `integration`.
- **Runner auto-hébergé** : sur la VM `ops`, enregistré avec les labels `self-hosted,officeflex`, accès réseau à la base (port 5432 interne uniquement).
- **Coolify** : une application par environnement, source « Docker image » = `ghcr.io/rezagth/flexoffice:staging` / `:production` (pull authentifié GHCR), port 3000, healthcheck `/api/health/live`, variables d'exécution (secrets serveur) saisies dans Coolify. Webhook de déploiement + token API → secrets GitHub `COOLIFY_WEBHOOK_URL` / `COOLIFY_TOKEN`.
- **Traefik** : uniquement joignable depuis `cloudflared` (aucun port 80/443 ouvert sur la box ni sur le LAN). `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`.

## Après chaque déploiement
- Logs de démarrage : `app.boot` (intégrations actives) et aucun `config.production_problem`.
- `/api/health/ready` = 200.
- Un parcours rapide : recherche, fiche, connexion.

## Images : pourquoi une par environnement
Les `NEXT_PUBLIC_*` (Supabase public, clé Stripe publique, DSN, analytics) et `APP_URL` sont figés dans le bundle au build. Une image de staging pointerait sur le Supabase de staging : ne jamais promouvoir une image d'un environnement à l'autre — reconstruire.
