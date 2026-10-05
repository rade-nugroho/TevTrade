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

const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT_H = 380;

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

const wave = (seed: number, i: number) =>
  Math.sin(i * 0.9 + seed) * 0.5 + Math.sin(i * 0.31 + seed * 1.7) * 0.32;

const TARGET_USAGE = 65;

const TIERS = ["All", "Growth", "Enterprise"] as const;
type Tier = (typeof TIERS)[number];

const NAMES = [
  "Northwind Labs",
  "Contoso Retail",
  "Acme Freight",
  "Meridian Health",
  "Lumen Studios",
  "Fabrikam",
  "Cobalt Systems",
  "Redwood Capital",
  "Tallgrass Foods",
  "Aperture Robotics",
  "Vector Logistics",
  "Beacon Insurance",
  "Halcyon Media",
  "Ironclad Security",
  "Solstice Energy",
  "Palisade Bank",
  "Driftwood Travel",
  "Quill Publishing",
  "Verdant Farms",
  "Sable & Co",
  "Anvil Manufacturing",
  "Cirrus Airlines",
  "Marlowe Legal",
  "Petra Ceramics",
  "Onyx Telecom",
  "Wexford Textiles",
];

type Account = {
  i: number;
  name: string;
  seats: number;
  usage: number;
  acv: number;
  tier: Exclude<Tier, "All">;
};

const ACCOUNTS: Account[] = NAMES.map((name, i) => {
  const seats = clamp(Math.round(20 + (wave(1.1, i) + 0.9) * 150), 6, 320);
  const usage = clamp(Math.round(60 + wave(3.3, i) * 42), 12, 96);
  const acv = clamp(
    Math.round(seats * (430 + wave(5.2, i) * 260)),
    4000,
    190_000,
  );
  return {
    i,
    name,
    seats,
    usage,
    acv,
    tier: acv >= 62_000 ? "Enterprise" : "Growth",
  };
});

const ACV_MIN = Math.min(...ACCOUNTS.map((a) => a.acv));
const ACV_MAX = Math.max(...ACCOUNTS.map((a) => a.acv));
const R_MIN = 5;
const R_MAX = 22;

function radiusFor(acv: number) {
  const t =
    (Math.sqrt(acv) - Math.sqrt(ACV_MIN)) /
    (Math.sqrt(ACV_MAX) - Math.sqrt(ACV_MIN) || 1);
  return R_MIN + t * (R_MAX - R_MIN);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default function Analytics14() {
  const uid = useId();
  const clipId = `${uid}-clip`;

  const [tier, setTier] = useState<Tier>("All");
  const [active, setActive] = useState<number | null>(null);
  const [held, setHeld] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [ref, size] = useMeasure<HTMLDivElement>();

  useEffect(() => setMounted(true), []);

  const filtered = useMemo(
    () => ACCOUNTS.filter((a) => tier === "All" || a.tier === tier),
    [tier],
  );
  const byAcv = useMemo(
    () => [...filtered].sort((a, b) => b.acv - a.acv),
    [filtered],
  );
  const medianSeats = useMemo(
    () => median(filtered.map((a) => a.seats)),
    [filtered],
  );

  const width = size.width;
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = PLOT_H - PAD.top - PAD.bottom;

  const seatsMax = Math.max(...ACCOUNTS.map((a) => a.seats));
  const { top: xTop, ticks: xTicks } = useMemo(
    () => niceTicks(seatsMax),
    [seatsMax],
  );
  const yTicks = [0, 25, 50, 75, 100];

  const x = useCallback(
    (seats: number) => PAD.left + (seats / xTop) * innerW,
    [innerW, xTop],
  );
  const y = useCallback(
    (usage: number) => PAD.top + innerH - (usage / 100) * innerH,
    [innerH],
  );

  const isAtRisk = (a: Account) =>
    a.seats > medianSeats && a.usage < TARGET_USAGE;
  const atRiskCount = filtered.filter(isAtRisk).length;

  const activeAccount =
    active === null ? null : (ACCOUNTS.find((a) => a.i === active) ?? null);
  const heldAccount = ACCOUNTS[held];

  const move = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best = -1;
    let bestEdge = Infinity;
    for (const a of filtered) {
      const dist = Math.hypot(x(a.seats) - px, y(a.usage) - py);
      const edge = dist - radiusFor(a.acv);
      if (edge < bestEdge) {
        bestEdge = edge;
        best = a.i;
      }
    }
    if (best >= 0 && bestEdge <= 12) {
      setActive(best);
      setHeld(best);
    } else {
      setActive(null);
    }
  };

  const step = (dir: number) => {
    if (byAcv.length === 0) return;
    const order = byAcv.map((a) => a.i);
    const current = active === null ? -1 : order.indexOf(active);
    const next =
      current === -1
        ? dir > 0
          ? 0
          : order.length - 1
        : clamp(current + dir, 0, order.length - 1);
    setActive(order[next]);
    setHeld(order[next]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      if (byAcv.length) {
        setActive(byAcv[0].i);
        setHeld(byAcv[0].i);
      }
    } else if (e.key === "End") {
      e.preventDefault();
      if (byAcv.length) {
        setActive(byAcv[byAcv.length - 1].i);
        setHeld(byAcv[byAcv.length - 1].i);
      }
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const zones: {
    text: string;
    x: number;
    y: number;
    anchor: "start" | "end";
  }[] =
    width > 0
      ? [
          {
            text: "Healthy",
            x: PAD.left + 4,
            y: PAD.top + 12,
            anchor: "start",
          },
          {
            text: "Expand",
            x: width - PAD.right - 4,
            y: PAD.top + 12,
            anchor: "end",
          },
          {
            text: "Watch",
            x: PAD.left + 4,
            y: PAD.top + innerH - 6,
            anchor: "start",
          },
          {
            text: "At risk",
            x: width - PAD.right - 4,
            y: PAD.top + innerH - 6,
            anchor: "end",
          },
        ]
      : [];

  return (
    <div className="flex h-full min-h-[640px] w-full flex-col justify-center overflow-y-auto bg-white p-8 sm:p-10 dark:bg-neutral-950">
      <div className={cx(frame, "mx-auto w-full max-w-[880px] space-y-1")}>
        <div className={cx(panel, "px-5 py-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
                Account health
              </h2>
              <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                Seats against weekly active usage, sized by contract value.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Plan tier"
              className="flex shrink-0 items-center gap-0.5 rounded-[var(--rb-r-lg,10px)] bg-neutral-100 p-1 dark:bg-neutral-800"
            >
              {TIERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={option === tier}
                  onClick={() => {
                    setTier(option);
                    setActive(null);
                  }}
                  className={cx(
                    "inline-flex h-7 cursor-pointer items-center rounded-[var(--rb-r-sm,6px)] px-2.5 text-[13px]",
                    option === tier
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

          <p className="mt-2 text-[13px] text-neutral-500">
            <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
              {filtered.length}
            </span>{" "}
            accounts ·{" "}
            <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
              {atRiskCount}
            </span>{" "}
            at risk · median{" "}
            <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
              {medianSeats}
            </span>{" "}
            seats
          </p>

          <div
            ref={ref}
            role="img"
            tabIndex={0}
            aria-label={
              activeAccount
                ? `${activeAccount.name}: ${activeAccount.seats} seats, ${activeAccount.usage}% weekly active, $${grouped(activeAccount.acv)} contract value${isAtRisk(activeAccount) ? ", at risk" : ""}`
                : `Account health scatter, ${filtered.length} accounts. Arrow keys step through accounts by contract value.`
            }
            onPointerMove={(e) => move(e.clientX, e.clientY)}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKeyDown}
            style={{ height: PLOT_H, touchAction: "pan-y" }}
            className={cx(
              "relative mt-3 cursor-crosshair rounded-[var(--rb-r-md,8px)]",
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

                {xTicks.map((tick) => (
                  <line
                    key={`vx-${tick}`}
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={PAD.top}
                    y2={PAD.top + innerH}
                    shapeRendering="crispEdges"
                    className="stroke-neutral-200/70 dark:stroke-neutral-800"
                    strokeWidth={1}
                  />
                ))}
                {yTicks.map((tick) => (
                  <g key={`hy-${tick}`}>
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
                      {tick}%
                    </text>
                  </g>
                ))}
                {xTicks.map((tick) =>
                  tick === 0 ? null : (
                    <text
                      key={`xl-${tick}`}
                      x={x(tick)}
                      y={PLOT_H - 4}
                      textAnchor="middle"
                      className="fill-neutral-400 text-[11px] tabular-nums"
                    >
                      {compact(tick)}
                    </text>
                  ),
                )}

                <line
                  x1={x(medianSeats)}
                  x2={x(medianSeats)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  strokeDasharray="4 4"
                  className="stroke-neutral-300 dark:stroke-neutral-600"
                  strokeWidth={1}
                />
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(TARGET_USAGE)}
                  y2={y(TARGET_USAGE)}
                  strokeDasharray="4 4"
                  className="stroke-neutral-300 dark:stroke-neutral-600"
                  strokeWidth={1}
                />

                {zones.map((z) => (
                  <text
                    key={z.text}
                    x={z.x}
                    y={z.y}
                    textAnchor={z.anchor}
                    className="fill-neutral-400 text-[11px]"
                  >
                    {z.text}
                  </text>
                ))}

                <g clipPath={`url(#${clipId})`}>
                  {filtered.map((a) => {
                    const risk = isAtRisk(a);
                    return (
                      <circle
                        key={a.i}
                        cx={x(a.seats)}
                        cy={y(a.usage)}
                        r={radiusFor(a.acv)}
                        fill="currentColor"
                        fillOpacity={active === a.i ? 1 : 0.55}
                        className={cx(
                          "transition-[fill-opacity] duration-150 ease-out motion-reduce:transition-none",
                          risk && "stroke-red-500",
                        )}
                        strokeWidth={risk ? 1.5 : 0}
                      />
                    );
                  })}
                </g>

                {activeAccount && (
                  <circle
                    cx={x(activeAccount.seats)}
                    cy={y(activeAccount.usage)}
                    r={radiusFor(activeAccount.acv) + 3}
                    fill="none"
                    strokeWidth={2}
                    className="stroke-neutral-900 dark:stroke-white"
                  />
                )}
              </svg>
            )}

            {width > 0 && (
              <div
                aria-hidden="true"
                style={{
                  left: clamp(
                    x(heldAccount.seats),
                    88,
                    Math.max(width - 88, 88),
                  ),
                  top: clamp(
                    y(heldAccount.usage) - radiusFor(heldAccount.acv) - 62,
                    4,
                    PLOT_H - 74,
                  ),
                }}
                className={cx(
                  "pointer-events-none absolute -translate-x-1/2 rounded-[var(--rb-r-lg,10px)] border border-neutral-200 bg-white px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] transition-opacity duration-[125ms] ease-out dark:border-neutral-800 dark:bg-neutral-900",
                  active === null ? "opacity-0" : "opacity-100",
                )}
              >
                <p className="whitespace-nowrap text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                  {heldAccount.name}
                </p>
                <p className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-neutral-500">
                  {grouped(heldAccount.seats)} seats · {heldAccount.usage}%
                  active · ${grouped(heldAccount.acv)}
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          className={cx(
            panel,
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3",
          )}
        >
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <span>Contract value</span>
            <svg
              width={92}
              height={24}
              className="overflow-visible text-neutral-400 dark:text-neutral-500"
              aria-hidden="true"
            >
              <circle
                cx={8}
                cy={12}
                r={radiusFor(12_000)}
                fill="currentColor"
                fillOpacity={0.55}
              />
              <circle
                cx={54}
                cy={12}
                r={radiusFor(150_000)}
                fill="currentColor"
                fillOpacity={0.55}
              />
            </svg>
            <span className="tabular-nums">$12k</span>
            <span className="tabular-nums">$150k</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-red-500" />
            At risk: below {TARGET_USAGE}% usage above median seats
          </div>
        </div>
      </div>
    </div>
  );
}