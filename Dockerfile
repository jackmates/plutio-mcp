FROM node:22-alpine

# curl is needed for Coolify's container-level healthcheck wrapper.
# Without it, Coolify falls back to busybox wget which can mis-time the
# health probe during cold start.
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY README.md ./README.md

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Container-level healthcheck. Coolify can also wrap this externally; either
# way curl is now available so the probe succeeds.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["npm", "run", "start:http"]
