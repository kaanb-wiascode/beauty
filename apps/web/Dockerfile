FROM node:22-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.9.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

ARG API_URL=http://api:3000
ARG RELEASE_SHA=development
ENV API_URL=$API_URL
ENV RELEASE_SHA=$RELEASE_SHA
ENV NODE_ENV=production

RUN pnpm --filter web build

FROM node:22-bookworm-slim AS runner

ARG RELEASE_SHA=development
LABEL org.opencontainers.image.revision=$RELEASE_SHA
LABEL org.opencontainers.image.source="https://github.com/kaanb-wiascode/beauty"

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get upgrade --yes --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
