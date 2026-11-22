FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin ./apps/admin

WORKDIR /app/apps/admin
RUN pnpm install
RUN pnpm run build

FROM node:22-alpine AS runner

WORKDIR /app/apps/admin
ENV NODE_ENV=production
ENV PORT=3001

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY --from=builder /app/pnpm-lock.yaml /app/
COPY --from=builder /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/apps/admin ./

EXPOSE 3001

CMD ["node_modules/.bin/next", "start", "-p", "3001"]
