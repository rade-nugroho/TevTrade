"use client";

import { useState } from "react";
import AiChat1 from "@/components/ai-chat-1";
import AppSidebar2, { DESK_SIDEBAR_ITEMS } from "@/components/blocks/app-sidebar-2";
import { BridgeView } from "@/components/blocks/bridge-view";
import { DeskAnalytics } from "@/components/blocks/desk-analytics";
import { DeskBook } from "@/components/blocks/desk-book";
import { SwapQuote } from "@/components/blocks/swap-quote";
import { TitanDirectQuote } from "@/components/blocks/titan-direct-quote";
import { TitanOrders } from "@/components/blocks/titan-orders";
import { TradeAutomation } from "@/components/blocks/trade-automation";
import { WalletPanel } from "@/components/blocks/wallet-panel";

/**
 * View id for the desk navigation.
 */
type ViewId = (typeof DESK_SIDEBAR_ITEMS)[number]["id"];

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
          {view === "automation" ? <TradeAutomation /> : null}
          {view === "quote" ? (
            <>
              <SwapQuote />
              <TitanDirectQuote />
            </>
          ) : null}
          {view === "bridge" ? <BridgeView /> : null}
          {view === "orders" ? <TitanOrders /> : null}
          {view === "desk" ? <DeskBook /> : null}
          {view === "analytics" ? <DeskAnalytics /> : null}
        </main>
      </div>
    </div>
  );
}
