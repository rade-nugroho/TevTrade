"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  RefreshCw,
  Square,
} from "lucide-react";
import { decisionEventSchema } from "@/lib/decision-schema";
import type { AppClient } from "@/lib/client";

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
  const [done, setDone] = useState(true);
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
      } else if (endedRef.current && shownRef.current >= target.length) {
        setDone(true);
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
    if (shownRef.current >= targetRef.current.length) setDone(true);
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

const GREETING =
  "Ask for a decision. TevTrade reads the TypeDB rule book, checks the connected wallet through Helius, and answers with the local Ollama model. This desk does not sign transactions or ask for a seed phrase.";

const INITIAL_MESSAGES: Message[] = [
  {
    id: "a0",
    role: "assistant",
    text: GREETING,
    sources: [
      { id: "typedb", title: "TypeDB" },
      { id: "ollama", title: "Ollama" },
      { id: "helius", title: "Helius" },
    ],
  },
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
        Notes
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

/**
 * Applies one NDJSON decision event to the live assistant message.
 */
function consumeDecisionLine(
  line: string,
  id: string,
  started: number,
  push: (text: string) => void,
  append: (text: string) => void,
  setMessages: (update: (current: Message[]) => Message[]) => void,
) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return;
  }
  const parsed = decisionEventSchema.safeParse(payload);
  if (!parsed.success) return;
  const event = parsed.data;
  if (event.type === "token") {
    append(event.text);
    push(event.text);
    return;
  }
  if (event.type === "context") {
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    setMessages((current) =>
      current.map((message) =>
        message.id === id && message.role === "assistant"
          ? {
              ...message,
              tool: {
                name: "Read decision rules",
                result: event.summary,
                duration: `${elapsed}s`,
                done: true,
              },
            }
          : message,
      ),
    );
    return;
  }
  if (event.type === "error") throw new Error(event.message);
}

export default function AiChat1() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [stopped, setStopped] = useState(false);
  const [value, setValue] = useState("");
  const [liveId, setLiveId] = useState<string | null>(null);

  const { text: streamText, done, push, end, reset } = useSmoothedText();
  const transcript = useScrollFade<HTMLDivElement>();
  const { showJump, jumpToLatest } = useStickToBottom(transcript.ref);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const walletRef = useRef<string | undefined>(undefined);
  const fullTextRef = useRef("");
  messagesRef.current = messages;
  walletRef.current = connected?.account.address;

  const streaming = !done && !stopped;

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const runDecision = useCallback(
    async (history: { role: "user" | "assistant"; text: string }[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const id = `a-${Date.now()}`;
      const started = performance.now();
      fullTextRef.current = "";
      reset();
      setStopped(false);
      setLiveId(id);
      setMessages((current) => [
        ...current,
        {
          id,
          role: "assistant",
          text: "",
          reasoning: "Reading the TypeDB rule book, then asking the local model.",
          tool: {
            name: "Read decision rules",
            result: "Waiting for TypeDB, Helius, and Ollama.",
            duration: "—",
            done: false,
          },
          sources: [
            { id: "typedb", title: "TypeDB" },
            { id: "ollama", title: "Ollama" },
            { id: "helius", title: "Helius" },
          ],
        },
      ]);

      const finishText = (text: string) => {
        fullTextRef.current = text;
        setMessages((current) =>
          current.map((message) =>
            message.id === id && message.role === "assistant" ? { ...message, text } : message,
          ),
        );
      };

      try {
        const response = await fetch("/api/decision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history,
            walletAddress: walletRef.current,
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`The decision request failed (${response.status}).`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value: chunk, done: finished } = await reader.read();
          if (finished) break;
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            consumeDecisionLine(line, id, started, push, (text) => {
              fullTextRef.current += text;
            }, setMessages);
          }
        }
        consumeDecisionLine(buffer, id, started, push, (text) => {
          fullTextRef.current += text;
        }, setMessages);
        const answer = fullTextRef.current.trim() || "The model returned an empty decision.";
        if (!fullTextRef.current.trim()) push(answer);
        finishText(answer);
        end();
      } catch (error) {
        if (controller.signal.aborted) {
          finishText(fullTextRef.current);
          end();
          return;
        }
        const message = error instanceof Error ? error.message : "The decision model failed.";
        if (!fullTextRef.current) push(message);
        finishText(fullTextRef.current || message);
        end();
      }
    },
    [end, push, reset],
  );

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const history = [
        ...messagesRef.current
          .filter((message) => message.text.trim().length > 0)
          .map((message) => ({ role: message.role, text: message.text })),
        { role: "user" as const, text: trimmed },
      ];
      setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
      setValue("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      void runDecision(history);
    },
    [runDecision, streaming],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    end();
    setStopped(true);
  }, [end]);

  const handleRegenerate = useCallback(() => {
    const history = messagesRef.current
      .filter((message) => message.text.trim().length > 0)
      .map((message) => ({ role: message.role, text: message.text }));
    while (history.length > 0 && history[history.length - 1]?.role === "assistant") {
      history.pop();
    }
    if (history.length === 0 || history[history.length - 1]?.role !== "user") return;
    setMessages((current) => {
      const next = [...current];
      while (next.length > 0 && next[next.length - 1]?.role === "assistant") next.pop();
      return next;
    });
    void runDecision(history);
  }, [runDecision]);

  return (
    <div className="relative flex h-full min-h-[640px] w-full flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <header className="shrink-0">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1 className="text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
            Decision model
          </h1>
          <span className="text-[13px] text-neutral-500">TevTrade</span>
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

                const live = message.id === liveId && streaming;
                const settled = message.id === liveId && !streaming;

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
                          onClick={() => {
                            const text = message.role === "assistant" ? message.text || streamText : "";
                            void navigator.clipboard.writeText(text);
                          }}
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
