# The game server and the built client in one image (docs/server-spec.md section 9).
# Build: docker build -t lotr-tactics .    Run: docker run -p 8080:8080 lotr-tactics

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Builds the client into packages/client/dist.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lotr-tactics/client build

# The server runs from its TypeScript source with tsx, with production dependencies only.
FROM base AS runtime
ENV NODE_ENV=production PORT=8080
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sim/package.json packages/sim/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --prod --filter @lotr-tactics/server...
COPY packages/sim/src packages/sim/src
COPY packages/server/src packages/server/src
COPY --from=build /app/packages/client/dist packages/client/dist

USER node
WORKDIR /app/packages/server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT ?? 8080) + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Node itself is the container's main process, so `docker stop` reaches the server's SIGTERM handler.
CMD ["node", "--import", "tsx", "src/main.ts"]
