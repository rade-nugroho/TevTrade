"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  CheckSquare,
  ChevronDown,
  CreditCard,
  FolderKanban,
  Gauge,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeft,
  Settings,
  Users,
  X,
} from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setEdges({
      start: scrollTop > 1,
      end: Math.ceil(scrollTop + clientHeight) < scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  return { ref, edges, onScroll: update };
}

const focus =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";

const transition =
  "transition-[background-color,border-color,color,opacity] duration-150 ease-out";

const groups = [
  {
    label: "Workspace",
    items: [
      { label: "Command center", icon: LayoutGrid, badge: "8", current: true },
      { label: "Inbox", icon: Inbox, badge: "12" },
      { label: "Approvals", icon: CheckSquare, badge: "5" },
      { label: "Automations", icon: Blocks },
      { label: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Performance", icon: Gauge },
      { label: "Usage", icon: BarChart3 },
      { label: "Activity log", icon: Activity },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Members", icon: Users },
      { label: "Billing", icon: CreditCard },
      { label: "Settings", icon: Settings },
    ],
  },
];

const accountMenu = [
  { label: "Account settings", icon: Settings },
  { label: "Notifications", icon: Bell },
  { label: "Help center", icon: LifeBuoy },
  { label: "Sign out", icon: LogOut },
];

function SidebarBody({
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const [userOpen, setUserOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const nav = useScrollFade<HTMLElement>();
  const footerRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = (restoreFocus: boolean) => {
    setUserOpen(false);
    setShown(false);
    if (restoreFocus) userTriggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!userOpen) return;
    const node = footerRef.current;
    const doc = node?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => setShown(true));

    const onPointerDown = (event: Event) => {
      if (!node?.contains(event.target as Node)) closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
          [],
      );
      if (items.length === 0) return;
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[index < 0 || index === items.length - 1 ? 0 : index + 1]?.focus({
          preventScroll: true,
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[index <= 0 ? items.length - 1 : index - 1]?.focus({
          preventScroll: true,
        });
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus({ preventScroll: true });
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus({ preventScroll: true });
      }
    };

    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [userOpen]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 pl-3 pr-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-sm font-medium text-[var(--rb-accent-fg,oklch(100%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]">
          M
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
              Meridian
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-500">
              Operations
            </p>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className={cx(
              "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--rb-r-md,8px)] bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:active:bg-neutral-600",
              transition,
              focus,
            )}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <nav
          ref={nav.ref}
          onScroll={nav.onScroll}
          aria-label="Primary"
          className="h-full overflow-y-auto px-2 pb-3"
        >
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                {!collapsed && (
                  <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.label}>
                        <a
                          href="#command-center"
                          aria-current={item.current ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                          className={cx(
                            "flex h-8 cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] px-3 text-[13px] active:bg-neutral-200 dark:active:bg-neutral-700",
                            item.current
                              ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
                            collapsed && "justify-center",
                            transition,
                            focus,
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
                          />
                          {!collapsed && (
                            <>
                              <span className="min-w-0 flex-1 truncate">
                                {item.label}
                              </span>
                              {item.badge && (
                                <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-500">
                                  {item.badge}
                                </span>
                              )}
                            </>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div
          aria-hidden="true"
          className={cx(
            "pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-neutral-50 to-transparent transition-opacity duration-200 ease-out dark:from-neutral-900",
            nav.edges.start ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cx(
            "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-neutral-50 to-transparent transition-opacity duration-200 ease-out dark:from-neutral-900",
            nav.edges.end ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      <div
        ref={footerRef}
        className="relative shrink-0 space-y-1 bg-neutral-100/70 p-2 dark:bg-neutral-800/40"
      >
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
            onClick={onToggleCollapse}
            className={cx(
              "flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] px-3 text-[13px] text-neutral-600 hover:bg-white hover:text-neutral-900 active:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:active:bg-neutral-700",
              collapsed && "justify-center",
              transition,
              focus,
            )}
          >
            <PanelLeft
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
            />
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate text-left">
                Collapse sidebar
              </span>
            )}
          </button>
        )}

        <button
          ref={userTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={userOpen}
          onClick={() => (userOpen ? closeMenu(false) : setUserOpen(true))}
          className={cx(
            "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-[var(--rb-r-lg,10px)] px-1 text-left hover:bg-white active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",
            collapsed && "justify-center",
            transition,
            focus,
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
            IR
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                  Iris Renner
                </span>
                <span className="block truncate text-xs text-neutral-500 dark:text-neutral-500">
                  Operations lead
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
              />
            </>
          )}
        </button>

        {userOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            className={cx(
              "absolute bottom-[calc(100%-0.25rem)] left-2 z-30 origin-bottom rounded-[var(--rb-r-2xl,14px)] bg-white p-1 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] transition-[opacity,transform] duration-150 ease-out dark:bg-neutral-800 dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)]",
              collapsed ? "w-56" : "right-2",
              shown ? "scale-100 opacity-100" : "scale-[0.97] opacity-0",
            )}
          >
            {accountMenu.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => closeMenu(true)}
                className={cx(
                  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--rb-r-lg,10px)] px-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:active:bg-neutral-600",
                  transition,
                  focus,
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
                />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function AppSidebar1() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerShown, setDrawerShown] = useState(false);
  const shouldFocusRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const view = triggerRef.current?.ownerDocument.defaultView ?? window;
      if (view.matchMedia("(max-width: 1023px)").matches) setMobileOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    const frame = requestAnimationFrame(() => setDrawerShown(true));
    const doc = drawer?.ownerDocument ?? document;
    const getFocusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    if (shouldFocusRef.current) {
      getFocusable()[0]?.focus({ preventScroll: true });
      shouldFocusRef.current = false;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setDrawerShown(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const closeMobile = () => {
    setMobileOpen(false);
    setDrawerShown(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="relative flex h-full min-h-[640px] w-full overflow-hidden bg-white dark:bg-neutral-950">
      <aside
        className={cx(
          "hidden shrink-0 flex-col bg-neutral-50 transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] lg:flex dark:bg-neutral-900",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <SidebarBody
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center px-4 lg:hidden">
          <button
            ref={triggerRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => {
              shouldFocusRef.current = true;
              setMobileOpen(true);
            }}
            className={cx(
              "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--rb-r-md,8px)] bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:active:bg-neutral-600",
              transition,
              focus,
            )}
          >
            <Menu aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeMobile}
            tabIndex={-1}
            className={cx(
              "absolute inset-0 z-30 cursor-pointer bg-neutral-950/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out dark:bg-neutral-950/60",
              drawerShown ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cx(
              "absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col rounded-r-[var(--rb-r-4xl,18px)] bg-neutral-50 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] dark:bg-neutral-900 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]",
              drawerShown ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <SidebarBody collapsed={false} onClose={closeMobile} />
          </aside>
        </div>
      )}
    </div>
  );
}
