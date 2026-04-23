# Multi-stage build for apps/api. Replaces Nixpacks to cut image size by
# dropping the Nix toolchain, pnpm tarballs, devDeps, source, and tests from
# the final image.
#
# Base: node:22-bookworm-slim (glibc). Chosen over alpine because argon2 ships
# prebuilt binaries for linux-arm64-glibc — alpine/musl would force a C++
# rebuild on every deploy.

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Coolify injects NODE_ENV=production as a build ARG, which would make
# `pnpm install` skip devDeps (turbo, tsc, etc.) and break the build. Force
# development in the build stage; the runtime stage resets to production.
ENV NODE_ENV=development

# pnpm via corepack, pinned to the root packageManager field.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Workspace manifests first so the install layer caches when only app code
# changes. Copy every workspace package.json the API transitively depends on.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/eslint-plugin-butterbook/package.json packages/eslint-plugin-butterbook/

RUN pnpm install --frozen-lockfile

# Now copy source and build. `turbo run build --filter=api` will build
# @butterbook/shared first (it's a workspace dep), then api.
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/eslint-plugin-butterbook packages/eslint-plugin-butterbook

RUN pnpm turbo run build --filter=api

# pnpm deploy produces a self-contained directory with only prod deps and
# resolved workspace packages. No devDeps (vitest, tsx, eslint), no turbo
# cache, no source TS files outside what we explicitly copy.
RUN pnpm deploy --filter=api --prod --legacy /out

# SQL migrations live under src/ and aren't emitted by tsc — copy them so
# `pnpm migrate up` works in prod.
RUN cp -r apps/api/src/db/migrations /out/migrations


FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# pnpm in the runtime image so `docker exec <container> pnpm migrate up` works
# per the CLAUDE.md runbook. Small (~15MB) and worth the convenience.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy just the built app + its prod node_modules + migrations.
COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/migrations ./src/db/migrations

EXPOSE 3001
CMD ["node", "dist/index.js"]
