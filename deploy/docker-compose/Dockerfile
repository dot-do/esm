# Dockerfile for esm.do worker
# Uses Miniflare for local Cloudflare Workers emulation

FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
COPY core/package.json ./core/

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile || npm ci || npm install

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build || npm run build

# Expose worker port
EXPOSE 8787

# Default command - run with wrangler dev for local development
CMD ["npx", "wrangler", "dev", "--local", "--port", "8787", "--host", "0.0.0.0"]
