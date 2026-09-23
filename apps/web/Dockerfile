FROM node:22.13.1-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.9.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

ARG API_URL=http://api:3000
ENV API_URL=$API_URL
ENV NODE_ENV=production

RUN pnpm --filter web build

FROM node:22.13.1-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app
COPY --from=builder --chown=node:node /app /app

WORKDIR /app/apps/web
USER node

EXPOSE 3001

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3001"]
