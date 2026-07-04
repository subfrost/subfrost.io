# Subfrost.io - Multi-stage build for Cloud Run deployment

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy package files and prisma schema (needed for postinstall)
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Configure pnpm to NOT use symlinks (critical for Docker builds)
RUN echo "node-linker=hoisted" > .npmrc && \
    echo "shamefully-hoist=true" >> .npmrc && \
    echo "symlink=false" >> .npmrc && \
    echo "prefer-symlinked-executables=false" >> .npmrc

# Install dependencies
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm build


# ============================================
# Stage 3: Runner
# ============================================
FROM node:20-alpine3.18 AS runner
WORKDIR /app

# Alpine 3.18 has OpenSSL 1.1 which Prisma needs
RUN apk add --no-cache openssl

# Install Prisma CLI globally for migrations
RUN npm install -g prisma@5.22.0

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy packages with binary/WASM files that standalone misses
COPY --from=builder /app/node_modules/tiny-secp256k1 ./node_modules/tiny-secp256k1
# Copy entire @alkanes/ts-sdk package (marked as serverExternalPackages in next.config)
COPY --from=builder /app/node_modules/@alkanes ./node_modules/@alkanes
# sharp loads libvips (a native .so) via dlopen at runtime, which Next.js
# standalone tracing can't follow — it copies sharp's JS but drops the .so, so
# require('sharp') dies with ERR_DLOPEN_FAILED and every CMS image upload fails.
# Re-copy the full package incl. its nested @img native libs (same reason as above).
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img

# Fail the build loudly if sharp can't load libvips in the musl runtime, so a
# missing native lib can never silently ship and break uploads again.
RUN node -e "const s=require('sharp'); console.log('sharp', s.versions.sharp, 'libvips', s.versions.vips)"

# Same guard for jsdom (SVG sanitization in the upload route): it must load on
# THIS Node version. jsdom >=27 pulls html-encoding-sniffer@6, whose require()
# of the ESM-only @exodus/bytes needs require(esm) (Node >=20.19/22.12) and
# died here with ERR_REQUIRE_ESM on Node 20.13 — killing the upload route
# chunk at module load for every file type.
RUN node -e "const { JSDOM } = require('jsdom'); new JSDOM(''); console.log('jsdom OK on', process.version)"

# Copy Prisma schema for migrations
COPY --from=builder /app/prisma ./prisma

# Copy CronJob scripts (run with the app image, e.g. opreturn sync)
COPY scripts ./scripts

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
