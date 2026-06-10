# Containerization Design

## Goal

Package the Web PR Manager Next.js application as a production Docker image that can be built with one `docker build` command and started with one `docker run` command.

## Architecture

The project remains a single-service application. The container image will use a multi-stage Node.js build: install locked dependencies, build the Next.js app, and copy only the standalone runtime output into the final image. The runtime container will listen on port `3000` and expose the existing `/api/health` endpoint for health checks.

## Docker Assets

- `Dockerfile` builds the production image for `121mc/pr-manager`.
- `.dockerignore` excludes local dependencies, build output, worktrees, git metadata, logs, coverage, and environment files from the build context.
- `docker-compose.yml` defines one service named `pr-manager` and maps host port `3000` to container port `3000`.

## Runtime Configuration

The application does not require server-side environment variables for normal startup. GitHub and LLM credentials continue to be entered in the browser settings panel and stored in browser localStorage. The container will still support standard Next.js runtime variables such as `PORT` and `HOSTNAME`, with defaults of `3000` and `0.0.0.0`.

## CI And Publishing

GitHub Actions will build the Docker image on pull requests and pushes. On pushes to `master`, CI will log in to Docker Hub using `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets, then push:

- `121mc/pr-manager:latest`
- `121mc/pr-manager:<commit-sha>`

## Verification

Verification requires:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `docker build -t 121mc/pr-manager:local .`
- `docker run --rm -p 3000:3000 121mc/pr-manager:local`
- `GET http://localhost:3000/api/health` returns `{"ok":true}`
