export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8f7f2] text-neutral-950">
      <section className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            GitHub Review Workspace
          </p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-6xl">PR 管理器</h1>
          <p className="mt-6 text-lg leading-8 text-neutral-700">
            粘贴 GitHub 仓库或 PR 链接，生成结构化审查报告。
          </p>
        </div>
      </section>
    </main>
  );
}
