"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  Search,
  SearchX,
} from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

type Account = {
  name: string;
  owner: string;
  plan: "Enterprise" | "Scale" | "Growth";
  status: "Active" | "Needs review" | "Paused";
  region: "North America" | "EMEA" | "APAC" | "LATAM";
  mrr: number;
  renewalOn: string;
};

const accounts: Account[] = [
  {
    name: "Sable Ridge Energy",
    owner: "Mina Kapoor",
    plan: "Enterprise",
    status: "Needs review",
    region: "EMEA",
    mrr: 18420,
    renewalOn: "2025-08-12",
  },
  {
    name: "North Pier Robotics",
    owner: "Tomasz Nowak",
    plan: "Scale",
    status: "Active",
    region: "North America",
    mrr: 9860,
    renewalOn: "2025-09-03",
  },
  {
    name: "Longleaf Clinical Research Network International",
    owner: "Ari Chen",
    plan: "Enterprise",
    status: "Active",
    region: "APAC",
    mrr: 22190,
    renewalOn: "2025-09-19",
  },
  {
    name: "Cobalt Field Labs",
    owner: "Rhea Flores",
    plan: "Growth",
    status: "Paused",
    region: "North America",
    mrr: 4210,
    renewalOn: "2025-10-01",
  },
  {
    name: "Kite Harbor Logistics",
    owner: "Devon Okafor",
    plan: "Scale",
    status: "Active",
    region: "LATAM",
    mrr: 7540,
    renewalOn: "2025-10-08",
  },
  {
    name: "Mossbank Archive Trust",
    owner: "Lena Ortiz",
    plan: "Growth",
    status: "Needs review",
    region: "EMEA",
    mrr: 3980,
    renewalOn: "2025-10-22",
  },
  {
    name: "Vantage Grid Systems",
    owner: "Priya Rao",
    plan: "Enterprise",
    status: "Active",
    region: "North America",
    mrr: 26740,
    renewalOn: "2025-11-04",
  },
  {
    name: "Harbor & Vale Freight",
    owner: "Marcus Lund",
    plan: "Scale",
    status: "Active",
    region: "EMEA",
    mrr: 11230,
    renewalOn: "2025-11-11",
  },
  {
    name: "Tidewater Instruments",
    owner: "Sofia Martins",
    plan: "Growth",
    status: "Active",
    region: "APAC",
    mrr: 5620,
    renewalOn: "2025-11-18",
  },
  {
    name: "Redwood Payments",
    owner: "Jun Park",
    plan: "Enterprise",
    status: "Needs review",
    region: "North America",
    mrr: 19870,
    renewalOn: "2025-11-29",
  },
];

const columns = ["Owner", "Plan", "Region", "Renewal"] as const;
type Column = (typeof columns)[number];

function StatusCell({ status }: { status: Account["status"] }) {
  const dot =
    status === "Needs review"
      ? "bg-amber-500"
      : "bg-neutral-300 dark:bg-neutral-600";
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-neutral-600 dark:text-neutral-400">
      <span
        aria-hidden
        className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dot)}
      />
      {status}
    </span>
  );
}

const currency = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const renewalLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const headBase =
  "h-9 px-3 text-xs font-medium text-neutral-500 first:pl-4 sm:first:pl-6 last:pr-4 sm:last:pr-6";
const cellBase =
  "px-3 text-[13px] first:pl-4 sm:first:pl-6 last:pr-4 sm:last:pr-6";

type SortKey = "name" | "mrr" | "renewalOn";

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={cx(headBase, align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cx(
          "inline-flex h-9 max-w-full cursor-pointer items-center gap-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]",
          align === "right" && "flex-row-reverse",
          active
            ? "text-neutral-900 dark:text-neutral-100"
            : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronUp
          aria-hidden
          className={cx(
            "h-3 w-3 shrink-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
            active ? "opacity-100" : "opacity-0",
            active && sort.dir === "desc" && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}

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

function useScrollFadeX<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setEdges({
      start: scrollLeft > 1,
      end: Math.ceil(scrollLeft + clientWidth) < scrollWidth - 1,
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

export default function DataTable1() {
  const chips = useScrollFadeX<HTMLDivElement>();
  const body = useScrollFade<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<Account["plan"] | null>(null);
  const [visible, setVisible] = useState<Record<Column, boolean>>({
    Owner: true,
    Plan: true,
    Region: true,
    Renewal: true,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "mrr",
    dir: "desc",
  });
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuShown, setMenuShown] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => setMenuShown(true));
    const doc = triggerRef.current?.ownerDocument;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t))
        return;
      setMenuShown(false);
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMenuShown(false);
      setMenuOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    doc?.addEventListener("pointerdown", onPointerDown);
    doc?.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc?.removeEventListener("pointerdown", onPointerDown);
      doc?.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = (restoreFocus: boolean) => {
    setMenuShown(false);
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = accounts.filter((a) => {
      if (plan && a.plan !== plan) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q)
      );
    });
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "mrr") return (a.mrr - b.mrr) * factor;
      return String(a[sort.key]).localeCompare(String(b[sort.key])) * factor;
    });
  }, [query, plan, sort]);

  const plans: Account["plan"][] = ["Enterprise", "Scale", "Growth"];

  const focusItem = (i: number) =>
    itemRefs.current[(i + columns.length) % columns.length]?.focus({
      preventScroll: true,
    });

  return (
    <div className="relative flex h-full min-h-[640px] w-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 bg-neutral-50 px-4 sm:px-6 dark:bg-neutral-900">
          <h2 className="min-w-0 flex-1 truncate text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
            Accounts
          </h2>
          <button
            type="button"
            className="hidden h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] bg-neutral-100 px-3 text-sm font-medium text-neutral-700 transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-200 hover:text-neutral-900 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] sm:inline-flex dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
          >
            <Download aria-hidden className="h-4 w-4 shrink-0" />
            Export
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-2 bg-neutral-50 px-4 py-2 sm:h-12 sm:flex-nowrap sm:px-6 sm:py-0 dark:bg-neutral-900">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search accounts</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts"
              className="h-9 w-full rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-colors duration-150 hover:border-neutral-300 focus:border-neutral-900 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:border-neutral-700 dark:focus:border-white dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
            />
          </label>

          <div className="relative -mx-4 order-last w-[calc(100%+2rem)] sm:order-none sm:mx-0 sm:w-auto">
            <div
              ref={chips.ref}
              onScroll={chips.onScroll}
              className="flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:px-0"
            >
              <button
                type="button"
                aria-pressed={plan === null}
                onClick={() => setPlan(null)}
                className={cx(
                  "inline-flex h-8 cursor-pointer items-center rounded-[var(--rb-r-md,8px)] px-2.5 text-[13px] font-medium transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]",
                  plan === null
                    ? "bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]"
                    : "border border-neutral-200 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
                )}
              >
                All plans
              </button>
              {plans.map((p) => {
                const active = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPlan(active ? null : p)}
                    className={cx(
                      "inline-flex h-8 cursor-pointer items-center rounded-[var(--rb-r-md,8px)] px-2.5 text-[13px] font-medium transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]",
                      active
                        ? "bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]"
                        : "border border-neutral-200 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <div
              aria-hidden="true"
              className={cx(
                "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-neutral-50 to-transparent transition-opacity duration-200 ease-out sm:hidden dark:from-neutral-900",
                chips.edges.start ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              aria-hidden="true"
              className={cx(
                "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-neutral-50 to-transparent transition-opacity duration-200 ease-out sm:hidden dark:from-neutral-900",
                chips.edges.end ? "opacity-100" : "opacity-0",
              )}
            />
          </div>

          <div
            className="relative ml-auto"
            onKeyDown={(e) => {
              if (!menuOpen) return;
              const active = e.currentTarget.ownerDocument.activeElement;
              const i = itemRefs.current.findIndex((b) => b === active);
              if (e.key === "Tab") closeMenu(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusItem(i + 1);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                focusItem(i < 0 ? columns.length - 1 : i - 1);
              }
              if (e.key === "Home") {
                e.preventDefault();
                focusItem(0);
              }
              if (e.key === "End") {
                e.preventDefault();
                focusItem(columns.length - 1);
              }
            }}
          >
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                if (menuOpen) closeMenu(false);
                else setMenuOpen(true);
              }}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] bg-neutral-100 px-3 text-sm font-medium text-neutral-700 transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-200 hover:text-neutral-900 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
            >
              <Columns3 aria-hidden className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Columns</span>
              <ChevronDown
                aria-hidden
                className={cx(
                  "h-4 w-4 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  menuOpen && "rotate-180",
                )}
              />
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Toggle columns"
                className={cx(
                  "absolute right-0 top-11 z-30 w-48 origin-top-right rounded-[var(--rb-r-xl,12px)] border border-neutral-200/70 bg-white p-1 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none",
                  menuShown
                    ? "translate-y-0 scale-100 opacity-100"
                    : "-translate-y-1 scale-[0.98] opacity-0",
                )}
              >
                {columns.map((c, i) => (
                  <button
                    key={c}
                    ref={(n) => {
                      itemRefs.current[i] = n;
                    }}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={visible[c]}
                    onClick={() => setVisible((v) => ({ ...v, [c]: !v[c] }))}
                    className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] px-2 text-[13px] text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:text-neutral-300 dark:hover:bg-neutral-800 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--rb-r-xs,4px)] border transition-colors duration-150",
                        visible[c]
                          ? "border-neutral-900 bg-[var(--rb-accent,oklch(20.5%_0_0))] dark:border-white dark:bg-[var(--rb-accent,oklch(100%_0_0))]"
                          : "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950",
                      )}
                    >
                      <Check
                        className={cx(
                          "h-2.5 w-2.5 text-[var(--rb-accent-fg,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]",
                          !visible[c] && "opacity-0",
                        )}
                        strokeWidth={3}
                      />
                    </span>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={body.ref}
            onScroll={body.onScroll}
            className="h-full overflow-auto"
          >
            <table className="hidden w-full min-w-[820px] border-collapse text-left md:table">
              <caption className="sr-only">Customer accounts</caption>
              <thead className="sticky top-0 z-20 bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <SortHead
                    label="Account"
                    sortKey="name"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  {visible.Owner && (
                    <th scope="col" className={headBase}>
                      Owner
                    </th>
                  )}
                  {visible.Plan && (
                    <th scope="col" className={cx(headBase, "w-[110px]")}>
                      Plan
                    </th>
                  )}
                  <th scope="col" className={cx(headBase, "w-[140px]")}>
                    Status
                  </th>
                  {visible.Region && (
                    <th scope="col" className={cx(headBase, "w-[150px]")}>
                      Region
                    </th>
                  )}
                  <SortHead
                    label="MRR"
                    sortKey="mrr"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-[110px]"
                  />
                  {visible.Renewal && (
                    <SortHead
                      label="Renewal"
                      sortKey="renewalOn"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                      className="w-[120px]"
                    />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                {rows.map((a) => (
                  <tr
                    key={a.name}
                    className="h-11 transition-colors duration-150 hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                  >
                    <td
                      className={cx(
                        cellBase,
                        "max-w-[280px] font-medium text-neutral-900 dark:text-neutral-100",
                      )}
                    >
                      <span className="block truncate">{a.name}</span>
                    </td>
                    {visible.Owner && (
                      <td
                        className={cx(
                          cellBase,
                          "text-neutral-600 dark:text-neutral-400",
                        )}
                      >
                        {a.owner}
                      </td>
                    )}
                    {visible.Plan && (
                      <td
                        className={cx(
                          cellBase,
                          "whitespace-nowrap text-neutral-600 dark:text-neutral-400",
                        )}
                      >
                        {a.plan}
                      </td>
                    )}
                    <td className={cx(cellBase, "whitespace-nowrap")}>
                      <StatusCell status={a.status} />
                    </td>
                    {visible.Region && (
                      <td
                        className={cx(
                          cellBase,
                          "whitespace-nowrap text-neutral-600 dark:text-neutral-400",
                        )}
                      >
                        {a.region}
                      </td>
                    )}
                    <td
                      className={cx(
                        cellBase,
                        "text-right tabular-nums text-neutral-900 dark:text-neutral-100",
                      )}
                    >
                      {currency(a.mrr)}
                    </td>
                    {visible.Renewal && (
                      <td
                        className={cx(
                          cellBase,
                          "whitespace-nowrap text-right tabular-nums text-neutral-600 dark:text-neutral-400",
                        )}
                      >
                        {renewalLabel(a.renewalOn)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-2 p-4 md:hidden">
              {rows.map((a) => (
                <div
                  key={a.name}
                  className="rounded-[var(--rb-r-xl,12px)] bg-neutral-50 p-4 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      {a.name}
                    </p>
                    <span className="shrink-0 text-[13px] tabular-nums text-neutral-900 dark:text-neutral-100">
                      {currency(a.mrr)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <StatusCell status={a.status} />
                    <span className="shrink-0 text-xs text-neutral-500">
                      {a.plan} · Renews {renewalLabel(a.renewalOn)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {rows.length === 0 && (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
                <span
                  aria-hidden
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--rb-r-lg,10px)] bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                >
                  <SearchX className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  No matching accounts
                </p>
                <p className="mt-1 max-w-xs text-xs text-neutral-600 dark:text-neutral-400">
                  Try a different search, or clear the plan filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPlan(null);
                  }}
                  className="mt-4 inline-flex h-8 cursor-pointer items-center rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2.5 text-[13px] font-medium text-neutral-900 transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-50 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 ease-out dark:from-neutral-950",
              body.edges.end ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

        <footer className="flex h-12 shrink-0 items-center bg-neutral-50 px-4 text-xs tabular-nums text-neutral-600 sm:px-6 dark:bg-neutral-900 dark:text-neutral-400">
          Showing {rows.length} of {accounts.length} accounts
        </footer>
      </div>
    </div>
  );
}
