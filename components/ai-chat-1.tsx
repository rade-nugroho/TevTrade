"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Plus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

type Source = { id: string; title: string };

type ToolCall = {
  name: string;
  result: string;
  duration: string;
  done: boolean;
};

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      reasoning?: string;
      tool?: ToolCall;
      text: string;
      sources?: Source[];
    };

const CATCH_UP_MS = 180;
const FLOOR_CPS = 45;

function lastWordBoundary(source: string, cut: number) {
  if (cut >= source.length) return source.length;
  const i = source.lastIndexOf(" ", cut);
  return i === -1 ? 0 : i;
}

function useSmoothedText() {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const targetRef = useRef("");
  const shownRef = useRef(0);
  const endedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;

      const target = targetRef.current;
      const behind = target.length - shownRef.current;

      if (behind > 0) {
        shownRef.current = reduceMotion
          ? target.length
          : Math.min(
              target.length,
              shownRef.current +
                behind * (1 - Math.exp(-dt / CATCH_UP_MS)) +
                (FLOOR_CPS * dt) / 1000,
            );

        const cut = Math.floor(shownRef.current);
        const finished = endedRef.current && cut >= target.length;
        const safe = finished ? target.length : lastWordBoundary(target, cut);
        setText(target.slice(0, safe));
        if (finished) setDone(true);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const push = useCallback((chunk: string) => {
    targetRef.current += chunk;
  }, []);
  const end = useCallback(() => {
    endedRef.current = true;
  }, []);
  const reset = useCallback(() => {
    targetRef.current = "";
    shownRef.current = 0;
    endedRef.current = false;
    setText("");
    setDone(false);
  }, []);

  return { text, done, push, end, reset };
}

function StreamingWords({ text }: { text: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{text}</>;
  const words = text.match(/\S+\s*/g) ?? [];
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="inline-block whitespace-pre-wrap"
        >
          {word}
        </motion.span>
      ))}
    </>
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

function useStickToBottom(scrollRef: RefObject<HTMLDivElement | null>) {
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => {
      const overflowing = el.scrollHeight - el.clientHeight > 1;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = !overflowing || distance < 24;
      stickRef.current = atBottom;
      setShowJump(overflowing && !atBottom);
    };

    const onIntent = (e: WheelEvent | TouchEvent) => {
      const up = "deltaY" in e ? e.deltaY < 0 : true;
      if (!up) return;
      if (el.scrollHeight - el.clientHeight > 1 && el.scrollTop > 0) {
        stickRef.current = false;
      }
    };

    const observer = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
      sync();
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    el.addEventListener("wheel", onIntent, { passive: true });
    el.addEventListener("touchmove", onIntent, { passive: true });
    el.addEventListener("scroll", sync, { passive: true });

    el.scrollTop = el.scrollHeight;
    sync();
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onIntent);
      el.removeEventListener("touchmove", onIntent);
      el.removeEventListener("scroll", sync);
    };
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTop = el.scrollHeight;
  }, []);

  return { showJump, jumpToLatest };
}

const REASONING =
  "The refund total moved with two things last week: a pricing change that " +
  "shipped on the 12th, and a batch of failed renewals that were auto-refunded. " +
  "I checked both before answering.";

const TOOL_RESULT = [
  "reason              count     amount",
  "Renewal failed         84    $6,240",
  "Downgrade credit       31    $1,905",
  "Duplicate charge        9      $612",
  "Customer request        7      $438",
].join("\n");

const ANSWER_ONE =
  "Refunds rose 38% week over week, from $6,730 to $9,290. Almost all of the " +
  "increase came from failed renewals after the card-retry window was shortened " +
  "on the 12th. Downgrade credits were flat, and duplicate charges stayed in the " +
  "single digits.";

const STREAM_TARGET =
  "By plan, Growth accounted for $5,180 of the refunds and Scale for $3,240, " +
  "with Starter under $900. The renewal failures cluster on Growth annual plans " +
  "billed on the 12th, so retrying those cards a day later would recover most of " +
  "the amount.";

const LIVE_ID = "a2";

const INITIAL_MESSAGES: Message[] = [
  { id: "u1", role: "user", text: "Why did refunds spike last week?" },
  {
    id: "a1",
    role: "assistant",
    reasoning: REASONING,
    tool: {
      name: "Searched 1,284 refunds",
      result: TOOL_RESULT,
      duration: "1.2s",
      done: true,
    },
    text: ANSWER_ONE,
    sources: [
      { id: "1", title: "Billing events" },
      { id: "2", title: "Pricing change · Jun 12" },
    ],
  },
  { id: "u2", role: "user", text: "Break it down by plan tier." },
  { id: LIVE_ID, role: "assistant", text: STREAM_TARGET },
];

function ReasoningRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="cursor-pointer -ml-1.5 inline-flex h-7 items-center gap-1 rounded-[var(--rb-r-sm,6px)] px-1.5 text-[13px] text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:hover:bg-neutral-800 dark:hover:text-neutral-300 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
      >
        <ChevronRight
          className={cx(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-150 ease-out",
            open && "rotate-90",
          )}
        />
        Thought for <span className="tabular-nums">4s</span>
      </button>
      {open && (
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-neutral-500">
          {text}
        </p>
      )}
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="cursor-pointer flex h-8 w-full items-center gap-2 rounded-[var(--rb-r-md,8px)] bg-neutral-50 px-2 text-left transition-colors duration-150 ease-out hover:bg-neutral-100 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-neutral-900/60 dark:hover:bg-neutral-800 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
      >
        <ChevronRight
          className={cx(
            "h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform duration-150 ease-out",
            open && "rotate-90",
          )}
        />
        <span className="text-[13px] text-neutral-700 dark:text-neutral-300">
          {tool.name}
        </span>
        <span className="min-w-14 text-xs text-neutral-500">
          {tool.done ? "Done" : "Running"}
        </span>
        <span className="ml-auto text-xs tabular-nums text-neutral-500">
          {tool.duration}
        </span>
      </button>
      {open && (
        <pre className="mt-2 max-h-40 overflow-y-auto rounded-[var(--rb-r-md,8px)] bg-neutral-100 px-3 py-2.5 font-mono text-xs leading-relaxed text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
          {tool.result}
        </pre>
      )}
    </div>
  );
}

function SourceChips({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-neutral-500">Sources</span>
      {sources.map((s) => (
        <span
          key={s.id}
          className="inline-flex h-6 items-center rounded-[var(--rb-r-sm,6px)] bg-neutral-100 px-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        >
          {s.title}
        </span>
      ))}
    </div>
  );
}

export default function AiChat1() {
  const reduced = useReducedMotion();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [stopped, setStopped] = useState(false);
  const [value, setValue] = useState("");
  const [runId, setRunId] = useState(0);

  const { text: streamText, done, push, end, reset } = useSmoothedText();
  const transcript = useScrollFade<HTMLDivElement>();
  const { showJump, jumpToLatest } = useStickToBottom(transcript.ref);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transportRef = useRef<number | null>(null);

  const streaming = !done && !stopped;

  useEffect(() => {
    if (reduced) {
      push(STREAM_TARGET);
      end();
      return;
    }
    const chunks = STREAM_TARGET.match(/\S+\s*/g) ?? [];
    let i = 0;
    transportRef.current = window.setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 3);
      push(chunks.slice(i, i + n).join(""));
      i += n;
      if (i >= chunks.length) {
        end();
        if (transportRef.current) window.clearInterval(transportRef.current);
        transportRef.current = null;
      }
    }, 130);
    return () => {
      if (transportRef.current) window.clearInterval(transportRef.current);
    };
  }, [reduced, push, end, runId]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", text: t },
    ]);
    setValue("");
  }, []);

  const handleStop = useCallback(() => {
    if (transportRef.current) {
      window.clearInterval(transportRef.current);
      transportRef.current = null;
    }
    end();
    setStopped(true);
  }, [end]);

  const handleRegenerate = useCallback(() => {
    reset();
    setStopped(false);
    setRunId((n) => n + 1);
  }, [reset]);

  return (
    <div className="relative flex h-full min-h-[640px] w-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <header className="shrink-0">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1 className="text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
            Revenue assistant
          </h1>
          <span className="text-[13px] text-neutral-500">Atlas</span>
        </div>
      </header>

      <div className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={transcript.ref}
            onScroll={transcript.onScroll}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [overflow-anchor:none]"
          >
            <div className="mt-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6">
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div key={message.id} className="flex">
                      <div className="ml-auto max-w-[85%] rounded-[var(--rb-r-2xl,14px)] bg-neutral-100 px-3.5 py-2.5 text-sm leading-6 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
                        {message.text}
                      </div>
                    </div>
                  );
                }

                const live = message.id === LIVE_ID && streaming;
                const settled = message.id === LIVE_ID && !streaming;

                return (
                  <div key={message.id} className="space-y-3">
                    {message.reasoning && (
                      <ReasoningRow text={message.reasoning} />
                    )}
                    {message.tool && <ToolRow tool={message.tool} />}

                    <p className="max-w-prose text-sm leading-relaxed text-neutral-900 dark:text-neutral-100">
                      {live ? (
                        <StreamingWords text={streamText} />
                      ) : (
                        message.text
                      )}
                    </p>

                    {message.sources && message.sources.length > 0 && (
                      <SourceChips sources={message.sources} />
                    )}

                    {settled && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          className="cursor-pointer inline-flex h-8 items-center gap-1.5 rounded-[var(--rb-r-md,8px)] bg-neutral-100 px-2.5 text-[13px] font-medium text-neutral-700 transition-[transform,background-color,color] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-200 hover:text-neutral-700 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
                        >
                          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                          Regenerate
                        </button>
                        <button
                          type="button"
                          aria-label="Copy reply"
                          className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-neutral-100 text-neutral-600 transition-[transform,background-color,color] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-200 hover:text-neutral-700 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent transition-opacity duration-200 ease-out dark:from-neutral-950",
              transcript.edges.start ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 ease-out dark:from-neutral-950",
              transcript.edges.end ? "opacity-100" : "opacity-0",
            )}
          />

          {showJump && (
            <motion.button
              type="button"
              onClick={jumpToLatest}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="cursor-pointer absolute bottom-3 left-1/2 z-10 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-[var(--rb-r-md,8px)] border border-neutral-200/70 bg-white px-3 text-[13px] font-medium text-neutral-700 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.10)] transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 dark:shadow-none dark:hover:bg-neutral-700 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
            >
              <ArrowDown className="h-3.5 w-3.5 shrink-0" />
              Jump to latest
            </motion.button>
          )}
        </div>

        <div className="w-full shrink-0 px-4 pb-4 sm:px-6">
          <div className="rounded-[var(--rb-r-2xl,14px)] border border-neutral-200 bg-white px-3 pt-3 pb-2 transition-colors focus-within:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:border-neutral-700">
            <div className="flex flex-wrap gap-1.5 pb-2">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-[var(--rb-r-md,8px)] bg-neutral-100 pl-2 pr-1 text-[13px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                <span className="max-w-40 truncate">refunds-week-24.csv</span>
                <button
                  type="button"
                  aria-label="Remove refunds-week-24.csv"
                  className="cursor-pointer inline-flex h-5 w-5 items-center justify-center rounded-[var(--rb-r-xs,4px)] bg-white text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-200 hover:text-neutral-700 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-neutral-900 dark:hover:bg-neutral-700 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
                >
                  <X className="h-3.5 w-3.5 shrink-0" />
                </button>
              </span>
            </div>
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(value);
                }
              }}
              placeholder="Ask anything"
              className="block max-h-40 w-full resize-none bg-transparent text-sm leading-6 text-neutral-900 outline-none placeholder:text-neutral-500 dark:text-neutral-100"
            />
            <div className="flex items-center gap-1 pt-2">
              <button
                type="button"
                aria-label="Add attachment"
                className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-neutral-100 text-neutral-500 transition-[transform,background-color,color] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-200 hover:text-neutral-700 active:scale-[0.97] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
              >
                <Plus className="h-4 w-4 shrink-0" />
              </button>
              <div className="ml-auto flex items-center gap-1">
                {streaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    key="stop"
                    aria-label="Stop generating"
                    className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_90%,transparent)] active:scale-95 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]"
                  >
                    <Square className="h-3.5 w-3.5 shrink-0" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend(value)}
                    key="send"
                    aria-label="Send"
                    disabled={value.trim().length === 0}
                    className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-[var(--rb-r-md,8px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_90%,transparent)] active:scale-95 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] disabled:bg-neutral-200 disabled:text-neutral-400 dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:disabled:bg-neutral-700"
                  >
                    <ArrowUp className="h-4 w-4 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
