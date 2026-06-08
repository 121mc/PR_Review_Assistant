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
