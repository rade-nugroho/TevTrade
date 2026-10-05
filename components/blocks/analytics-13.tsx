"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

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

const PAD = { top: 12, right: 1, bottom: 20, left: 40 };
const PRICE_H = 330;
const VOL_H = 72;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`
    : Math.abs(n) >= 1_000
      ? `${(n / 1_000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}k`
      : `${n}`;

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

function niceScale(min: number, max: number, count = 3) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) *
    mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step)
    ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
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

const wave = (seed: number, i: number) =>
  Math.sin(i * 0.7 + seed) * 0.5 +
  Math.sin(i * 0.23 + seed * 2.1) * 0.34 +
  Math.sin(i * 1.9 + seed * 0.6) * 0.12;

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

const START = Date.UTC(2024, 0, 2);
const DAY = 86_400_000;

function sessionLabel(i: number, stride: number) {
  const d = new Date(START + i * stride * DAY);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const RANGES = ["30D", "90D", "1Y"] as const;
type Range = (typeof RANGES)[number];
const CONFIG: Record<Range, { count: number; stride: number }> = {
  "30D": { count: 30, stride: 1 },
  "90D": { count: 90, stride: 1 },
  "1Y": { count: 120, stride: 3 },
};

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  label: string;
};

function buildCandles(range: Range): Candle[] {
  const { count, stride } = CONFIG[range];
  const drift = 0.05 / count;
  let price = 128;
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    const close = open * (1 + wave(2.4, i) * 0.02 + drift);
    const high = Math.max(open, close) * (1 + Math.abs(wave(5.1, i)) * 0.013);
    const low = Math.min(open, close) * (1 - Math.abs(wave(3.7, i)) * 0.013);
    const volume = Math.round(2_400_000 * (1 + wave(6.2, i) * 0.42));
    price = close;
    return { open, high, low, close, volume, label: sessionLabel(i, stride) };
  });
}

const money = (v: number) => `$${v.toFixed(2)}`;

export default function Analytics13() {
  const uid = useId();
  const priceClip = `${uid}-price-clip`;
  const volClip = `${uid}-vol-clip`;

  const [range, setRange] = useState<Range>("30D");
  const [active, setActive] = useState<number | null>(null);
  const [held, setHeld] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [ref, size] = useMeasure<HTMLDivElement>();

  useEffect(() => setMounted(true), []);

  const candles = useMemo(() => buildCandles(range), [range]);
  const count = candles.length;

  const width = size.width;
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const priceInnerH = PRICE_H - PAD.top - PAD.bottom;
  const volInnerH = VOL_H - 6;
  const slotW = innerW / count;
  const bodyW = clamp(slotW * 0.6, 1, 14);
  const wickW = clamp(bodyW * 0.5, 1, 1.5);
  const bodyStroke = clamp(bodyW * 0.5, 1, 1.25);

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const { lo, hi, ticks } = useMemo(
    () =>
      niceScale(
        Math.min(...candles.map((c) => c.low)),
        Math.max(...candles.map((c) => c.high)),
        2,
      ),
    [candles],
  );
  const volTop = useMemo(
    () => niceTicks(Math.max(...candles.map((c) => c.volume))).top,
    [candles],
  );

  const cx0 = useCallback((i: number) => PAD.left + slotW * (i + 0.5), [slotW]);
  const yPrice = useCallback(
    (v: number) =>
      PAD.top + priceInnerH - ((v - lo) / (hi - lo || 1)) * priceInnerH,
    [priceInnerH, lo, hi],
  );
  const yVol = useCallback(
    (v: number) => VOL_H - (v / volTop) * volInnerH,
    [volInnerH, volTop],
  );

  const first = candles[0];
  const last = candles[count - 1];
  const periodChange = last.close - first.open;
  const periodPct = (periodChange / first.open) * 100;
  const periodHigh = Math.max(...highs);
  const periodLow = Math.min(...lows);
  const labelStep = Math.ceil(count / 7);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const index = clamp(
      Math.floor((clientX - rect.left - PAD.left) / slotW),
      0,
      count - 1,
    );
    setActive(index);
    setHeld(index);
  };

  const hovered = candles[held];
  const hoveredPct = ((hovered.close - hovered.open) / hovered.open) * 100;
  const tipHalf = 78;

  return (
    <div className="flex h-full min-h-[640px] w-full flex-col justify-center overflow-y-auto bg-white p-8 sm:p-10 dark:bg-neutral-950">
      <div className={cx(frame, "mx-auto w-full max-w-[880px] space-y-1")}>
        <div className={cx(panel, "px-5 py-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-500">
                Compute credits · CMP/USD
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                <p className="text-3xl font-medium tabular-nums tracking-[-0.02em] text-neutral-900 dark:text-neutral-100">
                  {money(last.close)}
                </p>
                <p className="text-[13px] tabular-nums">
                  <span
                    className={
                      periodChange >= 0
                        ? "text-emerald-600 dark:text-emerald-500"
                        : "text-red-600 dark:text-red-500"
                    }
                  >
                    {periodChange >= 0 ? "+" : "−"}$
                    {Math.abs(periodChange).toFixed(2)} (
                    {periodChange >= 0 ? "+" : "−"}
                    {Math.abs(periodPct).toFixed(2)}%)
                  </span>{" "}
                  <span className="text-neutral-500">over {range}</span>
                </p>
              </div>
              <p className="mt-1 text-xs tabular-nums text-neutral-500">
                Period high {money(periodHigh)} · low {money(periodLow)}
              </p>
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
            aria-label={`Compute-credit price, ${range}. Latest close ${money(
              last.close,
            )}, ${periodPct >= 0 ? "up" : "down"} ${Math.abs(periodPct).toFixed(
              1,
            )} percent over the period.`}
            onPointerMove={(e) => move(e.clientX)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const from = active ?? count - 1;
                const index = clamp(
                  from + (e.key === "ArrowLeft" ? -1 : 1),
                  0,
                  count - 1,
                );
                setActive(index);
                setHeld(index);
              }
              if (e.key === "Home") {
                setActive(0);
                setHeld(0);
              }
              if (e.key === "End") {
                setActive(count - 1);
                setHeld(count - 1);
              }
              if (e.key === "Escape") setActive(null);
            }}
            style={{ touchAction: "pan-y" }}
            className={cx(
              "relative mt-4 cursor-crosshair rounded-[var(--rb-r-md,8px)]",
              focus,
            )}
          >
            {width > 0 && (
              <>
                <svg
                  width={width}
                  height={PRICE_H}
                  className="block overflow-visible text-neutral-900 dark:text-white"
                >
                  <defs>
                    <clipPath id={priceClip}>
                      <rect
                        x={0}
                        y={0}
                        width={width}
                        height={PRICE_H}
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
                        y1={yPrice(tick)}
                        y2={yPrice(tick)}
                        shapeRendering="crispEdges"
                        className="stroke-neutral-200/70 dark:stroke-neutral-800"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={yPrice(tick)}
                        dy={-4}
                        className="fill-neutral-400 text-[11px] tabular-nums"
                      >
                        ${compact(tick)}
                      </text>
                    </g>
                  ))}

                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={yPrice(first.open)}
                    y2={yPrice(first.open)}
                    strokeDasharray="4 4"
                    className="stroke-neutral-300 dark:stroke-neutral-600"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={width - PAD.right}
                    y={yPrice(first.open)}
                    dy={-4}
                    textAnchor="end"
                    className="fill-neutral-400 text-[11px] tabular-nums"
                  >
                    Open {money(first.open)}
                  </text>

                  {active !== null && (
                    <line
                      x1={cx0(active)}
                      x2={cx0(active)}
                      y1={PAD.top}
                      y2={PAD.top + priceInnerH}
                      className="stroke-neutral-200 dark:stroke-neutral-800"
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                  )}

                  {candles.map((candle, i) => {
                    const up = candle.close >= candle.open;
                    const bodyTop = yPrice(Math.max(candle.open, candle.close));
                    const bodyBottom = yPrice(
                      Math.min(candle.open, candle.close),
                    );
                    const bodyH = Math.max(1, bodyBottom - bodyTop);
                    const dim = active !== null && active !== i;
                    return (
                      <g
                        key={i}
                        clipPath={`url(#${priceClip})`}
                        style={{ opacity: dim ? 0.45 : 1 }}
                        className="transition-opacity duration-150 ease-out motion-reduce:transition-none"
                      >
                        <line
                          x1={cx0(i)}
                          x2={cx0(i)}
                          y1={yPrice(candle.high)}
                          y2={yPrice(candle.low)}
                          stroke="currentColor"
                          strokeWidth={wickW}
                        />
                        <rect
                          x={cx0(i) - bodyW / 2}
                          y={bodyTop}
                          width={bodyW}
                          height={bodyH}
                          stroke="currentColor"
                          strokeWidth={up ? bodyStroke : 0}
                          className={
                            up
                              ? "fill-white dark:fill-neutral-900"
                              : "fill-neutral-900 dark:fill-white"
                          }
                        />
                      </g>
                    );
                  })}
                </svg>

                <svg
                  width={width}
                  height={VOL_H}
                  className="mt-1 block overflow-visible text-neutral-900 dark:text-white"
                >
                  <defs>
                    <clipPath id={volClip}>
                      <rect
                        x={0}
                        y={0}
                        width={width}
                        height={VOL_H}
                        style={{
                          transform: mounted ? "scaleX(1)" : "scaleX(0)",
                          transformBox: "fill-box",
                          transformOrigin: "left",
                        }}
                        className="transition-transform duration-[420ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
                      />
                    </clipPath>
                  </defs>

                  <text x={0} y={10} className="fill-neutral-400 text-[11px]">
                    Volume
                  </text>

                  <g clipPath={`url(#${volClip})`}>
                    {candles.map((candle, i) => {
                      const barY = yVol(candle.volume);
                      const activeBar = active === i;
                      return (
                        <rect
                          key={i}
                          x={cx0(i) - bodyW / 2}
                          y={barY}
                          width={bodyW}
                          height={Math.max(1, VOL_H - barY)}
                          className={
                            activeBar
                              ? "fill-neutral-900 dark:fill-white"
                              : "fill-neutral-200 dark:fill-neutral-800"
                          }
                        />
                      );
                    })}
                  </g>
                </svg>

                <svg
                  width={width}
                  height={16}
                  className="block overflow-visible"
                >
                  {candles.map((candle, i) =>
                    i % labelStep === 0 ? (
                      <text
                        key={i}
                        x={cx0(i)}
                        y={11}
                        textAnchor={i === 0 ? "start" : "middle"}
                        className="fill-neutral-400 text-[11px] tabular-nums"
                      >
                        {candle.label}
                      </text>
                    ) : null,
                  )}
                </svg>

                <div
                  aria-hidden="true"
                  style={{
                    left: clamp(
                      cx0(held),
                      tipHalf,
                      Math.max(width - tipHalf, tipHalf),
                    ),
                    top: PAD.top,
                  }}
                  className={cx(
                    "pointer-events-none absolute w-[150px] -translate-x-1/2 rounded-[var(--rb-r-lg,10px)] border border-neutral-200 bg-white px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] transition-opacity duration-[125ms] ease-out dark:border-neutral-800 dark:bg-neutral-900",
                    active === null ? "opacity-0" : "opacity-100",
                  )}
                >
                  <p className="text-[11px] text-neutral-500">
                    {hovered.label}
                  </p>
                  <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
                    <span className="text-neutral-500">Open</span>
                    <span className="text-right text-neutral-900 dark:text-neutral-100">
                      {money(hovered.open)}
                    </span>
                    <span className="text-neutral-500">High</span>
                    <span className="text-right text-neutral-900 dark:text-neutral-100">
                      {money(hovered.high)}
                    </span>
                    <span className="text-neutral-500">Low</span>
                    <span className="text-right text-neutral-900 dark:text-neutral-100">
                      {money(hovered.low)}
                    </span>
                    <span className="text-neutral-500">Close</span>
                    <span className="text-right text-neutral-900 dark:text-neutral-100">
                      {money(hovered.close)}
                    </span>
                  </div>
                  <p
                    className={cx(
                      "mt-1 text-right text-[11px] tabular-nums",
                      hoveredPct >= 0
                        ? "text-emerald-600 dark:text-emerald-500"
                        : "text-red-600 dark:text-red-500",
                    )}
                  >
                    {hoveredPct >= 0 ? "+" : "−"}
                    {Math.abs(hoveredPct).toFixed(2)}%
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
