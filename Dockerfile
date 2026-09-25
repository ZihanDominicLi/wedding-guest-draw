FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH
RUN mkdir -p "$COREPACK_HOME" \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate \
  && chmod -R a+rX "$COREPACK_HOME"
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV BETTER_AUTH_SECRET=build-only-secret-0123456789abcdef
ENV BETTER_AUTH_URL=http://127.0.0.1:3000
ENV ADMIN_EMAIL=build@example.com
ENV ADMIN_PASSWORD=build-only-password
ENV WEDDING_DOMAIN=127.0.0.1
RUN pnpm prisma generate && pnpm build

FROM postgres:17-bookworm AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
ENTRYPOINT []
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=base /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=base /corepack /corepack
RUN groupadd --gid 1000 node \
  && useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash node \
  && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
  && ln -s ../lib/node_modules/corepack/dist/pnpm.js /usr/local/bin/pnpm \
  && node --version \
  && pnpm --version \
  && pg_dump --version | grep "17\."
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder --chmod=755 /app/deploy ./deploy
COPY --from=builder /app/src ./src
RUN mkdir -p /data/uploads /data/backups \
  && chown -R node:node /app /data
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm seed && pnpm start"]
