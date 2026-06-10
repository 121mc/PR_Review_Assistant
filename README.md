# Web PR Manager

Local-first PR review assistant for personal developers and students. Paste a GitHub repository or pull request URL, choose a PR, and generate a structured English review report from the Chinese UI.

## Run Locally

```powershell
npm install
npm run dev
```

Open http://localhost:3000.

Useful checks:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## Run With Docker

Build the image:

```powershell
docker build -t 121mc/pr-manager:local .
```

Start the app:

```powershell
docker run --rm -p 3000:3000 121mc/pr-manager:local
```

Open http://localhost:3000.

You can also run the Compose service:

```powershell
docker compose up --build
```

Docker Hub image address:

[121mc/pr-manager](https://hub.docker.com/r/121mc/pr-manager)

After the first successful CI push, run the public image with:

```powershell
docker run --rm -p 3000:3000 121mc/pr-manager:latest
```

## Ports And Environment Variables

The container listens on port `3000` by default. Map it with `-p 3000:3000` or set a different container port with `PORT`.

Runtime environment variables:

- `PORT`: optional Next.js server port inside the container. Default: `3000`.
- `HOSTNAME`: optional bind address inside the container. Default: `0.0.0.0`.
- `NEXT_TELEMETRY_DISABLED`: optional Next.js telemetry flag. Default in the image: `1`.

No GitHub or LLM secrets are required as server environment variables. Enter GitHub and OpenAI-compatible LLM credentials in the app settings panel; they are stored in browser localStorage and sent only to local API routes during requests.

## Docker Hub Publishing

GitHub Actions builds the Docker image for pull requests and pushes. Pushes to `master` also publish:

- `121mc/pr-manager:latest`
- `121mc/pr-manager:<commit-sha>`

Set these repository secrets before publishing:

- `DOCKERHUB_USERNAME`: `121mc`
- `DOCKERHUB_TOKEN`: a Docker Hub access token with permission to push `121mc/pr-manager`

## Credentials

Store credentials in the settings panel. They are saved in browser localStorage and sent only to local API routes during requests.

GitHub token permissions:

- Public repositories: read access to repository contents and pull requests; comment permission is required to publish a PR comment. For classic tokens, `public_repo` is the public-only scope.
- Private repositories: access to the target private repository plus permission to create issue comments. For classic tokens, use `repo`.

OpenAI-compatible LLM settings:

- Base URL, for example `https://api.openai.com/v1`
- API key
- Model name. Start with a provider-supported fast/cost-effective model such as `gpt-4o-mini` when available, or enter any model supported by your configured provider.

## Context Budget

Version one uses a fixed `120000` character analysis context budget. Large PRs are truncated with visible per-file and report-level notices.

## Safety

Public deployment is not recommended for version one. The browser sends GitHub and LLM secrets to the app server for API requests, so run it only in a trusted local environment.

## Language

The UI is Chinese. Generated analysis reports and GitHub comments are English.
