# Containerization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production Docker packaging, Docker Compose, Docker Hub publishing CI, and README instructions for `121mc/pr-manager`.

**Architecture:** Use Next.js standalone output for a small runtime image. Keep the application as a single containerized service on port `3000`. CI builds the image for every PR/push and only pushes to Docker Hub from `master`.

**Tech Stack:** Next.js, Node.js, Docker, Docker Compose, GitHub Actions, Docker Buildx.

---

### File Structure

- Create: `Dockerfile` - multi-stage production build and runtime image.
- Create: `.dockerignore` - minimized and safe Docker build context.
- Create: `docker-compose.yml` - local one-service Compose entrypoint.
- Create: `.github/workflows/docker-image.yml` - CI image build and Docker Hub push.
- Modify: `next.config.ts` - enable Next.js standalone output.
- Modify: `package-lock.json` - keep `npm ci` compatible with the npm version in the Node container image.
- Modify: `README.md` - document local Docker commands, published image address, port, and environment variables.

### Task 1: Docker Build Context

- [ ] **Step 1: Create `.dockerignore`**

Create a Docker ignore file with:

```dockerignore
.git
.github
.next
.worktrees
coverage
dist
docs/superpowers
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
*.tsbuildinfo
.env
.env.*
!.env.example
Dockerfile
docker-compose.yml
```

- [ ] **Step 2: Review context exclusions**

Run: `Get-Content .dockerignore`

Expected: the file excludes local dependencies, build output, git metadata, worktrees, logs, and env files.

### Task 2: Next.js Standalone Image

- [ ] **Step 1: Enable standalone output**

Modify `next.config.ts` so `nextConfig` includes:

```ts
output: "standalone",
```

- [ ] **Step 2: Create `Dockerfile`**

Create:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
```

- [ ] **Step 3: Adjust for missing `public` directory**

If the repository has no `public` directory, remove the `COPY --from=builder /app/public ./public` line so Docker builds successfully.

### Task 3: Container Lockfile Compatibility

- [ ] **Step 1: Reproduce lockfile compatibility with container npm**

Run:

```powershell
docker run --rm -v ${PWD}:/app -w /app node:24-alpine npm ci --dry-run
```

Expected before the lockfile refresh: npm may fail if the existing lockfile is missing platform-specific optional peer package entries required by the npm version bundled in `node:24-alpine`.

- [ ] **Step 2: Refresh only the lockfile**

Run:

```powershell
docker run --rm -v ${PWD}:/app -w /app node:24-alpine npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

Expected: `package-lock.json` is updated; `package.json` is unchanged.

- [ ] **Step 3: Verify container npm can read the lockfile**

Run:

```powershell
docker run --rm -v ${PWD}:/app -w /app node:24-alpine npm ci --dry-run
```

Expected: command exits with code `0`.

### Task 4: Compose Entrypoint

- [ ] **Step 1: Create `docker-compose.yml`**

Create:

```yaml
services:
  pr-manager:
    image: 121mc/pr-manager:local
    build:
      context: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      NEXT_TELEMETRY_DISABLED: "1"
    restart: unless-stopped
```

- [ ] **Step 2: Validate Compose syntax**

Run: `docker compose config`

Expected: config renders one `pr-manager` service with port `3000:3000`.

### Task 5: Docker Hub CI

- [ ] **Step 1: Create `.github/workflows/docker-image.yml`**

Create a workflow that:

```yaml
name: Docker Image

on:
  pull_request:
  push:
    branches:
      - master

env:
  IMAGE_NAME: 121mc/pr-manager

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        if: github.event_name == 'push' && github.ref == 'refs/heads/master'
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name == 'push' && github.ref == 'refs/heads/master' }}
          tags: |
            ${{ env.IMAGE_NAME }}:latest
            ${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Validate workflow file exists**

Run: `Get-Content .github/workflows/docker-image.yml`

Expected: workflow includes Docker Buildx and Docker Hub login before push.

### Task 6: README Documentation

- [ ] **Step 1: Add Docker instructions**

Add commands:

```powershell
docker build -t 121mc/pr-manager:local .
docker run --rm -p 3000:3000 121mc/pr-manager:local
```

Add published image command:

```powershell
docker run --rm -p 3000:3000 121mc/pr-manager:latest
```

Document port `3000`, optional `PORT` and `NEXT_TELEMETRY_DISABLED`, and Docker Hub secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

### Task 7: Verification

- [ ] **Step 1: Run app checks**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: every command exits with code `0`.

- [ ] **Step 2: Build Docker image**

Run: `docker build -t 121mc/pr-manager:local .`

Expected: image builds successfully.

- [ ] **Step 3: Run Docker image**

Run: `docker run --rm -p 3000:3000 121mc/pr-manager:local`

Expected: Next.js server listens on `0.0.0.0:3000`.

- [ ] **Step 4: Check health endpoint**

Run: `Invoke-RestMethod http://localhost:3000/api/health`

Expected:

```json
{
  "ok": true
}
```
