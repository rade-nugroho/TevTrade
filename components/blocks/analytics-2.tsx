"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { area, curveMonotoneX, line } from "d3-shape";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const focus =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";

const transition =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out";

const frame =
  "rounded-[var(--rb-r-2xl,14px)] border border-neutral-200/70 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-950";
const panel =
  "rounded-[var(--rb-r-lg,10px)] border border-neutral-200/70 bg-white dark:border-neutral-800 dark:bg-neutral-900";

const PAD = { top: 10, right: 1, bottom: 20, left: 36 };
const PLOT_H = 232;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`
    : Math.abs(n) >= 1_000
      ? `${(n / 1_000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}k`
      : `${n}`;

const grouped = (n: number) => n.toLocaleString("en-US");

function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) *
    mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(v);
  return { top, ticks };
}

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

const RANGES = ["7D", "30D", "12M"] as const;
type Range = (typeof RANGES)[number];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const wave = (seed: number, i: number) =>
  Math.sin(i * 0.7 + seed) * 0.5 +
  Math.sin(i * 0.23 + seed * 2.1) * 0.34 +
  Math.sin(i * 1.9 + seed * 0.6) * 0.12;

function buildSeries(range: Range) {
  const config: Record<Range, { count: number; base: number; drift: number }> =
    {
      "7D": { count: 7, base: 41_200, drift: 0.14 },
      "30D": { count: 30, base: 36_800, drift: 0.31 },
      "12M": { count: 12, base: 268_000, drift: 0.72 },
    };
  const { count, base, drift } = config[range];

  const values = Array.from({ length: count }, (_, i) =>
    Math.round(
      base * (1 + drift * (i / (count - 1))) * (1 + wave(2.4, i) * 0.085),
    ),
  );

  const labels = Array.from({ length: count }, (_, i) => {
    if (range === "12M") return MONTHS[i];
    if (range === "7D")
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i];
    return `Jun ${i + 1}`;
  });

  return { values, labels };
}

export default function Analytics2() {
  const uid = useId();
  const fillId = `${uid}-fill`;
  const clipId = `${uid}-clip`;

  const [range, setRange] = useState<Range>("30D");
  const [active, setActive] = useState<number | null>(null);
  const [held, setHeld] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [ref, size] = useMeasure<HTMLDivElement>();

  useEffect(() => setMounted(true), []);

  const { values, labels } = useMemo(() => buildSeries(range), [range]);

  const width = size.width;
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = PLOT_H - PAD.top - PAD.bottom;
  const { top, ticks } = useMemo(
    () => niceTicks(Math.max(...values)),
    [values],
  );

  const x = useCallback(
    (i: number) => PAD.left + (i / (values.length - 1)) * innerW,
    [innerW, values.length],
  );
  const y = useCallback(
    (v: number) => PAD.top + innerH - (v / top) * innerH,
    [innerH, top],
  );

  const linePath =
    line<number>()
      .x((_, i) => x(i))
      .y((v) => y(v))
      .curve(curveMonotoneX)(values) ?? "";

  const areaPath =
    area<number>()
      .x((_, i) => x(i))
      .y0(PAD.top + innerH)
      .y1((v) => y(v))
      .curve(curveMonotoneX)(values) ?? "";

  const latest = values[values.length - 1];
  const shown = active === null ? latest : values[active];
  const delta = ((latest - values[0]) / values[0]) * 100;
  const labelStep = Math.ceil(values.length / 7);

  const peak = Math.max(...values);
  const low = Math.min(...values);
  const mean = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const step = innerW / (values.length - 1);
    const index = clamp(
      Math.round((clientX - rect.left - PAD.left) / step),
      0,
      values.length - 1,
    );
    setActive(index);
    setHeld(index);
  };

  return (
    <div className="flex h-full min-h-[640px] w-full flex-col justify-center overflow-y-auto bg-white p-8 sm:p-10 dark:bg-neutral-950">
      <div className={cx(frame, "mx-auto w-full max-w-[880px] space-y-1")}>
        <div className={cx(panel, "px-5 py-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-500">Net revenue</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                <p className="text-3xl font-medium tabular-nums tracking-[-0.02em] text-neutral-900 dark:text-neutral-100">
                  ${grouped(shown)}
                </p>
                {active === null ? (
                  <p className="text-[13px] tabular-nums">
                    <span
                      className={
                        delta >= 0
                          ? "text-emerald-600 dark:text-emerald-500"
                          : "text-red-600 dark:text-red-500"
                      }
                    >
                      {delta >= 0 ? "+" : "−"}
                      {Math.abs(delta).toFixed(1)}%
                    </span>{" "}
                    <span className="text-neutral-500">
                      over {range === "12M" ? "12 months" : `${range} period`}
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] text-neutral-500">
                    {labels[active]}
                  </p>
                )}
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Range"
              className="flex shrink-0 items-center gap-0.5 rounded-[var(--rb-r-lg,10px)] bg-neutral-100 p-1 dark:bg-neutral-800"
            >
              {RANGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={option === range}
                  onClick={() => {
                    setRange(option);
                    setActive(null);
                    setHeld(0);
                  }}
                  className={cx(
                    "inline-flex h-7 cursor-pointer items-center rounded-[var(--rb-r-sm,6px)] px-2.5 text-[13px] tabular-nums",
                    option === range
                      ? "bg-white font-medium text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-neutral-950 dark:text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100",
                    transition,
                    focus,
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={ref}
            role="img"
            tabIndex={0}
            aria-label={`Net revenue over the last ${range}. Latest ${grouped(latest)} dollars.`}
            onPointerMove={(e) => move(e.clientX)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const from = active ?? values.length - 1;
                const index = clamp(
                  from + (e.key === "ArrowLeft" ? -1 : 1),
                  0,
                  values.length - 1,
                );
                setActive(index);
                setHeld(index);
              }
              if (e.key === "Home") {
                setActive(0);
                setHeld(0);
              }
              if (e.key === "End") {
                setActive(values.length - 1);
                setHeld(values.length - 1);
              }
              if (e.key === "Escape") setActive(null);
            }}
            style={{ height: PLOT_H, touchAction: "pan-y" }}
            className={cx(
              "relative mt-4 cursor-crosshair rounded-[var(--rb-r-md,8px)]",
              focus,
            )}
          >
            {width > 0 && (
              <svg
                width={width}
                height={PLOT_H}
                className="overflow-visible text-neutral-900 dark:text-white"
              >
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity={0.1}
                    />
                    <stop
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <clipPath id={clipId}>
                    <rect
                      x={0}
                      y={0}
                      width={width}
                      height={PLOT_H}
                      style={{
                        transform: mounted ? "scaleX(1)" : "scaleX(0)",
                        transformBox: "fill-box",
                        transformOrigin: "left",
                      }}
                      className="transition-transform duration-[420ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
                    />
                  </clipPath>
                </defs>

                {ticks.map((tick) => (
                  <g key={tick}>
                    <line
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={y(tick)}
                      y2={y(tick)}
                      shapeRendering="crispEdges"
                      className="stroke-neutral-200/70 dark:stroke-neutral-800"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={y(tick)}
                      dy={-4}
                      className="fill-neutral-400 text-[11px] tabular-nums"
                    >
                      ${compact(tick)}
                    </text>
                  </g>
                ))}

                {labels.map((labelText, i) =>
                  i % labelStep === 0 ? (
                    <text
                      key={labelText}
                      x={x(i)}
                      y={PLOT_H - 4}
                      textAnchor={i === 0 ? "start" : "middle"}
                      className="fill-neutral-400 text-[11px] tabular-nums"
                    >
                      {labelText}
                    </text>
                  ) : null,
                )}

                <g clipPath={`url(#${clipId})`}>
                  <path d={areaPath} fill={`url(#${fillId})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>

                {active !== null && (
                  <g>
                    <line
                      x1={x(active)}
                      x2={x(active)}
                      y1={PAD.top}
                      y2={PAD.top + innerH}
                      className="stroke-neutral-300 dark:stroke-neutral-700"
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                    <circle
                      cx={x(active)}
                      cy={y(values[active])}
                      r={3.5}
                      strokeWidth={2}
                      className="fill-neutral-900 stroke-white dark:fill-white dark:stroke-neutral-900"
                    />
                  </g>
                )}
              </svg>
            )}

            {width > 0 && (
              <div
                aria-hidden="true"
                style={{
                  left: clamp(x(held), 56, Math.max(width - 56, 56)),
                  top: clamp(y(values[held] ?? 0) - 54, 0, PLOT_H - 58),
                }}
                className={cx(
                  "pointer-events-none absolute -translate-x-1/2 rounded-[var(--rb-r-lg,10px)] border border-neutral-200 bg-white px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] transition-opacity duration-[125ms] ease-out dark:border-neutral-800 dark:bg-neutral-900",
                  active === null ? "opacity-0" : "opacity-100",
                )}
              >
                <p className="whitespace-nowrap text-[11px] text-neutral-500">
                  {labels[held]}
                </p>
                <p className="whitespace-nowrap text-[13px] font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
                  ${grouped(values[held] ?? 0)}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
          {[
            { label: "Peak", value: peak },
            { label: "Daily average", value: mean },
            { label: "Lowest", value: low },
          ].map((stat) => (
            <div key={stat.label} className={cx(panel, "px-4 py-3")}>
              <p className="truncate text-xs text-neutral-500">{stat.label}</p>
              <p className="mt-0.5 text-base font-medium tabular-nums tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
                ${grouped(stat.value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
