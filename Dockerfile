# The game server with the built client (deploy/README.md).

# Builds on the machine's own platform, since the client and the server's code are the same everywhere.
# Only the production dependencies are installed for the target, which needs no emulation.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
ARG TARGETARCH
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/sim/package.json packages/sim/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
# The version is a hash of the source. The server only lets clients of the same build into lobbies,
# so a page left open over an update is asked to reload (docs/server-spec.md section 8).
RUN find packages -path '*/node_modules' -prune -o -type f -print | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -c1-12 > VERSION \
  && GAME_VERSION="$(cat VERSION)" pnpm build \
  && rm -rf node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --os=linux --libc=glibc --cpu="$(if [ "$TARGETARCH" = amd64 ]; then echo x64; else echo "$TARGETARCH"; fi)"

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app /app
WORKDIR /app/packages/server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/status').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["sh", "-c", "GAME_VERSION=\"$(cat /app/VERSION)\" exec node --import tsx src/main.ts"]
