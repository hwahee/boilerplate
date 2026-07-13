# Multi-stage build for the API server. Build context is the REPO ROOT
# (see docker-compose.yml) so the workspace install sees every package.json.
# The final image contains ONLY the built artifacts: the server bundle and
# the migration runner.

FROM oven/bun:1.3 AS build
WORKDIR /repo

# Install with a frozen lockfile first, so source changes don't bust the layer.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN cd apps/server && bun run build

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV APP_ENV=production
ENV PORT=3000

COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/migrations ./migrations

EXPOSE 3000

WORKDIR /app/dist

# Apply migrations with: docker compose run app bun migrate.js
CMD ["bun", "index.js"]
