#!/usr/bin/env bash
# Applique les migrations sur le projet Supabase configuré dans .env, puis
# crée les comptes de test et les données de démonstration.
#
# À lancer une seule fois, après avoir rempli les 5 variables Supabase
# dans .env (voir .env.example).
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "✗ .env introuvable." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
           SUPABASE_SERVICE_ROLE_KEY DATABASE_URL DIRECT_URL; do
  value="${!var:-}"
  if [ -z "$value" ] || [[ "$value" == *xxxxxxxxxxxx* ]] || [[ "$value" == "ey..." ]]; then
    echo "✗ $var n'est pas renseignée dans .env (ou contient encore la valeur d'exemple)." >&2
    exit 1
  fi
done

case "$NEXT_PUBLIC_SUPABASE_URL" in
  *localhost*|*127.0.0.1*)
    echo "✗ NEXT_PUBLIC_SUPABASE_URL pointe encore vers un Supabase local," >&2
    echo "  qui n'est pas lancé sur cette machine. Remplace les 5 variables" >&2
    echo "  par celles de ton projet Supabase cloud, puis relance ce script." >&2
    exit 1
    ;;
esac

DB_HOST=$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]+@([^:/?]+).*#\1#')

echo "→ Projet Supabase : $NEXT_PUBLIC_SUPABASE_URL"
echo "→ Base            : $DB_HOST"
echo

echo "1/2 Application des migrations…"
pnpm db:deploy

echo
echo "2/2 Création des comptes de test et des données de démonstration…"
# Le seed refuse par défaut toute base non locale : il crée un compte ADMIN
# avec la clé service_role, et personne ne veut faire ça sur une base
# partagée par accident. Ici c'est délibéré, sur ton propre projet de test,
# donc on nomme explicitement l'hôte autorisé.
SEED_ALLOW_NON_LOCAL_DB="$DB_HOST" pnpm db:seed

echo
echo "✓ Terminé. Les mots de passe ci-dessus ne sont affichés qu'une fois :"
echo "  note-les maintenant. Ce projet Supabase est accessible depuis"
echo "  Internet — ces identifiants sont de vrais identifiants."
