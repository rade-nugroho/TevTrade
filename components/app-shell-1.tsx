"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  Command,
  FileWarning,
  LayoutGrid,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Truck,
  UserPlus,
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

const focusInset =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";

const transition =
  "transition-[background-color,border-color,color,opacity] duration-150 ease-out";

const navItem =
  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] px-3 text-[13px] active:bg-neutral-200 dark:active:bg-neutral-700";

const navRest =
  "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";

const navCurrent =
  "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100";

const iconButton =
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--rb-r-md,8px)] bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:active:bg-neutral-600";

const shipmentViews = [
  { label: "In transit", current: true },
  { label: "Awaiting pickup", current: false },
  { label: "Delivered", current: false },
  { label: "Cancelled", current: false },
];

const facilities = [
  { name: "Newark distribution centre", needsAttention: false },
  { name: "Memphis sortation hub", needsAttention: false },
  { name: "Fresno cross-dock", needsAttention: true },
  { name: "Laredo border yard", needsAttention: false },
  { name: "Rotterdam gateway", needsAttention: false },
];

const footerLinks = [
  { label: "Workspace settings", icon: Settings },
  { label: "Invite teammate", icon: UserPlus },
  { label: "Documentation", icon: BookOpen },
];

const accountMenu = [
  { label: "Account settings", icon: Settings },
  { label: "Notification preferences", icon: Bell },
  { label: "Keyboard shortcuts", icon: Command },
  { label: "Sign out", icon: LogOut },
];

const metrics = [
  { label: "On-time delivery", value: "94.2%", delta: "+1.8 pts vs last week" },
  { label: "Shipments in transit", value: "1,284", delta: "+96 vs last week" },
  {
    label: "Average transit time",
    value: "3.4 days",
    delta: "\u22120.2 days vs last week",
  },
  { label: "Open claims", value: "6", delta: "+2 vs last week" },
];

type Status = "In transit" | "Awaiting pickup" | "Delivered" | "Held";

type Shipment = {
  reference: string;
  consignee: string;
  carrier: string | null;
  status: Status;
  eta: string;
  value: string;
};

const shipments: Shipment[] = [
  {
    reference: "SHP-40912",
    consignee: "Brightwater Municipal Utilities District",
    carrier: "Ardent Freightways",
    status: "In transit",
    eta: "Aug 11",
    value: "$42,180",
  },
  {
    reference: "SHP-40908",
    consignee: "Kettleworth Foods",
    carrier: "Novara Lines",
    status: "In transit",
    eta: "Aug 11",
    value: "$8,940",
  },
  {
    reference: "SHP-40901",
    consignee: "Halverson Marine Supply",
    carrier: "Ardent Freightways",
    status: "Held",
    eta: "Aug 13",
    value: "$17,620",
  },
  {
    reference: "SHP-40897",
    consignee: "Pinegrove Cabinetry",
    carrier: null,
    status: "Awaiting pickup",
    eta: "Aug 12",
    value: "$3,410",
  },
  {
    reference: "SHP-40892",
    consignee: "Corsair Metalworks",
    carrier: "Trellis Logistics",
    status: "In transit",
    eta: "Aug 12",
    value: "$26,750",
  },
  {
    reference: "SHP-40886",
    consignee: "Delacroix Paper",
    carrier: "Novara Lines",
    status: "In transit",
    eta: "Aug 13",
    value: "$6,205",
  },
  {
    reference: "SHP-40881",
    consignee: "Oakhaven Brewing",
    carrier: "Trellis Logistics",
    status: "Delivered",
    eta: "Aug 8",
    value: "$11,340",
  },
  {
    reference: "SHP-40877",
    consignee: "Stellamar Seafood",
    carrier: "Ardent Freightways",
    status: "In transit",
    eta: "Aug 14",
    value: "$19,880",
  },
  {
    reference: "SHP-40870",
    consignee: "Vandergrift Tooling",
    carrier: "Meridian Carriers",
    status: "Awaiting pickup",
    eta: "Aug 14",
    value: "$4,960",
  },
  {
    reference: "SHP-40864",
    consignee: "Cloudbank Textiles",
    carrier: "Novara Lines",
    status: "In transit",
    eta: "Aug 15",
    value: "$9,275",
  },
  {
    reference: "SHP-40859",
    consignee: "Rowanberry Organics",
    carrier: "Trellis Logistics",
    status: "Delivered",
    eta: "Aug 9",
    value: "$2,830",
  },
  {
    reference: "SHP-40851",
    consignee: "Ferris Point Aggregates",
    carrier: "Meridian Carriers",
    status: "In transit",
    eta: "Aug 15",
    value: "$31,470",
  },
  {
    reference: "SHP-40846",
    consignee: "Windhollow Instruments",
    carrier: "Ardent Freightways",
    status: "In transit",
    eta: "Aug 16",
    value: "$7,690",
  },
  {
    reference: "SHP-40840",
    consignee: "Juniper Hollow Distillery",
    carrier: "Meridian Carriers",
    status: "In transit",
    eta: "Aug 16",
    value: "$5,120",
  },
];

const statusDot: Record<Status, string> = {
  "In transit": "bg-neutral-400 dark:bg-neutral-500",
  "Awaiting pickup": "bg-neutral-300 dark:bg-neutral-600",
  Delivered: "bg-neutral-300 dark:bg-neutral-600",
  Held: "bg-red-500",
};

function StatusCell({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-neutral-600 dark:text-neutral-400">
      <span
        aria-hidden="true"
        className={cx("h-1.5 w-1.5 shrink-0 rounded-full", statusDot[status])}
      />
      {status}
    </span>
  );
}

function SidebarBody({ onClose }: { onClose?: () => void }) {
  const nav = useScrollFade<HTMLElement>();
  const [shipmentsOpen, setShipmentsOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountShown, setAccountShown] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const shipmentsId = useId();

  const closeAccount = (restoreFocus: boolean) => {
    setAccountOpen(false);
    setAccountShown(false);
    if (restoreFocus) accountTriggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!accountOpen) return;
    const node = footerRef.current;
    const doc = node?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => {
      setAccountShown(true);
      accountMenuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    });

    const onPointerDown = (event: Event) => {
      if (!node?.contains(event.target as Node)) closeAccount(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(
        accountMenuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]',
        ) ?? [],
      );
      if (items.length === 0) return;
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeAccount(true);
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
      } else if (event.key === "Tab") {
        closeAccount(false);
      }
    };

    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 pl-3 pr-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-sm font-medium text-[var(--rb-accent-fg,oklch(100%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]"
        >
          O
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
            Overland
          </p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-500">
            Freight operations
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className={cx(iconButton, "h-8 w-8", transition, focus)}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Workspace options"
            className={cx(iconButton, "h-8 w-8", transition, focus)}
          >
            <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <nav
          ref={nav.ref}
          onScroll={nav.onScroll}
          aria-label="Primary"
          className="h-full space-y-4 overflow-y-auto px-2 pb-3"
        >
          <div>
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
              Operations
            </p>
            <ul className="space-y-0.5">
              <li>
                <a
                  href="#dispatch-board"
                  className={cx(navItem, navRest, transition, focus)}
                >
                  <LayoutGrid
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    Dispatch board
                  </span>
                </a>
              </li>

              <li>
                <button
                  type="button"
                  aria-expanded={shipmentsOpen}
                  aria-controls={shipmentsId}
                  onClick={() => setShipmentsOpen((open) => !open)}
                  className={cx(navItem, navRest, transition, focus)}
                >
                  <Truck
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
                  />
                  <span className="min-w-0 flex-1 truncate text-left">
                    Shipments
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className={cx(
                      "h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-neutral-500",
                      shipmentsOpen && "rotate-90",
                    )}
                  />
                </button>
                <div
                  id={shipmentsId}
                  className={cx(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    shipmentsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <ul className="min-h-0 space-y-0.5 overflow-hidden">
                    {shipmentViews.map((view) => (
                      <li
                        key={view.label}
                        className={shipmentsOpen ? undefined : "invisible"}
                      >
                        <a
                          href="#shipments"
                          tabIndex={shipmentsOpen ? undefined : -1}
                          aria-current={view.current ? "page" : undefined}
                          className={cx(
                            navItem,
                            "pl-9",
                            view.current ? navCurrent : navRest,
                            transition,
                            focusInset,
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {view.label}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>

              <li>
                <a
                  href="#claims"
                  className={cx(navItem, navRest, transition, focus)}
                >
                  <FileWarning
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
                  />
                  <span className="min-w-0 flex-1 truncate">Claims</span>
                  <span className="inline-flex h-5 shrink-0 items-center rounded-[var(--rb-r-sm,6px)] bg-neutral-100 px-1.5 text-[11px] font-medium tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    6
                  </span>
                </a>
              </li>

              <li>
                <a
                  href="#carriers"
                  className={cx(navItem, navRest, transition, focus)}
                >
                  <Building2
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
                  />
                  <span className="min-w-0 flex-1 truncate">Carriers</span>
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
              Facilities
            </p>
            <ul className="space-y-0.5">
              {facilities.map((facility) => (
                <li key={facility.name}>
                  <a
                    href="#facilities"
                    className={cx(navItem, navRest, transition, focus)}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        "ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        facility.needsAttention
                          ? "bg-amber-500"
                          : "bg-neutral-300 dark:bg-neutral-600",
                      )}
                    />
                    <span className="ml-1.5 min-w-0 flex-1 truncate">
                      {facility.name}
                    </span>
                    {facility.needsAttention && (
                      <span className="sr-only">Nearing capacity</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
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
        className="relative shrink-0 space-y-0.5 bg-neutral-100/70 p-2 dark:bg-neutral-800/40"
      >
        {footerLinks.map(({ label, icon: Icon }) => (
          <a
            key={label}
            href="#workspace"
            className={cx(
              navItem,
              "text-neutral-600 hover:bg-white hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
              transition,
              focus,
            )}
          >
            <Icon
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-500"
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </a>
        ))}

        <button
          ref={accountTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() =>
            accountOpen ? closeAccount(false) : setAccountOpen(true)
          }
          className={cx(
            "mt-1 flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-[var(--rb-r-lg,10px)] px-1 text-left hover:bg-white active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",
            transition,
            focus,
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
          >
            DO
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
              Devon Okafor
            </span>
            <span className="block truncate text-xs text-neutral-500 dark:text-neutral-500">
              Dispatch lead
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cx(
              "h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-neutral-500",
              accountOpen && "rotate-180",
            )}
          />
        </button>

        {accountOpen && (
          <div
            ref={accountMenuRef}
            role="menu"
            aria-label="Account"
            className={cx(
              "absolute bottom-[calc(100%-0.25rem)] left-2 right-2 z-30 origin-bottom rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-white p-1 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none",
              accountShown ? "scale-100 opacity-100" : "scale-[0.97] opacity-0",
            )}
          >
            {accountMenu.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => closeAccount(true)}
                className={cx(
                  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--rb-r-lg,10px)] px-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:active:bg-neutral-700",
                  transition,
                  focusInset,
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

export default function AppShell1() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerShown, setDrawerShown] = useState(false);
  const content = useScrollFade<HTMLElement>();
  const shouldFocusRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const view = triggerRef.current?.ownerDocument.defaultView ?? window;
      if (view.matchMedia("(max-width: 1023px)").matches) setDrawerOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const doc = drawer?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => setDrawerShown(true));
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
        setDrawerOpen(false);
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
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerShown(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="relative flex h-full min-h-[720px] w-full overflow-hidden bg-white dark:bg-neutral-950">
      <aside className="hidden w-64 shrink-0 flex-col bg-neutral-50 lg:flex dark:bg-neutral-900">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 bg-neutral-50 px-4 sm:px-6 dark:bg-neutral-900">
          <button
            ref={triggerRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => {
              shouldFocusRef.current = true;
              setDrawerOpen(true);
            }}
            className={cx(iconButton, "h-9 w-9 lg:hidden", transition, focus)}
          >
            <Menu aria-hidden="true" className="h-4 w-4" />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1.5">
              <li className="hidden items-center gap-1.5 sm:flex">
                <a
                  href="#operations"
                  className={cx(
                    "rounded-[var(--rb-r-sm,6px)] text-[13px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100",
                    transition,
                    focus,
                  )}
                >
                  Operations
                </a>
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-600"
                />
              </li>
              <li className="flex shrink-0 items-center gap-1.5">
                <a
                  href="#shipments"
                  className={cx(
                    "rounded-[var(--rb-r-sm,6px)] text-[13px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100",
                    transition,
                    focus,
                  )}
                >
                  Shipments
                </a>
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-600"
                />
              </li>
              <li className="min-w-0">
                <span
                  aria-current="page"
                  className="block truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100"
                >
                  In transit
                </span>
              </li>
            </ol>
          </nav>

          <label className="relative hidden w-56 shrink-0 md:block">
            <span className="sr-only">Search shipments</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              placeholder="Search shipments"
              className="h-9 w-full rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-500 transition-colors duration-150 hover:border-neutral-300 focus:border-neutral-900 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:hover:border-neutral-700 dark:focus:border-white dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
            />
          </label>

          <button
            type="button"
            aria-label="Book shipment"
            className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--rb-r-md,8px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] px-3 text-sm font-medium text-[var(--rb-accent-fg,oklch(100%_0_0))] transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_90%,transparent)] active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:hover:bg-[color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_90%,transparent)] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
          >
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Book shipment</span>
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          <main
            ref={content.ref}
            onScroll={content.onScroll}
            className="h-full overflow-y-auto bg-white dark:bg-neutral-950"
          >
            <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-6 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="flex h-full flex-col rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <p className="text-xs text-balance text-neutral-500 sm:text-[13px] dark:text-neutral-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 truncate text-2xl font-medium tabular-nums tracking-[-0.02em] text-neutral-900 dark:text-neutral-100">
                    {metric.value}
                  </p>
                  <p className="mt-auto pt-1.5 text-xs tabular-nums text-neutral-500 sm:text-[13px] dark:text-neutral-500">
                    {metric.delta}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex h-9 items-center justify-between gap-3 px-4 sm:px-6">
              <h2 className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Active shipments
              </h2>
              <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-500">
                14 of 1,284
              </span>
            </div>

            <table className="hidden w-full table-fixed border-collapse text-left md:table">
              <caption className="sr-only">
                Shipments currently in transit
              </caption>
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-900/60">
                  <th
                    scope="col"
                    className="h-9 w-[11%] px-3 text-xs font-medium text-neutral-500 first:pl-4 sm:first:pl-6"
                  >
                    Reference
                  </th>
                  <th
                    scope="col"
                    className="h-9 w-[22%] px-3 text-xs font-medium text-neutral-500"
                  >
                    Consignee
                  </th>
                  <th
                    scope="col"
                    className="hidden h-9 w-[24%] px-3 text-xs font-medium text-neutral-500 lg:table-cell"
                  >
                    Carrier
                  </th>
                  <th
                    scope="col"
                    className="h-9 w-[16%] px-3 text-xs font-medium text-neutral-500"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="h-9 w-[11%] px-3 text-right text-xs font-medium text-neutral-500"
                  >
                    ETA
                  </th>
                  <th
                    scope="col"
                    className="h-9 w-[16%] px-3 text-right text-xs font-medium text-neutral-500 last:pr-4 sm:last:pr-6"
                  >
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                {shipments.map((shipment) => (
                  <tr
                    key={shipment.reference}
                    className="h-11 transition-colors duration-150 hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                  >
                    <td className="whitespace-nowrap px-3 text-[13px] tabular-nums text-neutral-600 first:pl-4 sm:first:pl-6 dark:text-neutral-400">
                      {shipment.reference}
                    </td>
                    <td className="px-3 text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      <span className="block truncate">
                        {shipment.consignee}
                      </span>
                    </td>
                    <td className="hidden px-3 text-[13px] text-neutral-600 lg:table-cell dark:text-neutral-400">
                      {shipment.carrier ? (
                        <span className="block truncate">
                          {shipment.carrier}
                        </span>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-600">
                          {"\u2014"}
                        </span>
                      )}
                    </td>
                    <td className="px-3">
                      <StatusCell status={shipment.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-neutral-600 dark:text-neutral-400">
                      {shipment.eta}
                    </td>
                    <td className="whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-neutral-900 last:pr-4 sm:last:pr-6 dark:text-neutral-100">
                      {shipment.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="space-y-2 px-4 pb-4 md:hidden">
              {shipments.map((shipment) => (
                <li
                  key={shipment.reference}
                  className="rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      {shipment.consignee}
                    </p>
                    <span className="shrink-0 text-[13px] tabular-nums text-neutral-900 dark:text-neutral-100">
                      {shipment.value}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <StatusCell status={shipment.status} />
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-500">
                      {shipment.reference}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-500">
                      {shipment.carrier ?? "\u2014"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-500">
                      {shipment.eta}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </main>
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent transition-opacity duration-200 ease-out dark:from-neutral-950",
              content.edges.start ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 ease-out dark:from-neutral-950",
              content.edges.end ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>

      {drawerOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeDrawer}
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
              "absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col rounded-r-[var(--rb-r-4xl,18px)] bg-white shadow-[0_16px_48px_-12px_rgba(0,0,0,0.18)] transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:bg-neutral-900 dark:shadow-none",
              drawerShown ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <SidebarBody onClose={closeDrawer} />
          </aside>
        </div>
      )}
    </div>
  );
}
