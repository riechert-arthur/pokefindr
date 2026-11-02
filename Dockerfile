# syntax=docker/dockerfile:1
# Production image: runs the Next.js standalone server on any container host.
# (The Arch-based development shell lives in Dockerfile.dev.)
#
#   docker build -t pokefindr \
#     --build-arg NEXT_PUBLIC_MAPBOXGL_API_KEY=... \
#     --build-arg NEXT_PUBLIC_MAPBOX_GEOCODING_API_KEY=... .
#   docker run -p 3000:3000 --env-file .env.production pokefindr
#
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build
# arguments. Server secrets (DATABASE_URL, JWT_SECRET, ...) are runtime env only.

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_MAPBOXGL_API_KEY
ARG NEXT_PUBLIC_MAPBOX_GEOCODING_API_KEY
ARG NEXT_PUBLIC_PIXEL_TRACKING_URL_1
ARG NEXT_PUBLIC_AFFILIATE_LINK_1
ARG NEXT_PUBLIC_IMAGE_1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "server.js"]
