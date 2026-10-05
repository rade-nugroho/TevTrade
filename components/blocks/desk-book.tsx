"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { address as solanaAddress } from "@solana/kit";
import { useClient, useRequest } from "@solana/react";
import { DeskEmpty, DeskField, DeskSection } from "@/components/blocks/desk-section";
import type { AppClient } from "@/lib/client";
import {
  fetchDeskBalance,
  fetchDeskFills,
  fetchDeskOrders,
  formatBalanceLines,
  formatCycles,
  formatOrderAmount,
  formatSpendReceive,
  formatTrigger,
  type DeskBookStatus,
  type DeskFill,
} from "@/lib/desk-book";
import {
  formatAtomAmount,
  titanOrderId,
  titanSubFromWallet,
  type TitanMeBalanceResult,
  type TitanOrder,
} from "@/lib/titan-dca-public";
import { mintLabel } from "@/lib/titan-public";
import { formatSol, readLamports, SOLANA_CHAIN, solanaClusterLabel } from "@/lib/solana-cluster";

/**
 * Public RPC status from `GET /api/rpc`.
 */
type RpcStatus = {
  readonly clusterLabel: string;
  readonly provider: "helius" | "public-devnet" | "localnet";
  readonly deskWalletAddress?: string | null;
};

/**
 * Personal desk book: wallet balance, partner positions, fills, withdrawable.
 * Amounts follow Order & Execution Schema (integer strings + mint decimals).
 */
export function DeskBook() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [rpcStatus, setRpcStatus] = useState<RpcStatus | null>(null);
  const [rpcReady, setRpcReady] = useState(false);
  const [orders, setOrders] = useState<readonly TitanOrder[]>([]);
  const [ordersStatus, setOrdersStatus] = useState<DeskBookStatus>("idle");
  const [ordersMessage, setOrdersMessage] = useState<string | undefined>();
  const [fills, setFills] = useState<readonly DeskFill[]>([]);
  const [fillsLoading, setFillsLoading] = useState(false);
  const [balance, setBalance] = useState<TitanMeBalanceResult | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<DeskBookStatus>("idle");
  const [balanceMessage, setBalanceMessage] = useState<string | undefined>();

  const deskAddress = rpcStatus?.deskWalletAddress ?? null;
  const walletAddress = connected?.account.address ?? deskAddress ?? undefined;
  const sub = walletAddress ? titanSubFromWallet(walletAddress) : null;
  const showingDeskOnly = !connected && Boolean(deskAddress);

  const balanceSource = useMemo(
    () =>
      walletAddress
        ? client.rpc.getBalance(solanaAddress(walletAddress), { commitment: "confirmed" })
        : null,
    [client, walletAddress],
  );
  const solBalanceRequest = useRequest(balanceSource, {
    getAbortSignal: () => AbortSignal.timeout(8_000),
  });
  const lamports = readLamports(solBalanceRequest.data);
  const solBalance = lamports === null ? null : formatSol(lamports);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/rpc")
      .then((response) => response.json())
      .then((payload: RpcStatus) => {
        if (cancelled) return;
        if (payload?.clusterLabel && payload.provider) setRpcStatus(payload);
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

  const refreshBook = useCallback(async () => {
    if (!sub) {
      setOrders([]);
      setOrdersStatus("idle");
      setOrdersMessage(undefined);
      setFills([]);
      setBalance(null);
      setBalanceStatus("idle");
      setBalanceMessage(undefined);
      return;
    }

    setOrdersStatus("loading");
    setBalanceStatus("loading");
    setFillsLoading(true);
    const [ordersResult, balanceResult] = await Promise.all([
      fetchDeskOrders(sub),
      fetchDeskBalance(sub),
    ]);
    setOrders(ordersResult.orders);
    setOrdersStatus(ordersResult.status);
    setOrdersMessage(ordersResult.message);
    setBalance(balanceResult.balance);
    setBalanceStatus(balanceResult.status);
    setBalanceMessage(balanceResult.message);

    if (ordersResult.status === "ready" && ordersResult.orders.length > 0) {
      const nextFills = await fetchDeskFills(sub, ordersResult.orders);
      setFills(nextFills);
    } else {
      setFills([]);
    }
    setFillsLoading(false);
  }, [sub]);

  useEffect(() => {
    void refreshBook();
  }, [refreshBook]);

  const providerLabel =
    rpcStatus?.provider === "helius"
      ? "Helius"
      : rpcStatus?.provider === "localnet"
        ? "Local validator"
        : "Public devnet";
  const clusterLabel = rpcStatus?.clusterLabel ?? solanaClusterLabel(SOLANA_CHAIN);
  const balanceLines = balance ? formatBalanceLines(balance) : [];

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6 p-5 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-100">
            Desk
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
            Positions and fills from your partner book. Create new orders in Orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshBook()}
          disabled={!sub || ordersStatus === "loading"}
          className="shrink-0 rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Refresh
        </button>
      </header>

      <DeskSection title="Wallet" description="Connected wallet or read-only DESK_WALLET_ADDRESS.">
        {!rpcReady ? (
          <DeskEmpty>Loading wallet…</DeskEmpty>
        ) : !walletAddress ? (
          <DeskEmpty>Connect a wallet or set DESK_WALLET_ADDRESS to show SOL balance.</DeskEmpty>
        ) : (
          <dl className="flex flex-col gap-2">
            <DeskField
              label="Address"
              mono
              value={`${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}${
                showingDeskOnly ? " · read-only" : ""
              }`}
            />
            <DeskField label="Cluster" value={`${clusterLabel} · ${providerLabel}`} />
            <DeskField
              label="SOL"
              mono
              value={
                solBalanceRequest.status === "fetching"
                  ? "…"
                  : solBalanceRequest.status === "error"
                    ? "unavailable"
                    : (solBalance ?? "—")
              }
            />
          </dl>
        )}
      </DeskSection>

      <DeskSection
        title="Positions"
        description="orderType, status, amountSpent/amountReceived, DCA cycles, currentTriggerPrice."
      >
        {!rpcReady ? (
          <DeskEmpty>Loading positions…</DeskEmpty>
        ) : !sub ? (
          <DeskEmpty>Connect a wallet to load positions for your Titan sub.</DeskEmpty>
        ) : ordersStatus === "loading" ? (
          <DeskEmpty>Loading positions…</DeskEmpty>
        ) : ordersStatus === "unconfigured" ? (
          <DeskEmpty>
            {ordersMessage ??
              "Partner orders API is not configured. Set TITAN_DCA_BASE_URL and TITAN_DCA_API_KEY."}
          </DeskEmpty>
        ) : ordersStatus === "error" ? (
          <DeskEmpty>{ordersMessage ?? "Could not load positions."}</DeskEmpty>
        ) : ordersStatus === "empty" ? (
          <DeskEmpty>No open or historical positions yet. Place one from Orders when ready.</DeskEmpty>
        ) : (
          <ul className="flex flex-col gap-3" role="list">
            {orders.map((order) => {
              const cycles = formatCycles(order);
              const trigger = formatTrigger(order);
              return (
                <li
                  key={titanOrderId(order)}
                  className="rounded-[var(--rb-r-md,8px)] border border-neutral-200/80 px-3 py-3 dark:border-neutral-800"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      {order.orderType}
                    </p>
                    <p className="font-mono text-[11px] text-neutral-500">{order.status}</p>
                  </div>
                  <dl className="mt-2 flex flex-col gap-1.5">
                    <DeskField
                      label="Pair"
                      value={`${mintLabel(order.inputMint)} → ${mintLabel(order.outputMint)}`}
                    />
                    <DeskField label="Spent / received" mono value={formatSpendReceive(order)} />
                    {order.totalAmount ? (
                      <DeskField
                        label="Total"
                        mono
                        value={formatOrderAmount(order.totalAmount, order.inputMint)}
                      />
                    ) : null}
                    {cycles ? <DeskField label="Cycles" mono value={cycles} /> : null}
                    {trigger ? <DeskField label="Trigger" mono value={trigger} /> : null}
                    <DeskField label="Withdraw" value={order.withdrawalStatus} />
                    <DeskField label="Id" mono value={order.id} />
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </DeskSection>

      <DeskSection title="Fills" description="Executions list: inputAmount → outputAmount per cycle/trigger.">
        {!rpcReady ? (
          <DeskEmpty>Loading fills…</DeskEmpty>
        ) : !sub ? (
          <DeskEmpty>Connect a wallet to load fills.</DeskEmpty>
        ) : ordersStatus === "unconfigured" ? (
          <DeskEmpty>Fills stay empty until the partner orders API is configured.</DeskEmpty>
        ) : fillsLoading || ordersStatus === "loading" ? (
          <DeskEmpty>Loading fills…</DeskEmpty>
        ) : fills.length === 0 ? (
          <DeskEmpty>No executions yet. Fills appear after partner orders run cycles.</DeskEmpty>
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
                    {fill.status ? ` · ${fill.status}` : ""}
                  </p>
                  <p className="font-mono text-[11px] text-neutral-500">
                    {fill.executedAt ?? fill.orderId}
                  </p>
                </div>
                <p className="font-mono text-[12px] text-neutral-700 dark:text-neutral-300">
                  {formatSpendReceive(fill)}
                </p>
                {fill.price && typeof fill.priceDecimals === "number" ? (
                  <p className="font-mono text-[11px] text-neutral-500">
                    price {formatAtomAmount(fill.price, fill.priceDecimals)}
                  </p>
                ) : null}
                {fill.txSignature ? (
                  <p className="truncate font-mono text-[11px] text-neutral-500">{fill.txSignature}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DeskSection>

      <DeskSection
        title="Withdrawable"
        description="GET /me/balance → availableToWithdraw per mint (atoms + decimals)."
      >
        {!rpcReady ? (
          <DeskEmpty>Loading balance…</DeskEmpty>
        ) : !sub ? (
          <DeskEmpty>Connect a wallet to check withdrawable balance.</DeskEmpty>
        ) : balanceStatus === "loading" ? (
          <DeskEmpty>Loading balance…</DeskEmpty>
        ) : balanceStatus === "unconfigured" ? (
          <DeskEmpty>
            {balanceMessage ??
              "Partner balance API is not configured. Set TITAN_DCA_BASE_URL and TITAN_DCA_API_KEY."}
          </DeskEmpty>
        ) : balanceStatus === "error" ? (
          <DeskEmpty>{balanceMessage ?? "Could not load partner balance."}</DeskEmpty>
        ) : balanceStatus === "empty" || balanceLines.length === 0 ? (
          <DeskEmpty>No withdrawable partner balance reported yet.</DeskEmpty>
        ) : (
          <ul className="flex flex-col gap-3" role="list">
            {balanceLines.map((line) => (
              <li
                key={line.key}
                className="rounded-[var(--rb-r-md,8px)] border border-neutral-200/80 px-3 py-2.5 dark:border-neutral-800"
              >
                <dl className="flex flex-col gap-1.5">
                  <DeskField label="Available" mono value={line.available} />
                  <DeskField label="Total" mono value={line.total} />
                  <DeskField label="Locked" mono value={line.locked} />
                  <DeskField label="Pending out" mono value={line.pending} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </DeskSection>
    </div>
  );
}
