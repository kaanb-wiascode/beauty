FROM node:22.13.1-bookworm-slim

RUN npm install --global pnpm@11.9.0

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

ARG API_URL=http://api:3000
ENV API_URL=$API_URL
ENV NODE_ENV=production

RUN pnpm --filter web build

ENV PORT=3001

WORKDIR /app/apps/web
USER node

EXPOSE 3001

CMD ["pnpm", "start", "--", "-p", "3001"]
