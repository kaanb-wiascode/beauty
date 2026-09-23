FROM node:22.13.1-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @beauty-erp/database generate \
  && pnpm --filter @beauty-erp/database build \
  && pnpm --filter @beauty-erp/types build \
  && pnpm --filter api build

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app/apps/api
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
