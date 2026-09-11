FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@deliveryos/runtime", "start"]
