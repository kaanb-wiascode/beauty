FROM node:22.13.1-bookworm-slim AS builder

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
  && pnpm --filter @beauty-erp/types build \
  && pnpm --filter api build

FROM node:22.13.1-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY --from=builder --chown=node:node /app /app

WORKDIR /app/apps/api
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
