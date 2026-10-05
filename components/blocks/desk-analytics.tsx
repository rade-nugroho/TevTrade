"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import { DeskEmpty, DeskField, DeskSection } from "@/components/blocks/desk-section";
import type { AppClient } from "@/lib/client";
import {
  fetchDeskFills,
  fetchDeskOrders,
  formatSpendReceive,
  summarizeSession,
  type DeskBookStatus,
  type DeskFill,
  type DeskRulesResult,
  type DeskTradingRule,
} from "@/lib/desk-book";
import { titanSubFromWallet, type TitanOrder } from "@/lib/titan-dca-public";
import { SOLANA_CHAIN, solanaClusterLabel } from "@/lib/solana-cluster";

/**
 * Public RPC status from `GET /api/rpc`.
 */
type RpcStatus = {
  readonly clusterLabel: string;
  readonly provider: "helius" | "public-devnet" | "localnet";
};

/**
 * Personal session analytics: order counts, fills, rule book — no SaaS revenue demos.
 */
export function DeskAnalytics() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [rpcStatus, setRpcStatus] = useState<RpcStatus | null>(null);
  const [rpcReady, setRpcReady] = useState(false);
  const [deskAddress, setDeskAddress] = useState<string | null>(null);
  const [orders, setOrders] = useState<readonly TitanOrder[]>([]);
  const [ordersStatus, setOrdersStatus] = useState<DeskBookStatus>("idle");
  const [ordersMessage, setOrdersMessage] = useState<string | undefined>();
  const [fills, setFills] = useState<readonly DeskFill[]>([]);
  const [fillsLoading, setFillsLoading] = useState(false);
  const [rules, setRules] = useState<readonly DeskTradingRule[]>([]);
  const [rulesStatus, setRulesStatus] = useState<DeskRulesResult["status"] | "loading">("loading");
  const [rulesSummary, setRulesSummary] = useState<string>("");

  const walletAddress = connected?.account.address ?? deskAddress ?? undefined;
  const sub = walletAddress ? titanSubFromWallet(walletAddress) : null;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/rpc")
      .then((response) => response.json())
      .then((payload: RpcStatus & { deskWalletAddress?: string | null }) => {
        if (cancelled) return;
        if (payload?.clusterLabel && payload.provider) setRpcStatus(payload);
        setDeskAddress(payload.deskWalletAddress ?? null);
        setRpcReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setRpcStatus(null);
          setRpcReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshOrders = useCallback(async () => {
    if (!sub) {
      setOrders([]);
      setOrdersStatus("idle");
      setOrdersMessage(undefined);
      setFills([]);
      return;
    }
    setOrdersStatus("loading");
    setFillsLoading(true);
    const result = await fetchDeskOrders(sub);
    setOrders(result.orders);
    setOrdersStatus(result.status);
    setOrdersMessage(result.message);
    if (result.status === "ready" && result.orders.length > 0) {
      setFills(await fetchDeskFills(sub, result.orders));
    } else {
      setFills([]);
    }
    setFillsLoading(false);
  }, [sub]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/desk/rules")
      .then((response) => response.json())
      .then((payload: DeskRulesResult) => {
        if (cancelled) return;
        setRules(payload.rules ?? []);
        setRulesStatus(payload.status);
        setRulesSummary(payload.summary ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setRules([]);
          setRulesStatus("error");
          setRulesSummary("Could not load the TypeDB rule book.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const session = useMemo(() => summarizeSession(orders), [orders]);
  const providerLabel =
    rpcStatus?.provider === "helius"
      ? "Helius"
      : rpcStatus?.provider === "localnet"
        ? "Local validator"
        : "Public devnet";
  const clusterLabel = rpcStatus?.clusterLabel ?? solanaClusterLabel(SOLANA_CHAIN);

  const statusLines = Object.entries(session.byStatus);
  const typeLines = Object.entries(session.byType);
  const bookReady = ordersStatus === "ready" || ordersStatus === "empty";

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6 p-5 sm:p-8">
      <header>
        <h1 className="text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
          Analytics
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
          Personal P&amp;L and session stats from your book — not platform revenue charts.
        </p>
      </header>

      <DeskSection title="Session" description="Cluster and counts from live partner orders only.">
        <dl className="flex flex-col gap-2">
          <DeskField label="Cluster" value={`${clusterLabel} · ${providerLabel}`} />
          <DeskField
            label="Orders"
            mono
            value={!sub || !bookReady ? "—" : String(session.total)}
          />
          <DeskField
            label="Fills"
            mono
            value={!sub || !bookReady || fillsLoading ? "—" : String(fills.length)}
          />
          <DeskField
            label="DCA with cycles"
            mono
            value={!sub || !bookReady ? "—" : String(session.dcaWithCycles)}
          />
          <DeskField
            label="Trailing triggers"
            mono
            value={!sub || !bookReady ? "—" : String(session.trailingWithTrigger)}
          />
        </dl>
        {!rpcReady ? (
          <DeskEmpty>Loading session…</DeskEmpty>
        ) : !sub ? (
          <DeskEmpty>Connect a wallet (or set DESK_WALLET_ADDRESS) to attribute a session book.</DeskEmpty>
        ) : ordersStatus === "unconfigured" ? (
          <DeskEmpty>
            {ordersMessage ??
              "Partner orders API is not configured. Session stats stay empty until TITAN_DCA_* is set."}
          </DeskEmpty>
        ) : ordersStatus === "error" ? (
          <DeskEmpty>{ordersMessage ?? "Could not load session orders."}</DeskEmpty>
        ) : ordersStatus === "empty" ? (
          <DeskEmpty>No orders in this session yet. Stats appear after you confirm partner orders.</DeskEmpty>
        ) : null}
      </DeskSection>

      <DeskSection
        title="Personal P&L"
        description="Spent → received from amountSpent/amountReceived or execution inputAmount/outputAmount."
      >
        {!rpcReady ? (
          <DeskEmpty>Loading fills…</DeskEmpty>
        ) : !sub ? (
          <DeskEmpty>Connect a wallet to attribute fills to your book.</DeskEmpty>
        ) : ordersStatus === "unconfigured" ? (
          <DeskEmpty>P&amp;L stays empty until the partner orders API is configured.</DeskEmpty>
        ) : fillsLoading || ordersStatus === "loading" ? (
          <DeskEmpty>Loading fills…</DeskEmpty>
        ) : fills.length === 0 ? (
          <DeskEmpty>
            No spent/received rows yet. When executions land, each fill shows atoms formatted with mint
            decimals.
          </DeskEmpty>
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {fills.map((fill) => (
              <li
                key={fill.key}
                className="flex flex-col gap-1 rounded-[var(--rb-r-md,8px)] border border-neutral-200/80 px-3 py-2.5 dark:border-neutral-800"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12px] text-neutral-800 dark:text-neutral-200">
                    {fill.executionType ?? fill.orderType}
                  </p>
                  <p className="font-mono text-[11px] text-neutral-500">
                    {fill.executedAt ?? fill.orderId}
                  </p>
                </div>
                <p className="font-mono text-[12px] text-neutral-700 dark:text-neutral-300">
                  {formatSpendReceive(fill)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DeskSection>

      <DeskSection title="By status" description="Counts from real order.status values only.">
        {statusLines.length === 0 ? (
          <DeskEmpty>No status breakdown until orders load.</DeskEmpty>
        ) : (
          <dl className="flex flex-col gap-1.5">
            {statusLines.map(([status, count]) => (
              <DeskField key={status} label={status} mono value={String(count)} />
            ))}
          </dl>
        )}
      </DeskSection>

      <DeskSection title="By order type" description="dca, stop_loss, take_profit, oco, slice.">
        {typeLines.length === 0 ? (
          <DeskEmpty>No order types until the book has rows.</DeskEmpty>
        ) : (
          <dl className="flex flex-col gap-1.5">
            {typeLines.map(([type, count]) => (
              <DeskField key={type} label={type} mono value={String(count)} />
            ))}
          </dl>
        )}
      </DeskSection>

      <DeskSection title="Rule book" description="TypeDB trading rules grounding Decision.">
        {rulesStatus === "loading" ? (
          <DeskEmpty>Loading rules…</DeskEmpty>
        ) : rulesStatus === "unconfigured" ? (
          <DeskEmpty>{rulesSummary || "TypeDB is not configured."}</DeskEmpty>
        ) : rulesStatus === "error" ? (
          <DeskEmpty>{rulesSummary || "TypeDB is unavailable."}</DeskEmpty>
        ) : rulesStatus === "empty" || rules.length === 0 ? (
          <DeskEmpty>{rulesSummary || "No trading rules in the local book."}</DeskEmpty>
        ) : (
          <ul className="flex flex-col gap-3" role="list">
            {rules.map((rule) => (
              <li key={rule.topic} className="flex flex-col gap-1">
                <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                  {rule.topic}
                </p>
                <p className="text-[12px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {rule.stance}
                </p>
                <p className="text-[12px] leading-relaxed text-neutral-500">{rule.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </DeskSection>
    </div>
  );
}
