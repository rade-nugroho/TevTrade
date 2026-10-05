"use client";

import { useState } from "react";
import AiChat1 from "@/components/ai-chat-1";
import AppShell1 from "@/components/app-shell-1";
import AppSidebar1 from "@/components/app-sidebar-1";
import Analytics13 from "@/components/blocks/analytics-13";
import Analytics14 from "@/components/blocks/analytics-14";
import Analytics2 from "@/components/blocks/analytics-2";
import { SwapQuote } from "@/components/blocks/swap-quote";
import { WalletPanel } from "@/components/blocks/wallet-panel";
import Dashboard1 from "@/components/dashboard-1";
import DataTable1 from "@/components/data-table-1";

const VIEWS = [
  { id: "decision", label: "Decision" },
  { id: "quote", label: "Quote" },
  { id: "desk", label: "Desk" },
  { id: "ledger", label: "Ledger" },
  { id: "analytics", label: "Analytics" },
  { id: "operations", label: "Operations" },
  { id: "sidebar", label: "Sidebar" },
] as const;

/**
 * View id for the desk navigation.
 */
type ViewId = (typeof VIEWS)[number]["id"];

/**
 * TevTrade workspace. The header holds the wallet. The nav switches the existing blocks.
 */
export function Workspace() {
  const [view, setView] = useState<ViewId>("decision");

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-white dark:bg-neutral-950">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-200/70 px-4 dark:border-neutral-800">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">TevTrade</p>
          <p className="truncate text-xs text-neutral-500">Local decision model</p>
        </div>
        <nav aria-label="Desk" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {VIEWS.map((item) => {
            const current = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => setView(item.id)}
                className={
                  current
                    ? "h-8 shrink-0 rounded-[var(--rb-r-md,8px)] bg-neutral-100 px-3 text-[13px] font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    : "h-8 shrink-0 rounded-[var(--rb-r-md,8px)] px-3 text-[13px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <WalletPanel />
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {view === "decision" ? <AiChat1 /> : null}
        {view === "quote" ? <SwapQuote /> : null}
        {view === "desk" ? <Dashboard1 /> : null}
        {view === "ledger" ? <DataTable1 /> : null}
        {view === "analytics" ? (
          <div className="flex flex-col gap-8 p-4 sm:p-6">
            <Analytics2 />
            <Analytics13 />
            <Analytics14 />
          </div>
        ) : null}
        {view === "operations" ? <AppShell1 /> : null}
        {view === "sidebar" ? <AppSidebar1 /> : null}
      </main>
    </div>
  );
}
