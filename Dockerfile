# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# better-sqlite3 requires build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build the Next.js app ────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/scripts       ./scripts
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/.next         ./.next

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "scripts/start.js"]
