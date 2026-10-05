"use client";

import { useState } from "react";
import AiChat1 from "@/components/ai-chat-1";
import { SwapQuote } from "@/components/blocks/swap-quote";
import { TitanDirectQuote } from "@/components/blocks/titan-direct-quote";
import { TitanOrders } from "@/components/blocks/titan-orders";
import { WalletPanel } from "@/components/blocks/wallet-panel";

const VIEWS = [
  { id: "decision", label: "Decision" },
  { id: "quote", label: "Quote" },
  { id: "orders", label: "Orders" },
  { id: "desk", label: "Desk" },
  { id: "analytics", label: "Analytics" },
] as const;

/**
 * View id for the desk navigation.
 */
type ViewId = (typeof VIEWS)[number]["id"];

/**
 * Quiet placeholder for desk surfaces that do not have live data yet.
 */
function DeskPlaceholder({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-2 p-6 sm:p-8">
      <h1 className="text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
        {title}
      </h1>
      <p className="text-[13px] leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}

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
        {view === "quote" ? (
          <>
            <SwapQuote />
            <TitanDirectQuote />
          </>
        ) : null}
        {view === "orders" ? <TitanOrders /> : null}
        {view === "desk" ? (
          <DeskPlaceholder title="Desk" body="Positions and fills will land here." />
        ) : null}
        {view === "analytics" ? (
          <DeskPlaceholder
            title="Analytics"
            body="Personal P&L and session stats will land here when wired to your book."
          />
        ) : null}
      </main>
    </div>
  );
}
