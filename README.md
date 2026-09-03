# OfficeFlex

Marketplace B2B de réservation d'espaces professionnels à la demande — salles
de réunion, bureaux et espaces de formation, à la demi-journée ou à la journée.

Monolithe **Next.js 16** (App Router, React 19) sur **PostgreSQL** via
**Prisma 7**, authentification **Supabase Auth**, paiement **Stripe** derrière
une abstraction interne. Déploiement visé : Vercel.

État : la boucle `publier → modérer → réserver → accepter → capturer`
fonctionne de bout en bout. Le paiement reste sur le fournisseur **mock** —
brancher de l'argent réel est volontairement différé (`PAYMENT_PROVIDER`).

Les conventions et les raisons derrière chaque choix non évident sont dans les
commentaires des fichiers concernés, en particulier `src/server/auth/rbac.ts`,
`src/server/domains/bookings/create-booking.ts` et chaque fichier de
`prisma/migrations/`.

---

## Démarrage

```bash
pnpm install     # pnpm uniquement — jamais npm ni yarn
pnpm dev
```

Le site est accessible sur http://localhost:3000.

**Aucune configuration n'est nécessaire pour démarrer.** Sans variables
d'environnement, l'application tourne en mode démo : les pages publiques
servent des données statiques et tout le monde est considéré comme déconnecté.
C'est un contrat volontaire du projet (voir *Mode démo*).

Pour un environnement complet, copier `.env.example` vers `.env` et le
compléter. `.env` n'est jamais committé.

### Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | serveur de développement |
| `pnpm build` | build de production — inclut la vérification TypeScript |
| `pnpm start` | sert le build de production |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` — **nécessite un `pnpm build` préalable** (voir ci-dessous) |
| `pnpm test` | toute la suite Vitest |
| `pnpm test:unit` | tests unitaires — aucune infrastructure requise |
| `pnpm test:integration` | tests d'intégration — nécessite une base (voir *Tests*) |
| `pnpm db:migrate` | crée et applique une migration en développement |
| `pnpm db:deploy` | applique les migrations existantes (CI, préproduction, production) |
| `pnpm db:seed` | comptes et espaces de démonstration — base locale uniquement |

> `pnpm typecheck` échoue sur un dépôt fraîchement cloné avec
> `Cannot find name 'PageProps'`. Ces types sont générés par Next.js dans
> `.next/types` : lancer `pnpm build` (ou `pnpm dev`) une fois d'abord. C'est
> aussi l'ordre utilisé par la CI.

### Branches

`develop` est la branche de travail : tout le développement s'y fait. `main`
suit derrière.

---

## Base de données

Deux chaînes de connexion distinctes, et ce n'est pas redondant :

| Variable | Usage | Pourquoi |
|---|---|---|
| `DATABASE_URL` | l'application, à l'exécution | connexion **poolée** (pgbouncer, port 6543 chez Supabase) — adaptée à un usage par requête en serverless |
| `DIRECT_URL` | `prisma migrate` uniquement | connexion **directe** (port 5432) — le pooler en mode transaction ne supporte ni les verrous consultatifs ni le DDL dont `prisma migrate` a besoin |

Deux détails d'implémentation à ne pas « simplifier » :

- **`src/server/db/prisma.ts` est paresseux, via un `Proxy`.** `next build`
  importe chaque module de route pour l'analyser, sans requête et sans
  garantie que les variables d'environnement soient présentes. Un
  `export const prisma = new PrismaClient()` échouerait au chargement du
  module et casserait le build.
- **`prisma7.config.ts` lit `DIRECT_URL` directement depuis `process.env`**,
  et non via le helper `env()` qui lève. `prisma generate` tourne à chaque
  `pnpm install`, y compris en CI, et n'a besoin que du schéma.

### Migrations

Toute modification du schéma passe par une migration Prisma committée. Jamais
de `db push` ni de modification manuelle en production, et les migrations
historiques ne sont pas réécrites.

Six migrations sont **écrites à la main**, parce que Prisma ne sait pas les
exprimer. Chacune porte en tête l'explication de ce qu'elle fait et pourquoi ;
les lire avant de toucher au schéma :

| Migration | Contenu |
|---|---|
| `..._auth_profiles_sync` | clé étrangère réelle vers `auth.users` et trigger `handle_new_user`, qui crée le profil (et l'organisation d'un partenaire) de façon atomique |
| `..._booking_exclusion_constraint` | contrainte `EXCLUDE` empêchant la double réservation **au niveau de la base** |
| `..._harden_signup_role_whitelist` | liste blanche du rôle à l'inscription — `raw_user_meta_data` est fourni par le client |
| `..._enable_rls_revoke_public_grants` | RLS activée et privilèges `anon`/`authenticated` révoqués sur toutes les tables |
| `..._timestamptz_business_columns` | les 24 colonnes temporelles passent en `timestamptz`, et la contrainte d'exclusion est reconstruite sur `tstzrange` |
| `..._business_integrity_constraints` | contraintes `CHECK` métier, clés étrangères composites de cohérence tenant, invariant d'anonymisation RGPD |

Deux points d'attention permanents :

- Prisma **ignore les contraintes `CHECK`** lors du diff : elles ne
  provoquent pas de dérive, mais Prisma ne les recréera pas non plus.
- Prisma **ne connaît pas les clés étrangères composites**. Une migration
  générée automatiquement pourrait proposer de les supprimer. Un test
  d'intégration vérifie qu'elles sont toujours là — **relire tout diff de
  migration généré**.

Après tout changement de `prisma/schema.prisma` : régénérer le client
(`pnpm exec prisma generate`, ou simplement `pnpm install`).

---

## Sécurité

Le point de départ, à garder en tête avant d'écrire le moindre contrôle :

```
Navigateur ──── clé publiable (dans le bundle JS) ────┐
   │                                                   ▼
   ├───► Next.js ──► Prisma ────►  Supabase : /auth/v1/*  /rest/v1/*
   └──────────── VOIE DIRECTE ───►  triggers, contraintes, RLS
                 (aucune validation applicative ne s'applique)
```

**Un contrôle placé dans une route Next.js ne protège que la voie Next.js.**
Tout ce qui est aussi joignable directement sur Supabase doit être protégé
*dans la base* : trigger, contrainte, RLS, privilèges.

Conséquences concrètes, toutes appliquées dans le dépôt :

- **Aucun privilège ne se dérive d'une donnée fournie par le client.**
  `raw_user_meta_data` est le champ `options.data` de `signUp()` : le rôle est
  mis en liste blanche dans le trigger, pas seulement validé par Zod.
- **Toute table est créée avec `ENABLE ROW LEVEL SECURITY` et les privilèges
  `anon`/`authenticated` révoqués, dans la même migration.** L'application
  passe par Prisma en tant que propriétaire des tables, donc n'est pas soumise
  à la RLS ; `FORCE ROW LEVEL SECURITY` n'est volontairement pas utilisé, il
  enfermerait l'application dehors. `tests/unit/rls-coverage.test.ts` échoue
  si une nouvelle table saute ce bloc ;
  `tests/integration/rls-live.test.ts` vérifie la base réelle, pas seulement
  le SQL.
- **`src/server/auth/rbac.ts` est la frontière d'autorisation.** Les layouts et
  les pages appellent les gardes de `src/server/auth/page-guards.ts` (qui
  redirigent) ; les route handlers appellent `requireAuth`, `requireRole`,
  `requireOrg` ou `requireOrganizationAccess` (qui renvoient un statut HTTP).
  Masquer un lien de navigation n'est pas une autorisation, et une garde de
  layout ne protège pas un route handler.
- **Toute requête sensible est scopée par une valeur issue de la session
  vérifiée** (`ctx.userId`, `ctx.organizationId`), jamais par un identifiant
  fourni par le client. Un accès par identifiant filtre la propriété dans le
  `where` et répond 404 hors périmètre — pas 403, qui confirmerait l'existence
  de la ressource.
- **Les montants sont calculés côté serveur**, en centimes entiers, depuis les
  données en base. Le corps de la requête ne porte que l'intention : quel
  espace, quel jour, quel créneau nommé, combien de participants, pourquoi.
  Le taux de commission est une constante serveur
  (`src/server/domains/payments/constants.ts`).
- **La double réservation est empêchée par la contrainte `EXCLUDE`**, pas par
  un `SELECT` applicatif « est-ce libre ? » — deux requêtes concurrentes
  passent toutes les deux un tel test. `createBooking` insère la réservation
  seule et en premier, de sorte que la contrainte tranche avant toute
  autorisation de paiement. La violation remonte en SQLSTATE `23P01` et se
  traduit en `ConflictError` (409).
- **L'état d'un paiement ne vient que d'un webhook à signature vérifiée**,
  appliqué par `applyPaymentOutcome`, seul endroit où une réservation atteint
  un état final. Chaque transition est conditionnée à l'état courant, donc un
  événement rejoué est un no-op et non une double capture.
- **Les photos passent par le serveur** avant Supabase Storage : propriété,
  type MIME et taille sont vérifiés, et le chemin de l'objet est construit
  côté serveur sous le préfixe de l'organisation, pour qu'un partenaire ne
  puisse pas écrire chez un autre.
- **`SUPABASE_SERVICE_ROLE_KEY` est serveur uniquement**, importée seulement
  depuis `src/server/auth/supabase-admin.ts`, jamais préfixée `NEXT_PUBLIC_`.

### Limitation de débit

`rateLimit()` (`src/server/auth/rate-limit/`) s'appuie sur un magasin
enfichable. Le magasin mémoire par défaut compte **par processus** : sur
Vercel, cela signifie par instance, remis à zéro à chaque démarrage à froid.
**Ce n'est donc pas un contrôle de production.** Renseigner
`UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` pour un compteur
partagé ; sinon l'application journalise une erreur à chaque démarrage en
production.

L'identifiant client est lu dans les en-têtes que la plateforme garantit
(`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`), et non dans le
premier maillon de `x-forwarded-for`, que le client fournit lui-même.

En cas de panne du magasin, la décision par défaut est de **refuser** : un
limiteur qui échoue en mode ouvert offre le contournement recherché. Les
lectures publiques passent `onStoreError: "allow"`, pour ne pas transformer
une panne du limiteur en panne du tunnel de réservation.

La connexion passe par `POST /api/auth/login` afin qu'un serveur soit sur le
chemin : limite par IP **et** par compte, réponse uniforme pour tout échec.
**Attention** : le point d'entrée Supabase (`/auth/v1/token`) reste joignable
en direct avec la clé publiable. Ces limites protègent la voie normale et
donnent la télémétrie ; le plafond réel se règle dans les limites Supabase
Auth du tableau de bord.

### Suppression de compte (RGPD)

`src/server/domains/users/gdpr.ts`. Export réel et effacement réel.

- **aucun historique de réservation** → suppression complète : l'utilisateur
  Supabase est supprimé, la cascade nettoie le profil ;
- **au moins une réservation** → anonymisation : `bookings_client_user_id_fkey`
  est `ON DELETE RESTRICT` et les réservations doivent être conservées
  (comptabilité, preuve de transaction, art. 17§3(e)), donc les champs
  personnels du profil sont écrasés, `deleted_at` est horodaté, et
  l'utilisateur Supabase est nettoyé puis banni.

La base refuse une anonymisation partielle : `profiles_anonymized_has_no_pii_check`
rejette une ligne portant `deleted_at` alors qu'elle contient encore un e-mail
ou un téléphone. `getAuthContext()` refuse en outre toute session résolvant
vers un profil anonymisé.

---

## Mode démo

Le site doit rester navigable sans aucune infrastructure configurée. Toute
nouvelle dépendance à une variable d'environnement respecte ce contrat :

- `DATABASE_URL` absent → `list-spaces.ts` sert `mock-data.ts` au lieu de
  lever une erreur ;
- variables Supabase absentes → `src/proxy.ts` saute le rafraîchissement de
  session et `getAuthContext()` renvoie `null` (« déconnecté ») ;
- une variable d'environnement vide `""` est traitée comme absente, pas
  seulement `undefined`.

Sur un déploiement de démonstration en production, poser
`OFFICEFLEX_DEMO_MODE=true` : sans ce drapeau, une configuration manquante en
production est journalisée comme une erreur de déploiement — ce qu'elle est.

`getAuthContext()` distingue explicitement quatre situations : démo assumée,
utilisateur non authentifié, configuration absente hors production, et panne
réelle d'infrastructure. Seule la dernière lève une erreur (503, rendue par
`src/app/error.tsx`). **Une panne serveur ne doit jamais être présentée comme
un visiteur anonyme.**

---

## Tests

```bash
pnpm test:unit          # toujours exécutable, aucune infrastructure
pnpm test               # tout ; les suites d'intégration se sautent d'elles-mêmes
```

Les suites d'intégration sont filtrées selon ce dont elles ont réellement
besoin (`tests/integration/helpers/should-run.ts`) :

| Portail | Condition | Ce qu'il couvre |
|---|---|---|
| `hasDatabase` | `INTEGRATION=1` + `DATABASE_URL` | RLS, contraintes `CHECK` et `EXCLUDE`, fuseaux horaires, cloisonnement tenant, visibilité des annonces, création et acceptation de réservation |
| `hasSupabase` | + un vrai projet Supabase | escalade de privilège à l'inscription, suppression RGPD |
| `hasServer` | + `TEST_BASE_URL` et une instance démarrée | route d'inscription de bout en bout |

> La variable est `TEST_BASE_URL`, **pas `BASE_URL`** : Vite — et donc Vitest —
> réserve ce nom pour le chemin de base public de l'application et le force à
> `/`, ce qui transformait silencieusement chaque requête en
> `fetch("//api/...")` et rendait ces tests inexécutables.

### Contre une base éphémère (ce que fait la CI)

```bash
docker run -d --name officeflex-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=officeflex_test -p 5432:5432 postgres:17-alpine

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/officeflex_test"
export DIRECT_URL="$DATABASE_URL"

# Deux migrations ne s'appliquent pas sur un PostgreSQL nu : l'une référence
# le schéma `auth` de Supabase, l'autre révoque des privilèges aux rôles
# `anon`/`authenticated`, qui n'existent pas. Ce fichier fournit les deux.
# Voir son en-tête.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/auth-schema-shim.sql

pnpm db:deploy
INTEGRATION=1 pnpm test:integration
```

### Contre un vrai projet Supabase

```bash
pnpm dev   # dans un autre terminal
INTEGRATION=1 TEST_BASE_URL=http://localhost:3000 pnpm test
```

`setup-test-users.sh` crée les comptes de test à partir des variables
d'environnement (aucun identifiant n'est écrit dans le dépôt).

Plusieurs tests portent des **invariants de sécurité** : isolation tenant,
impossibilité de s'auto-attribuer un rôle à l'inscription, contrainte
anti-double-réservation, RLS active sur chaque table, absence de donnée
personnelle après anonymisation, prix ignoré s'il vient du client. Si l'un
casse, c'est le code applicatif qu'il faut corriger — jamais le test qu'il
faut assouplir.

---

## CI

`.github/workflows/ci.yml`, deux jobs, aucun secret de production :

- **quality** — `pnpm lint`, `pnpm build` (qui inclut la vérification
  TypeScript), `pnpm typecheck`, `pnpm test:unit`. Le build tourne
  volontairement **sans aucune variable d'environnement** : c'est ainsi que le
  contrat du mode démo est vérifié à chaque PR.
- **integration** — PostgreSQL 17 éphémère, shim du schéma Supabase,
  `pnpm db:deploy`, puis `INTEGRATION=1 pnpm test:integration`. Se termine par
  deux vérifications directes en SQL : aucune table de `public` sans RLS, et
  aucun privilège restant pour `anon`/`authenticated`.

---

## Structure

```
src/app/(marketing)/     landing publique + pages légales (CGU, CGV, confidentialité…)
src/app/(auth)/          login, register
src/app/search/          recherche publique (sans compte)
src/app/spaces/[slug]/   fiche espace publique + tunnel de réservation
src/app/client/          espace Client      (layout = garde de rôle)
src/app/partner/         espace Partenaire
src/app/admin/           back-office Admin
src/app/api/             route handlers
src/components/          ui/ · marketing/ · auth/ · dashboard/ · booking/
src/lib/                 helpers isomorphes (format, timezone, validation, supabase-browser)
src/server/              code strictement serveur
  auth/                  rbac · page-guards · runtime-config · rate-limit/ · supabase-*
  db/prisma.ts           client Prisma paresseux
  domains/<domaine>/     bookings · payments · organizations · users · spaces · notifications
  lib/                   http · errors · logger · audit
src/generated/prisma/    client Prisma généré — NE JAMAIS éditer à la main
src/proxy.ts             remplace middleware.ts (Next.js 16) — rafraîchit la session, n'autorise rien
```

Règles de structure :

- Tout ce qui touche à la base, aux secrets ou à l'autorisation vit sous
  `src/server/`. Ne jamais importer `src/server/**` depuis un Client Component.
- La logique métier va dans `src/server/domains/<domaine>/`, pas dans le
  composant de page ni dans le route handler — ces derniers orchestrent et
  rendent.
- Alias d'import : `@/` → `src/`.

---

## Conventions d'API et d'UI

- Tout route handler est enveloppé dans `withErrorHandling`
  (`src/server/lib/http.ts`). Enveloppe d'erreur unique :
  `{ error: { code, message } }`, plus `issues` pour une `ZodError`. Une
  erreur inattendue devient un 500 génrique — jamais de trace ni de message
  interne renvoyé au client.
- Codes disponibles dans `src/server/lib/errors.ts` : `UNAUTHORIZED` 401,
  `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` 400, `CONFLICT` 409,
  `RATE_LIMITED` 429, `SERVICE_UNAVAILABLE` 503.
- **Ne jamais simuler un succès.** Une fonctionnalité non implémentée renvoie
  `501 NOT_IMPLEMENTED` avec un message explicite, et l'UI annonce que ça
  arrive dans une prochaine itération.
- Les entrées sont validées avec Zod (`src/lib/validation/`).
- Les actions sensibles sont tracées via `src/server/lib/audit.ts` et
  journalisées via `src/server/lib/logger.ts`. **Jamais de mot de passe, de
  jeton, de cookie ni de donnée personnelle inutile dans un log** — un journal
  a une durée de conservation plus longue et une audience plus large que la
  table qu'il décrit.
- **Toute la copie visible est en français.** Les identifiants, noms de
  variables et commentaires de code sont en anglais.
- Les montants sont stockés **en centimes entiers** et affichés via
  `formatCents()`. Aucun flottant ne touche un montant.
- Les horaires d'ouverture sont des chaînes « HH:mm » d'heure locale ; le
  fuseau qui les résout vit sur le `Space` (`Europe/Paris` par défaut). La
  conversion résout l'offset deux fois, ce qui garde corrects les jours de
  changement d'heure.
- Primitives UI dans `src/components/ui/` — les réutiliser plutôt que de
  recréer des styles. États vides via `<EmptyState>`.

---

## Notes Next.js 16

Cette version diffère des habitudes : lire `node_modules/next/dist/docs/`
avant d'écrire du code Next, comme l'impose `AGENTS.md`.

- **`src/proxy.ts` remplace `middleware.ts`.** Il ne fait *que* rafraîchir le
  cookie de session Supabase. Il ne fait **aucune** autorisation de route — ne
  jamais y ajouter un contrôle de rôle en croyant protéger une page.
- Les pages typées utilisent `PageProps<"/route">` et `LayoutProps<"/route">`.
  `searchParams` et `params` sont **asynchrones** :
  `const { city } = await searchParams`.
- Une page qui dépend de données vivantes ou de la query string déclare
  `export const dynamic = "force-dynamic"`.
- Le bloc `<!-- BEGIN:nextjs-agent-rules -->` d'`AGENTS.md` est réécrit par
  `next dev`. Ne pas chercher à le supprimer : le committer avec le reste.
