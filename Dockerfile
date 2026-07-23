# syntax=docker/dockerfile:1

# Creed production image, built in three stages so the final runner ships
# only what `next start` needs at runtime (no source tree, no dev deps,
# no package manager cache).
#
# Build:
#   docker build \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://creed.md \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=xxx \
#     --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx \
#     -t creed .
#
# Run:
#   docker run -p 3000:3000 --env-file .env creed
#
# `NEXT_PUBLIC_*` values are inlined into the client bundle at build time,
# so they must be passed as --build-arg. Every other variable in
# .env.example is read at runtime and belongs in `docker run --env-file`
# (or your platform's secret store) instead.

ARG NODE_VERSION=22-alpine

# ---- deps: install dependencies from the lockfile only ----------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION} AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_TWITTER_URL
ARG NEXT_PUBLIC_INSTAGRAM_URL
ARG NEXT_PUBLIC_GITHUB_URL
ARG NEXT_PUBLIC_RELEASE_SHA
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL \
    NEXT_PUBLIC_TWITTER_URL=$NEXT_PUBLIC_TWITTER_URL \
    NEXT_PUBLIC_INSTAGRAM_URL=$NEXT_PUBLIC_INSTAGRAM_URL \
    NEXT_PUBLIC_GITHUB_URL=$NEXT_PUBLIC_GITHUB_URL \
    NEXT_PUBLIC_RELEASE_SHA=$NEXT_PUBLIC_RELEASE_SHA \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
 ----------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

 here.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
