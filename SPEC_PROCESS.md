# SPEC_PROCESS.md

## 背景

本项目从一个空 Git 仓库开始，目标是设计并规划一个 Web 端 PR 管理器。用户希望：粘贴 GitHub 链接后选择或直达某个 PR，通过 API 接入的 LLM 分析该 PR，并在网页中渲染 Markdown 格式的分析结果。结果需要覆盖核心功能、代码与描述是否一致、代码是否符合仓库规范、潜在问题等，并为每个维度与总体可接受程度评分。模型还需要根据用户需求生成可用于 PR 的自动评价。

对话中使用了 Superpowers 的两个流程：

- `superpowers:brainstorming`：用于从原始想法收敛成设计规格。
- `superpowers:writing-plans`：用于把设计规格拆成可由 subagent 执行的任务计划。

最终产物：

- `docs/superpowers/specs/2026-06-08-pr-manager-design.md`
- `docs/superpowers/plans/2026-06-08-pr-manager-implementation.md`

## Brainstorming 关键节点

### 1. 先确认项目上下文

智能体首先检查了工作区，发现当前目录基本是空 Git 仓库，只有 `.git`，当前 `master` 分支没有历史提交。这影响了后续判断：不需要兼容既有代码风格，可以从零设计 Next.js 项目结构。

这个节点的价值是避免一上来假设已有前端或后端框架。

### 2. 询问是否使用可视化 companion

因为项目涉及 Web UI，智能体按 brainstorming 流程询问是否需要浏览器可视化辅助。用户选择了 `no`。

处理决策：后续全部采用纯文字讨论，没有做 UI mockup 或浏览器演示。

### 3. 逐步缩小产品范围

智能体连续追问了一组范围问题：

- 第一版更偏单用户本地工具、多用户 Web 应用，还是演示型 MVP？
- 用户输入仓库链接、PR 链接，还是两者都支持？
- LLM 分析需要轻量上下文、标准上下文，还是深度上下文？
- 自动评价只在网页里生成，还是发布到 GitHub 评论，还是支持行级评论？
- LLM 接入固定某一家服务，还是 OpenAI-compatible API？
- 技术栈选 Next.js、React + FastAPI，还是 Vue + Node？
- token 和 API key 存在浏览器、本地 `.env`，还是两者结合？
- 评分报告固定维度、自定义需求，还是完全自定义 rubric？
- 报告和自动评价默认中文、英文，还是跟随 PR 语言？

用户选择的关键结果：

- 单用户本地工具。
- 仓库链接和 PR 链接都支持。
- 标准上下文。
- 用户确认后发布一条 GitHub PR 总体评论。
- OpenAI-compatible API。
- Next.js 全栈应用。
- 密钥存在浏览器 localStorage。
- 固定维度评分。
- 报告和 GitHub 评论默认英文。

这些问题让最初较宽泛的“Web 端 PR 管理器”变成了一个边界清楚的本地 MVP。

### 4. 比较 3 种方案

智能体提出了 3 个方案：

- Lean Local Reviewer
- Local Reviewer With Analysis History
- GitHub App Style Foundation

智能体推荐 `Lean Local Reviewer`，理由是最贴合前面确认的本地单用户、低复杂度、先跑通核心闭环的方向。用户选择了方案 1。

处理决策：第一版排除账号系统、GitHub App/OAuth、服务端数据库、行级评论、多用户协作。

### 5. 分段确认设计

智能体随后分段提交设计并逐段征求确认：

- Product Flow
- Architecture
- Data Flow and Analysis Contract
- Error Handling and Limits
- UI and Testing

用户均确认“对的”。此时原本可以进入设计文档生成，但用户补充了更严格的设计文档要求。

### 6. 用户补充完整 spec 章节要求

用户要求设计文档必须包括：

- 问题陈述
- 用户故事
- 功能规约
- 非功能性需求
- 系统架构
- 数据模型
- API 设计
- 技术选型与 Open Design 选择
- 验收标准
- 风险与未决问题

处理决策：智能体没有直接写文档，而是重新进入 focused clarification，继续追问缺失信息。

### 7. 第二轮细化设计文档

智能体继续追问：

- 主要目标用户是谁？
- 为什么值得做的核心价值是什么？
- Open Design skill 和 design system 选什么？
- 标准上下文文件抓取范围如何定义？
- 性能目标是否设定具体秒数？
- 是否保存分析历史？
- 历史记录保存范围和清理策略？
- 是否正式支持私有仓库？
- UI 本身使用什么语言？

用户最终确定：

- 目标用户是个人开发者/学生。
- 价值主张是学习和辅助审查为主，同时提高 PR 初筛效率并生成英文 review。
- Open Design 采用 `dashboard + vercel`。
- 上下文按仓库语言自动扩展。
- 中小型 PR 60 秒内返回分析。
- 历史记录全部保存在本地。
- 历史记录无限保存，用户手动删除/清空。
- 正式支持公开和私有仓库。
- UI 用中文，报告和 GitHub 评论用英文。

## 至少 3 轮关键迭代

### 迭代 1：从“大而全 PR 管理器”收敛到本地单用户工具

对话节选：

> 智能体：你希望这个项目的第一版更偏哪种形态？A. 单用户本地工具；B. 多用户 Web 应用；C. 演示型 MVP。
>
> 用户：A

处理决策：

选择 `单用户本地工具` 后，系统设计不再引入账号、团队空间、OAuth、服务端数据库和权限管理。这个选择让第一版聚焦在最核心链路：输入 GitHub 链接、获取 PR、调用 LLM、生成报告、确认后发评论。

影响：

后续密钥存储、部署方式、数据模型和风险说明都围绕本地工具展开。

### 迭代 2：从“自动评价”明确为“确认后发布总体评论”

对话节选：

> 智能体：自动评价生成想要落到哪里？A. 只在网页里生成 Review 文案；B. 可选发布为 GitHub PR 评论；C. 可选发布总体评论 + 行级评论。
>
> 用户：B

处理决策：

选择 B 后，第一版实现 GitHub 总体评论发布，但不做行级评论。评论发布需要显式确认，失败时保留草稿。

影响：

API 设计中加入 `POST /api/github/comment`。风险章节加入“防止误发、重复发”。验收标准要求“只在用户确认后发布一条总体评论”。

### 迭代 3：从普通设计说明升级为正式 spec

对话节选：

> 用户：对的，但是设计文档还要有：问题陈述、用户故事、功能规约、非功能性需求、系统架构、数据模型、API 设计、技术选型与 Open Design、验收标准、风险与未决问题。所以我们还需要继续探讨。

处理决策：

用户没有接受较简略的设计说明，而是提出了结构化 spec 要求。智能体随后查阅 Open Design 信息，并继续追问目标用户、价值主张、设计系统、上下文抓取、性能目标、历史记录、私有仓库、UI 语言等问题。

影响：

最终 spec 更完整，能直接支持后续 implementation plan，而不是只有产品流程描述。

### 迭代 4：Open Design 选择从 AI 推荐改为用户修正

对话节选：

> 智能体：我建议采用 Open Design skill: dashboard + design system: linear-app。
>
> 用户：C
>
> 智能体：好，设计文档里采用 Open Design skill: dashboard + design system: vercel。

处理决策：

智能体最初推荐 `linear-app`，理由是 Linear 适合开发者效率工具。用户选择了 `vercel`。最终文档采用 `dashboard + vercel`，理由调整为 Vercel 风格更偏开发平台、简洁、低干扰，适合 PR 元数据、评分、Markdown 报告和状态流。

影响：

计划中的 UI 方向明确为 Vercel-style dashboard：克制、工程化、信息密度适中，不做 landing page。

## AI 提出并被采纳的建议

### 1. 采用 Lean Local Reviewer

AI 建议第一版采用 Lean Local Reviewer，而不是加历史数据库或 GitHub App 基础设施。用户选择了方案 1。

采纳原因：

这个方案最符合本地单用户、快速跑通闭环的目标。

### 2. Next.js 全栈应用

AI 提供了 Next.js、React + FastAPI、Vue + Express 三个技术栈选项。用户选择 Next.js。

采纳原因：

Next.js 可以把页面和 API routes 放在一个项目里，适合本地工具和 MVP。

### 3. 标准上下文而非深度上下文

AI 将 LLM 上下文拆成轻量、标准、深度三个层次。用户选择标准上下文。

采纳原因：

标准上下文兼顾质量和复杂度。它比只看 diff 更适合判断仓库规范，又避免了调用链、历史相似 PR 等深度检索复杂度。

### 4. 评论发布前必须确认

AI 在设计中强调“不自动发布”，用户认可。

采纳原因：

AI 生成的 review 可能有误，需要用户最终把关，尤其是评论会写入 GitHub。

### 5. IndexedDB 保存完整历史

在用户表示历史“全部保存在本地”后，AI 建议完整报告用 IndexedDB，而 localStorage 继续保存配置。

采纳原因：

完整 Markdown 报告和分析记录可能较大，IndexedDB 比 localStorage 更适合保存大量本地数据。

## 用户推翻或修正的建议

### 1. 拒绝可视化 companion

AI 询问是否使用浏览器可视化辅助，用户回答 `no`。

原因：

本轮主要目标是 spec 和 plan，不需要视觉 mockup。纯文字讨论足够。

### 2. 修正 Open Design 系统选择

AI 推荐 `dashboard + linear-app`，用户选择了 `dashboard + vercel`。

原因：

用户更倾向 Vercel 式的开发者平台风格，而不是 Linear 的任务管理风格。

### 3. 要求继续探讨并扩展 spec 结构

AI 已经分段确认了设计，准备写文档。用户指出设计文档还必须包含 10 类内容。

原因：

用户需要的是更完整、可交给智能体执行的工程规格，而不是只描述产品流程和架构。

### 4. 历史记录策略改为无限本地保存

AI 给出最近 10 条、最近 30 条、只保存摘要等选项。用户回答“全部保存在本地”，随后选择无限保存、手动删除。

原因：

用户希望本地工具保留完整使用痕迹，不接受自动裁剪历史记录。

## Plan 生成过程

在 spec 提交后，用户显式要求使用 `superpowers:writing-plans` 生成任务列表，并要求：

- 每个 task 颗粒度足够细，可由一个 subagent 在一次会话内完成。
- 每个 task 包含目标、涉及文件、预期实现要点、验证步骤。
- 验证步骤包括将要写的失败测试。
- 显式标出 task 之间依赖与可并行部分，方便 worktree 并行实现。

智能体生成了 `docs/superpowers/plans/2026-06-08-pr-manager-implementation.md`，拆为 12 个任务：

1. Scaffold Next.js Project and Test Harness
2. Shared Domain Types, API Errors, and Report Schema
3. GitHub URL Parser and Parse API
4. GitHub Client, PR Routes, and Comment Publishing
5. OpenAI-Compatible LLM Client and Prompt Contract
6. Language-Aware Context Collector and Truncation
7. Browser Configuration and IndexedDB History Storage
8. Analyze API Orchestration
9. Chinese Dashboard Shell, Settings, Link Input, and History Panel
10. PR Selection and Analysis Flow UI
11. Report Rendering, Review Draft Publishing, and History Save
12. Mocked End-to-End Test, Documentation, and Final Verification

计划中显式给出了依赖图和并行组：

- Task 1 必须先做。
- Task 4、Task 5、Task 7 可在 Task 2/3 后并行。
- Task 6 依赖 Task 4。
- Task 8 依赖 Task 5/6。
- UI 任务可在后端 API 任务期间用 mock 数据并行推进。

## 冷启动验证与反馈补充

本轮 spec 与 plan 的主要生成者是 `codex：gpt-5.5-high`。设计规格 `docs/superpowers/specs/2026-06-08-pr-manager-design.md` 和实现计划 `docs/superpowers/plans/2026-06-08-pr-manager-implementation.md` 均由 `codex：gpt-5.5-high` 在 Superpowers 的 `brainstorming` 与 `writing-plans` 流程下完成。

随后进行了冷启动验证。用户让 `antigravity：gemini-3.5-flash-high` 从零开始执行实现计划中的 Task 1 和 Task 2。该模型完成了 Task 1 与 Task 2，没有提出额外问题。这说明脚手架任务和共享契约任务的计划粒度基本可执行，至少对一个冷启动智能体而言，任务目标、文件范围、测试步骤和提交边界足够明确。

之后，用户又让 `antigravity：gemini-3.5-flash-high` 试图继续完成其他 task。此时它提出了一组问题和风险点，这些问题被整理在 `specs_and_plans_review.md` 中。主要反馈包括：

- Next.js App Router 与 React 的 SSR/hydration 风险：不能在初始 render 中直接读取 localStorage 或 IndexedDB。
- Context truncation 不能简单拼接后 slice，需要按优先级和 per-file budget 分配。
- Design spec 中的 open questions 需要在进入实现前关闭。
- OpenAI-compatible API 的 `response_format` 并非所有 provider 都支持，需要 fallback。
- Vitest 中 IndexedDB 需要 `fake-indexeddb/auto`。
- Markdown 渲染需要避免 raw HTML/XSS。
- API routes 应明确 `dynamic = "force-dynamic"`，并统一做错误脱敏。

处理决策：

用户把这份反馈交回给 `codex：gpt-5.5-high`，要求根据反馈文件修改文档内容。`codex：gpt-5.5-high` 没有把反馈文件本身并入正式文档，而是修改了已有 spec 和 plan：

- 在 spec 中补充 mounted 后读取浏览器存储的约束，避免 SSR crash 和 hydration mismatch。
- 在 spec 和 plan 中明确 `120000` 字符上下文预算、patch/context 文件 per-file limit、截断标记和避免大文件饿死其他上下文。
- 将原来的 open questions 改为 resolved decisions：推荐模型示例、history export/import 延后、上下文预算固定、overall score 由模型生成但必须解释。
- 在 plan 中补充 LLM `response_format` fallback 的失败测试。
- 在 Task 1 中补充 `fake-indexeddb/auto` 测试环境要求。
- 在 Task 11 中补充 Markdown raw HTML 不渲染的安全要求与测试。
- 在 API route 相关 task 中补充 `dynamic = "force-dynamic"` 和统一 redacted error handling。

这次验证暴露出一个事实：原计划对“功能怎么做”已经足够细，但对现代 Next.js、LLM provider 兼容性、测试环境 polyfill 和 XSS 这类执行期陷阱描述还不够硬。`antigravity：gemini-3.5-flash-high` 的冷启动尝试起到了外部审稿作用，`codex：gpt-5.5-high` 则负责把这些问题沉淀回正式 spec 和 plan。

随后，用户让 `antigravity：claude-sonnet-4.6-thinking` 执行 Task 3 和 Task 6。该模型提出了一个计划结构层面的澄清问题：plan 没有明确指定 Next.js 项目应该放在仓库根目录 `D:\AI4SE_PROJECT\`，还是另建一个子目录，例如 `D:\AI4SE_PROJECT\app\`。这个问题成立，因为 plan 中大量路径使用 `app/`，而 `app/` 在 Next.js 中既可能被误解为项目目录，也可能是 App Router 的路由目录。

处理决策：`codex：gpt-5.5-high` 明确项目根目录应为 `D:\AI4SE_PROJECT`，`app/` 只是该根项目下的 Next.js App Router 目录，不应创建嵌套项目 `D:\AI4SE_PROJECT\app\package.json`。随后将该约定补入 implementation plan 的 `Project Root` 小节，作为后续 subagent 执行 Task 3、Task 6 以及其他任务时的统一路径基准。

## 对 Superpowers brainstorming 的反思

### 做得好的地方

1. **强制先问边界，避免过早写代码**

一开始项目很容易被做成“大而全”的 GitHub review 平台。Brainstorming 流程通过连续追问，把范围收敛到本地单用户 MVP。

2. **问题拆得比较好回答**

多数问题是 A/B/C/D 选择题，例如应用形态、链接类型、上下文深度、评论发布方式、技术栈、存储策略。这让用户可以快速决策，而不是被迫写长篇需求。

3. **设计分段确认降低返工**

Product Flow、Architecture、Data Flow、Error Handling、UI and Testing 分段确认，让用户可以逐段纠偏。后面用户补充 10 项文档要求时，也能基于已有共识继续扩展。

4. **把隐性风险显性化**

流程中明确讨论了密钥存储、私有仓库权限、LLM 输出格式、上下文截断、发布评论确认、历史记录容量等风险。这些都进入了最终 spec。

5. **能自然转入 implementation plan**

Brainstorming 产出的 spec 足够结构化，后续 writing-plans 能直接拆任务、写失败测试、标依赖。

### 让人不满或可以改进的地方

1. **流程偏长**

对于一个用户已经有清晰方向的项目，brainstorming 的问题轮数较多。虽然结果更稳，但过程会显得慢。

2. **视觉 companion 的询问有些打断**

项目确实涉及 Web UI，所以询问是合理的；但本轮主要是 spec，不是视觉设计。这个问题对当前目标帮助有限。

3. **一开始的设计文档不够完整**

智能体先按常规设计流程确认了产品、架构、数据流、错误处理和测试，但没有主动包含用户后来要求的 10 个完整 spec 章节。是用户补充要求后，文档才升级为正式规格。

4. **Open Design 推荐需要用户校正**

AI 推荐了 `linear-app`，但用户选择了 `vercel`。这说明设计系统选择并非纯技术判断，还涉及用户对产品气质的偏好，需要更早询问而不是直接推荐。

5. **writing-plans 生成初稿时出现过可执行性瑕疵**

计划初稿里曾有一处测试片段写得不干净，后续通过自审修掉。这说明长计划文档容易混入不适合直接执行的内容，自审扫描很必要。

## 结论

这次 Superpowers 协作的主要价值在于：把一个初始想法逐步变成了有边界、有技术选型、有 API 和数据模型、有验收标准、有风险说明的 spec，并进一步拆成了可并行执行的 implementation plan。

用户最关键的贡献是持续修正范围和规格质量：选择本地单用户路线、拒绝不必要的视觉辅助、要求补齐正式 spec 章节、修正 Open Design 选择、坚持完整本地历史。智能体最有价值的贡献是把这些选择组织成工程化结构，并把后续实现拆成可测试、可并行的任务。
