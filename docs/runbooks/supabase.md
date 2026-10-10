# Supabase auto-hébergé

## Kong (exposition)
Publier via le tunnel **uniquement** `/auth/v1/*` et `/storage/v1/*` sous `api.<domaine>`. L'application n'utilise pas PostgREST : ne pas exposer `/rest/v1`. Studio, Meta et la base ne sont accessibles que par le VPN d'administration.

## GoTrue (comptes)
| Variable | Valeur |
|---|---|
| `GOTRUE_SITE_URL` / `SITE_URL` | `https://<domaine>` (= `APP_URL`) |
| `API_EXTERNAL_URL` | `https://api.<domaine>` |
| `GOTRUE_URI_ALLOW_LIST` | `https://<domaine>/auth/confirm` |
| `GOTRUE_MAILER_AUTOCONFIRM` | `false` (confirmation d'e-mail obligatoire — sinon l'inscription redevient un oracle d'énumération) |
| `GOTRUE_PASSWORD_MIN_LENGTH` | `8` (même règle que l'app) |
| `GOTRUE_SMTP_HOST/PORT/USER/PASS/ADMIN_EMAIL` | SMTP Resend (`smtp.resend.com`, 465, `resend`, clé API) |
| `GOTRUE_RATE_LIMIT_EMAIL_SENT` | 30/heure |
| `GOTRUE_EXTERNAL_*` | désactivés (pas de connexion sociale) |
| CAPTCHA (optionnel) | `GOTRUE_SECURITY_CAPTCHA_ENABLED=true`, provider Turnstile |

Gabarits d'e-mail (lien valable dans n'importe quel navigateur) :
- confirmation : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/post-login`
- mot de passe : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- changement d'e-mail : `...&type=email_change&next=/app/account`

## Storage
Deux buckets créés par l'app au premier envoi, avec types MIME et taille max : `space-photos` (public), `verification-documents` (privé, URLs signées 120 s). Aucune policy `INSERT` pour `anon`/`authenticated` sur `storage.objects` : tout passe par le serveur avec la clé service_role.

## Après installation
Rejouer les migrations (job `migrate`) puis vérifier : `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;` → vide.
