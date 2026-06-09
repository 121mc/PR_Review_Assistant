# AGENT_LOG.md

This log records the PR Review Assistant implementation process in chronological order. It is maintained as process evidence for the course requirement: every worktree task maps to a branch/PR, task prompts are recorded, human interventions are identified, and reusable lessons are captured.

## 2026-06-08T20:30:00+08:00 - Specification and plan setup

- **Triggered Superpowers skills:** `brainstorming`, `writing-plans`.
- **Key prompt / context:** Define a local-first Web PR Manager for personal developers/students, then decompose it into subagent-sized tasks with failing tests, verification commands, dependencies, and parallelization rules.
- **Subagent output:** Initial design spec `89431366` and implementation plan `f10064be`; process notes later condensed in `SPEC_PROCESS.md`.
- **Human intervention:** Codex clarified the project root as `D:\AI4SE_PROJECT`, rejected overbuilt OAuth/database features, and kept version one scoped to local secrets and one confirmed PR comment.
- **Lesson learned:** Ask scope and safety questions before implementation; a strong plan prevents subagents from inventing enterprise features.
## 2026-06-08T22:36:31+08:00 - Task 1: Scaffold Next.js project and test harness

- **Triggered Superpowers skills:** `subagent-driven-development`, `test-driven-development`, `requesting-code-review`.
- **Key prompt / context:** Create the Next.js App Router scaffold, health route, Vitest setup, Tailwind wiring, and npm scripts from PLAN Task 1.
- **Subagent output:** codex/task-1-scaffold implementation agent; Gemini cold-start feedback was used as review input; completion commit(s): `3b75b00d`, `21eb8255`; branch: `codex/task-1-scaffold`; worktree: `.worktrees/task-1-scaffold`.
- **Human intervention:** Codex reviewed scaffold output, resolved review feedback, and kept worktree directories ignored.
- **Lesson learned:** Start with a tiny health test and scripts so later subagents can verify quickly.

## 2026-06-08T23:07:38+08:00 - Task 2: Shared domain contracts, API errors, and report schema

- **Triggered Superpowers skills:** `subagent-driven-development`, `test-driven-development`, `requesting-code-review`.
- **Key prompt / context:** Implement shared report types, Zod validation, and redacted API errors for strict LLM output.
- **Subagent output:** codex/task-2-contracts implementation agent; Gemini cold-start validation informed schema constraints; completion commit(s): `58a957e5`, `a8191d6c`, `9da84ad5`; branch: `codex/task-2-contracts`; worktree: `.worktrees/task-2-contracts`.
- **Human intervention:** Codex hardened secret redaction and decoupled error helpers from Next server-only APIs.
- **Lesson learned:** Keep contracts framework-light so tests can exercise them outside App Router.

## 2026-06-08T23:28:28+08:00 - Task 3: GitHub URL parser and parse API

- **Triggered Superpowers skills:** `subagent-driven-development`, `test-driven-development`, `systematic-debugging`.
- **Key prompt / context:** Parse GitHub repository and pull-request URLs while rejecting issues, commits, unsafe numbers, and non-GitHub hosts.
- **Subagent output:** codex/task-3-url-parser implementation agent; Claude feedback clarified project root and URL boundaries; completion commit(s): `87094ee1`, `c7278628`; branch: `codex/task-3-url-parser`; worktree: `.worktrees/task-3-url-parser`.
- **Human intervention:** Codex tightened unsafe integer and zero PR-number handling after review.
- **Lesson learned:** URL parsers need explicit negative tests, not only happy-path examples.
