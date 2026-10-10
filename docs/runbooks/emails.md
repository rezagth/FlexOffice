# E-mails

- **Transactionnels de l'app** : Resend, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM="OfficeFlex <reservations@<domaine>>"`. `onboarding@resend.dev` ne délivre qu'au propriétaire du compte Resend : interdit en prod (signalé au démarrage).
- **E-mails de compte** (confirmation, mot de passe) : envoyés par GoTrue via le SMTP Resend (voir [supabase.md](supabase.md)).
- **Alertes admin** (litiges, chargebacks) : `ADMIN_ALERT_EMAIL` (une ou plusieurs adresses séparées par des virgules).

## DNS (Cloudflare)
1. Resend → Domains → ajouter `<domaine>` → recopier dans Cloudflare les enregistrements **SPF** (TXT), **DKIM** (CNAME/TXT) et le MX de retour, en *DNS only* (nuage gris).
2. **DMARC** : `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@<domaine>` au départ, puis `p=quarantine` après deux semaines sans échec.
3. Tester : inscription, mot de passe oublié, réservation (demande, confirmation), puis vérifier les en-têtes (`spf=pass`, `dkim=pass`).
