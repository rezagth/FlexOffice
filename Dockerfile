# syntax=docker/dockerfile:1
#
# OfficeFlex production image — one image PER ENVIRONMENT.
#
# Every NEXT_PUBLIC_* value is inlined into the browser bundle by `next build`,
# so it is a build argument, not a runtime variable: the staging image and the
# production image are two builds of the same commit, tagged <sha>-staging and
# <sha>-prod by .github/workflows/deploy.yml. Server-side secrets (database,
# Stripe secret key, Resend…) are NEVER build arguments: Coolify injects them
# at runtime. See docs/runbooks/deployer.md.
#
# Build locally (example):
#   docker build \
#     --build-arg APP_VERSION=$(git rev-parse --short HEAD) \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.fr \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=ey... \
#     --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... \
#     -t officeflex:local .

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- base: Node 22 + pnpm through corepack (version pinned by package.json)
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ---- deps: install with the lockfile; postinstall runs `prisma generate`
# (schema only, no database needed — see prisma7.config.ts).
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma7.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build
FROM base AS build
WORKDIR /app

# Public, per-environment configuration baked into the browser bundle.
ARG APP_VERSION=dev
# Public URL of this environment: baked into metadata (canonical URLs,
# OpenGraph) of statically prerendered pages, and read again at runtime.
ARG APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_UMAMI_SRC
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
# Source map upload target (GlitchTip). Not secret; the token is a BuildKit
# secret below, so it never lands in a layer or in `docker history`.
ARG SENTRY_URL
ARG SENTRY_ORG
ARG SENTRY_PROJECT

ENV APP_VERSION=$APP_VERSION \
    APP_URL=$APP_URL \
    NEXT_PUBLIC_APP_VERSION=$APP_VERSION \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_UMAMI_SRC=$NEXT_PUBLIC_UMAMI_SRC \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    SENTRY_URL=$SENTRY_URL \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT

COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    pnpm build

# ---- runtime: only the standalone server and its traced dependencies
FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=$APP_VERSION
WORKDIR /app
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
# Liveness only — never a dependency check (see src/app/api/health/live).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
LABEL org.opencontainers.image.source="https://github.com/rezagth/FlexOffice" \
      org.opencontainers.image.revision=$APP_VERSION
CMD ["node", "server.js"]
