"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

type Metric = {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  spark: number[];
};

type Range = {
  key: string;
  compare: string;
  metrics: Metric[];
  months: string[];
  revenue: number[];
};

const SPARK = {
  revenue: [28, 31, 30, 36, 34, 41, 44, 43, 49, 52, 58, 61],
  accounts: [70, 72, 71, 74, 78, 79, 83, 86, 88, 90, 93, 97],
  contract: [61, 59, 60, 58, 57, 55, 56, 54, 53, 52, 51, 49],
  churn: [12, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18],
};

const Y_MAX = 500;
const Y_TICKS = [500, 375, 250, 125, 0];

const RANGES: Range[] = [
  {
    key: "Last 3 months",
    compare: "vs. prior 3 months",
    months: ["Jul", "Aug", "Sep"],
    revenue: [448, 466, 483],
    metrics: [
      {
        label: "Net revenue",
        value: "$1.40M",
        delta: "+9.8%",
        positive: true,
        spark: SPARK.revenue,
      },
      {
        label: "Paid accounts",
        value: "3,914",
        delta: "+2.1%",
        positive: true,
        spark: SPARK.accounts,
      },
      {
        label: "Average contract",
        value: "$1,278",
        delta: "−1.4%",
        positive: false,
        spark: SPARK.contract,
      },
      {
        label: "Monthly churn",
        value: "1.8%",
        delta: "+0.2 pp",
        positive: false,
        spark: SPARK.churn,
      },
    ],
  },
  {
    key: "Last 6 months",
    compare: "vs. prior 6 months",
    months: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    revenue: [371, 402, 419, 448, 466, 483],
    metrics: [
      {
        label: "Net revenue",
        value: "$2.59M",
        delta: "+12.4%",
        positive: true,
        spark: SPARK.revenue,
      },
      {
        label: "Paid accounts",
        value: "3,914",
        delta: "+4.1%",
        positive: true,
        spark: SPARK.accounts,
      },
      {
        label: "Average contract",
        value: "$1,284",
        delta: "−2.3%",
        positive: false,
        spark: SPARK.contract,
      },
      {
        label: "Monthly churn",
        value: "1.8%",
        delta: "+0.3 pp",
        positive: false,
        spark: SPARK.churn,
      },
    ],
  },
  {
    key: "Year to date",
    compare: "vs. same period last year",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    revenue: [279, 301, 318, 371, 402, 419, 448, 466, 483],
    metrics: [
      {
        label: "Net revenue",
        value: "$3.49M",
        delta: "+22.8%",
        positive: true,
        spark: SPARK.revenue,
      },
      {
        label: "Paid accounts",
        value: "3,914",
        delta: "+14.2%",
        positive: true,
        spark: SPARK.accounts,
      },
      {
        label: "Average contract",
        value: "$1,292",
        delta: "−1.8%",
        positive: false,
        spark: SPARK.contract,
      },
      {
        label: "Monthly churn",
        value: "1.9%",
        delta: "+0.4 pp",
        positive: false,
        spark: SPARK.churn,
      },
    ],
  },
];

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 92 - ((v - min) / span) * 84;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      className="hidden h-8 w-16 shrink-0 sm:block"
    >
      <polyline
        points={points}
        fill="none"
        vectorEffect="non-scaling-stroke"
        className="stroke-neutral-900 dark:stroke-neutral-100"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RangeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setShown(false);
      }
    };
    doc.addEventListener("pointerdown", onPointerDown);
    return () => doc.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current ?? 0), []);

  const openMenu = (index: number, withTransition: boolean) => {
    setActive(index);
    setOpen(true);
    if (withTransition) {
      setShown(false);
      frameRef.current = requestAnimationFrame(() => setShown(true));
    } else {
      setShown(true);
    }
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    setShown(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const select = (index: number) => {
    onChange(RANGES[index].key);
    close();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0, false);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(RANGES.length - 1, false);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i + 1) % RANGES.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + RANGES.length) % RANGES.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(RANGES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(active);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Date range: ${value}`}
        onClick={() => (open ? close() : openMenu(0, true))}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
      >
        {value}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-neutral-500"
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Date range"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cx(
            "absolute right-0 top-full z-30 mt-1.5 w-48 origin-top-right overflow-hidden rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-white p-1 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] outline-none transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-none",
            shown ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          {RANGES.map((range, index) => {
            const selected = range.key === value;
            return (
              <button
                key={range.key}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onClick={() => select(index)}
                onPointerMove={() => setActive(index)}
                className={cx(
                  "flex h-8 w-full cursor-pointer items-center gap-2 rounded-[var(--rb-r-lg,10px)] px-2 text-left text-[13px] transition-colors duration-150",
                  selected
                    ? "font-medium text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-600 dark:text-neutral-400",
                  index === active
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "bg-transparent",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{range.key}</span>
                {selected && (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-neutral-900 dark:text-neutral-100"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard1() {
  const [rangeKey, setRangeKey] = useState(RANGES[1].key);
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];

  return (
    <div className="relative flex h-full min-h-[640px] w-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 sm:px-6 dark:border-neutral-800">
        <h1 className="truncate text-xl font-medium tracking-[-0.015em] text-neutral-900 dark:text-neutral-100">
          Revenue
        </h1>
        <RangeSelect value={rangeKey} onChange={setRangeKey} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-1 rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-neutral-50 p-1 lg:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-950">
          {range.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[var(--rb-r-lg,10px)] border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="truncate text-[13px] text-neutral-500">
                {metric.label}
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="truncate text-2xl font-medium tabular-nums tracking-[-0.02em] text-neutral-900 dark:text-neutral-100">
                  {metric.value}
                </p>
                <Sparkline values={metric.spark} />
              </div>
              <p className="mt-1.5 truncate text-[13px] tabular-nums">
                <span
                  className={
                    metric.positive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {metric.delta}
                </span>
                <span className="hidden text-neutral-500 sm:inline">
                  {" "}
                  {range.compare}
                </span>
              </p>
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Net revenue by month
            </h2>
            <span className="shrink-0 text-xs text-neutral-500">
              USD, thousands
            </span>
          </div>

          <div className="mt-4 flex min-h-0 flex-1 gap-3">
            <div className="-my-2 flex w-10 shrink-0 flex-col justify-between text-right text-[11px] leading-4 tabular-nums text-neutral-500">
              {Y_TICKS.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div className="relative min-h-0 flex-1">
              <svg
                aria-hidden
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
                className="absolute inset-0 h-full w-full"
              >
                {Y_TICKS.map((tick) => {
                  const y = 100 - (tick / Y_MAX) * 100;
                  return (
                    <line
                      key={tick}
                      x1="0"
                      x2="100"
                      y1={y}
                      y2={y}
                      vectorEffect="non-scaling-stroke"
                      className="stroke-neutral-200/60 dark:stroke-neutral-800/60"
                      strokeWidth={1}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex items-end gap-2 sm:gap-3">
                {range.revenue.map((value, i) => (
                  <div
                    key={range.months[i]}
                    className="flex min-w-0 flex-1 justify-center transition-[height] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
                    style={{ height: `${(value / Y_MAX) * 100}%` }}
                  >
                    <div className="h-full w-full max-w-[64px] rounded-t-[var(--rb-r-xs,4px)] bg-neutral-900 dark:bg-neutral-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-3">
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex min-w-0 flex-1 gap-2 sm:gap-3">
              {range.months.map((month) => (
                <span
                  key={month}
                  className="min-w-0 flex-1 truncate text-center text-[11px] text-neutral-500"
                >
                  {month}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
