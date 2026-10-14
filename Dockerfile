# Build native Node.js modules on Debian/glibc, then run with the matching runtime.
# This avoids relying on Alpine/musl prebuilt binaries for SQLite native addons.
FROM node:22-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ pkg-config \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm install sqlite3
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/noby.sqlite
RUN apt-get update \
 && apt-get install -y --no-install-recommends imagemagick fonts-noto-core \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/data /app/public/generated /app/data/jobs \
 && chown -R node:node /app
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "start"]
