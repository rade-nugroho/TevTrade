"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  ListOrdered,
  MessageSquare,
  ArrowLeftRight,
  Shuffle,
  Workflow,
} from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const focus =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";

const transition =
  "transition-[background-color,border-color,color,opacity] duration-150 ease-out";

/**
 * Sidebar rail item for desk navigation.
 */
export type AppSidebar2Item = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

/**
 * Props for the TevTrade desk sidebar rail.
 */
export type AppSidebar2Props = {
  readonly items?: readonly AppSidebar2Item[];
  readonly currentId: string;
  readonly onNavigate: (id: string) => void;
  readonly brandMark?: string;
};

/**
 * Default desk views used when the parent does not pass items.
 */
export const DESK_SIDEBAR_ITEMS: readonly AppSidebar2Item[] = [
  { id: "decision", label: "Decision", icon: MessageSquare },
  { id: "automation", label: "Automation", icon: Workflow },
  { id: "quote", label: "Quote", icon: ArrowLeftRight },
  { id: "bridge", label: "Bridge", icon: Shuffle },
  { id: "orders", label: "Orders", icon: ListOrdered },
  { id: "desk", label: "Desk", icon: Briefcase },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

/**
 * Icon rail sidebar for TevTrade. Navigation is sidebar-only; no SaaS demo chrome.
 */
export default function AppSidebar2({
  items = DESK_SIDEBAR_ITEMS,
  currentId,
  onNavigate,
  brandMark = "T",
}: AppSidebar2Props) {
  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r border-neutral-200/70 bg-neutral-50 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-sm font-medium text-[var(--rb-accent-fg,oklch(100%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]"
      >
        {brandMark}
      </span>

      <nav aria-label="Desk" className="mt-4 flex flex-1 flex-col items-center gap-1">
        <ul className="flex flex-col items-center gap-1" role="list">
          {items.map((item) => {
            const Icon = item.icon;
            const current = item.id === currentId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={item.label}
                  aria-current={current ? "page" : undefined}
                  title={item.label}
                  onClick={() => onNavigate(item.id)}
                  className={cx(
                    "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-[var(--rb-r-lg,10px)] active:bg-neutral-200 dark:active:bg-neutral-700",
                    current
                      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                      : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
                    transition,
                    focus,
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
