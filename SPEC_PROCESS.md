# SPEC_PROCESS.md

## 背景

本项目从空 Git 仓库开始，目标是设计本地优先的 Web PR 管理器：用户粘贴 GitHub 仓库或 PR 链接，通过 OpenAI-compatible LLM 分析改动，渲染英文 Markdown 审查报告，并可确认后发布一条 GitHub PR 总体评论。

本轮 spec 与 plan 主要由 `codex：gpt-5.5-high` 完成，使用了 Superpowers 的 `brainstorming` 和 `writing-plans`。最终文档为：

- `docs/superpowers/specs/2026-06-08-pr-manager-design.md`
- `docs/superpowers/plans/2026-06-08-pr-manager-implementation.md`

## Brainstorming 过程

智能体先确认仓库为空，无需兼容既有框架；又询问可视化 companion，用户选择 `no`。关键追问覆盖第一版形态、链接入口、LLM 上下文、自动评价、模型接入、技术栈、密钥保存、评分结构和语言。用户确定：单用户本地工具；仓库/PR 链接都支持；标准上下文；确认后发布总体评论；OpenAI-compatible API；Next.js 全栈；密钥存 localStorage；固定维度评分；报告和评论英文。

智能体提出 3 个方案，用户选 Lean Local Reviewer，排除账号、OAuth、GitHub App、服务端数据库、行级评论和多用户协作。之后用户要求 spec 包含 10 类正式章节；智能体继续追问目标用户、价值、Open Design、上下文、性能、历史、私有仓库和 UI 语言。最终确定：目标用户是个人开发者/学生；Open Design 为 `dashboard + vercel`；上下文按语言扩展；中小 PR 60 秒内返回；历史全本地保存且手动清理；支持公开/私有仓库；UI 中文，报告英文。

## 关键迭代

1. **收敛到本地单用户工具**：不引入账号、团队、OAuth、数据库和权限体系，核心变为“输入链接 -> 获取 PR -> LLM 分析 -> 生成报告 -> 确认后评论”。
2. **自动评价改为确认后发布总体评论**：只发一条总体评论，不做行级评论；发布必须显式确认，失败保留草稿。
3. **正式 spec**：用户补充 10 类必需章节，使文档从流程描述变成工程规格。
4. **Open Design 修正**：AI 推荐 `dashboard + linear-app`，用户选择 `dashboard + vercel`。

## 采纳与修正

用户采纳了 Lean Local Reviewer、Next.js、标准上下文、发布前确认、IndexedDB 完整历史；修正了可视化 companion、Open Design、简略 spec 和历史数量限制，要求历史无限本地保存、手动删除。

## Plan 生成

在 spec 后，用户要求用 `superpowers:writing-plans` 生成可由 subagent 一次完成的任务，包含目标、文件、实现要点、失败测试、验证、依赖和并行关系。Codex 将实现拆为 12 个任务：脚手架、共享契约、URL parser、GitHub routes、LLM client、context collector、storage、analyze API、dashboard shell、PR flow、report/comment、E2E/docs；Task 1 先行，Task 4/5/7 可并行，Task 6 依赖 Task 4，Task 8 依赖 Task 5/6。

## 冷启动验证与反馈

`antigravity：gemini-3.5-flash-high` 冷启动执行 Task 1/2，完成且未提问，说明脚手架和共享契约粒度基本可执行。随后它尝试其他任务并在 `specs_and_plans_review.md` 中提出：SSR/hydration 不能初始读 storage；context 不能简单 slice；open questions 需关闭；`response_format` 需 fallback；Vitest 需 `fake-indexeddb/auto`；Markdown 防 XSS；API routes 需 `force-dynamic` 和错误脱敏。Codex 已补入 spec/plan。

`antigravity：claude-sonnet-4.6-thinking` 执行 Task 3/6 时指出项目根目录不清。Codex 明确根目录为 `D:\AI4SE_PROJECT`，`app/` 只是 App Router 目录，并补入 plan。随后 Claude 冷启动实现被删除：Codex 回滚 `db45f9a` 并清理产物。Claude 又指出：`pull-detail` 混入 context、GitHub token scope 缺失、Task 4 缺测试、Task 6 fake client 不完整、Task 9 缺 mounted 后加载测试、语言值/kind/overall rationale/重复发布/sourceReportId/状态机/history save/prompt 职责不清。Codex 修订为：`pull-detail` 只返回 `{ pullRequest }`，context 归 `/api/analyze`；补 token scope、canonical languages、kind 映射、`overallRationale`、前端-only 防重复、测试骨架、状态机、history save 和 prompt 转换职责。

## 反思

做得好的地方：先澄清边界；问题多为选择题；分段确认减少返工；能把隐性风险显性化；spec 能转成可并行、可测试的 plan。

不满点：流程偏长；可视化 companion 帮助有限；初始设计未主动覆盖 10 类 spec 章节；Open Design 推荐需修正；长 plan 易有可执行性瑕疵，必须靠冷启动验证补强。

总体看，本次协作把宽泛想法变成有边界、有 API、有数据模型、有验收标准、有风险处理和可并行任务的工程规格。用户校正目标；Codex 沉淀结构；Gemini 与 Claude 暴露执行盲点，再由 Codex 回填。
