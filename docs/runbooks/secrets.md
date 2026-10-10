# Rotation des secrets

Tous les secrets vivent dans Coolify (exécution) et dans les environnements GitHub (build / migrations), jamais dans le dépôt (gitleaks en CI).

| Secret | Rotation | Procédure |
|---|---|---|
| `JWT_SECRET` Supabase (+ clés anon / service_role dérivées) | à l'installation, puis en cas de fuite | Générer un nouveau JWT_SECRET, régénérer les clés anon et service_role, mettre à jour GoTrue/Kong/PostgREST, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (rebuild des images) et `SUPABASE_SERVICE_ROLE_KEY`. Toutes les sessions sont invalidées. |
| `STRIPE_SECRET_KEY` | annuelle ou fuite | Stripe → Developers → API keys → *Roll key* (période de recouvrement), mettre à jour Coolify, redéployer. |
| `STRIPE_WEBHOOK_SECRET` | fuite | Stripe → Webhooks → *Roll secret*, mettre à jour Coolify. |
| `RESEND_API_KEY` | annuelle ou fuite | Créer une nouvelle clé, déployer, supprimer l'ancienne. |
| `CRON_SECRET` | semestrielle | `openssl rand -hex 32`, mettre à jour Coolify **et** la tâche planifiée. |
| `RATE_LIMIT_KEY_SALT` | rarement | Changer remet seulement les compteurs par compte à zéro. |
| `COOLIFY_TOKEN`, `DIRECT_URL` | annuelle | Coolify / Postgres, puis secrets GitHub. |

La clé `service_role` du Supabase **cloud** utilisé pendant le développement a transité par une conversation : ne pas la réutiliser ; l'instance auto-hébergée doit avoir ses propres secrets dès le départ (jamais ceux du `.env.example` officiel de Supabase).
