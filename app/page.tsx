export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <h1 className="text-2xl font-semibold">PR 管理器</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        粘贴 GitHub 仓库或 PR 链接，生成结构化审查报告。
      </p>
    </main>
  );
}
