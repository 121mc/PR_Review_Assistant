import { HistoryPanel } from "../components/HistoryPanel";
import { LinkInput } from "../components/LinkInput";
import { SettingsPanel } from "../components/SettingsPanel";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-rows-[auto_1fr]">
        <header className="border-b border-neutral-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">PR 管理器</h1>
              <p className="mt-1 text-sm text-neutral-500">本地审查工作台</p>
            </div>
            <div className="text-xs text-neutral-500">本地配置</div>
          </div>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            <SettingsPanel />
            <LinkInput />
            <section aria-labelledby="status-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
              <h2 className="text-sm font-semibold text-neutral-950" id="status-heading">
                状态
              </h2>
              <div className="mt-4 grid divide-y divide-neutral-200 border-y border-neutral-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="py-3 sm:pr-4">
                  <p className="text-xs text-neutral-500">仓库状态</p>
                  <p className="mt-1 text-sm font-medium text-neutral-950">待加载链接</p>
                </div>
                <div className="py-3 sm:pl-4">
                  <p className="text-xs text-neutral-500">报告状态</p>
                  <p className="mt-1 text-sm font-medium text-neutral-950">待生成报告</p>
                </div>
              </div>
            </section>
          </div>

          <aside>
            <HistoryPanel />
          </aside>
        </div>
      </div>
    </main>
  );
}
