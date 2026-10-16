FROM node:22-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.9.0

WORKDIR /app
COPY . .

# Prisma config requires a syntactically valid URL while generating the client.
# This build-only value never reaches the runtime stage and is not a credential.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @beauty-erp/database generate \
  && pnpm --filter @beauty-erp/database build \
  && pnpm --filter api build \
  && pnpm --filter api --prod deploy --legacy /prod/api

FROM node:22-bookworm-slim AS runner

ARG RELEASE_SHA=development
LABEL org.opencontainers.image.revision=$RELEASE_SHA
LABEL org.opencontainers.image.source="https://github.com/kaanb-wiascode/beauty"

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
  && apt-get upgrade --yes --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
