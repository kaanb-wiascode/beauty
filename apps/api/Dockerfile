FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database ./packages/database
COPY apps/api ./apps/api

# Database paketini kur ve Prisma Client üret
WORKDIR /app/packages/database
RUN pnpm install
RUN npx prisma generate
RUN pnpm run build

# API bağımlılıklarını kur ve build al
WORKDIR /app/apps/api
RUN pnpm install
RUN pnpm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/main.js"]
