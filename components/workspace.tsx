"use client";

import { useState } from "react";
import AiChat1 from "@/components/ai-chat-1";
import AppSidebar2, { DESK_SIDEBAR_ITEMS } from "@/components/blocks/app-sidebar-2";
import { SwapQuote } from "@/components/blocks/swap-quote";
import { TitanDirectQuote } from "@/components/blocks/titan-direct-quote";
import { TitanOrders } from "@/components/blocks/titan-orders";
import { WalletPanel } from "@/components/blocks/wallet-panel";

/**
 * View id for the desk navigation.
 */
type ViewId = (typeof DESK_SIDEBAR_ITEMS)[number]["id"];

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
 * TevTrade workspace. Sidebar owns navigation; the header keeps brand and wallet.
 */
export function Workspace() {
  const [view, setView] = useState<ViewId>("decision");

  return (
    <div className="flex h-dvh min-h-0 bg-white dark:bg-neutral-950">
      <AppSidebar2
        items={DESK_SIDEBAR_ITEMS}
        currentId={view}
        onNavigate={(id) => setView(id as ViewId)}
        brandMark="T"
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-200/70 px-4 dark:border-neutral-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              TevTrade
            </p>
            <p className="truncate text-xs text-neutral-500">Local decision model</p>
          </div>
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
    </div>
  );
}
