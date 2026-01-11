# syntax=docker/dockerfile:1

# Build stage
FROM node:25-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the project
RUN pnpm run build

# Production stage
FROM node:25-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Set build arguments
ARG VERSION=dev
ARG COMMIT_SHA=unknown

ENV NODE_ENV=production
ENV VERSION=${VERSION}
ENV COMMIT_SHA=${COMMIT_SHA}

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY core/package.json ./core/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/bin ./bin

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

USER nodejs

# Expose default port
EXPOSE 8787

# Default command
CMD ["node", "dist/index.js"]
