"use client";

import { useEffect, useState } from "react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus,
  WalletReadyGate,
} from "@solana/kit-plugin-wallet/react";
import { address as solanaAddress } from "@solana/kit";
import { useClient } from "@solana/react";
import type { AppClient } from "@/lib/client";
import { formatSol, readLamports, SOLANA_CHAIN, solanaClusterLabel } from "@/lib/solana-cluster";

/**
 * Public RPC status returned by `GET /api/rpc`.
 */
type RpcStatus = {
  readonly clusterLabel: string;
  readonly provider: "helius" | "public-devnet";
};

/**
 * Connects a Wallet Standard wallet and shows the cluster, provider, and SOL balance.
 */
export function WalletPanel() {
  const client = useClient<AppClient>();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <p className="text-xs text-neutral-500">Looking for wallets…</p>;
  }

  return (
    <WalletReadyGate client={client} fallback={<p className="text-xs text-neutral-500">Looking for wallets…</p>}>
      <WalletControls client={client} />
    </WalletReadyGate>
  );
}

/**
 * Wallet controls rendered after Wallet Standard discovery settles.
 */
function WalletControls({ client }: { client: AppClient }) {
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [rpcStatus, setRpcStatus] = useState<RpcStatus | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const canSignV1 = connected?.supportedTransactionVersions.has(1) ?? false;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/rpc")
      .then((response) => response.json())
      .then((payload: RpcStatus) => {
        if (!cancelled && payload?.clusterLabel && payload.provider) setRpcStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setRpcStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const walletAddress = connected?.account.address;
    if (!walletAddress) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void client.rpc
      .getBalance(solanaAddress(walletAddress))
      .send()
      .then((result) => {
        const lamports = readLamports(result);
        if (!cancelled) setBalance(lamports === null ? null : formatSol(lamports));
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, connected]);

  const providerLabel = rpcStatus?.provider === "helius" ? "Helius" : "Public devnet";
  const clusterLabel = rpcStatus?.clusterLabel ?? solanaClusterLabel(SOLANA_CHAIN);

  if (status === "pending") return null;

  if (connected) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="font-mono text-sm text-neutral-700 dark:text-neutral-300">
            {connected.account.address.slice(0, 4)}…{connected.account.address.slice(-4)}
          </p>
          <p className="text-xs text-neutral-500">
            {clusterLabel} · {providerLabel}
            {balance ? ` · ${balance}` : ""}
          </p>
          {canSignV1 ? null : (
            <p className="text-xs text-neutral-500">This wallet cannot sign version 1 transactions yet.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => disconnect.dispatch()}
          disabled={disconnect.isRunning}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <p className="hidden text-xs text-neutral-500 md:block">
        {clusterLabel} · {providerLabel}
      </p>
      {wallets.length === 0 ? (
        <p className="text-xs text-neutral-500">No wallet found</p>
      ) : (
        wallets.map((wallet) => (
          <button
            key={wallet.name}
            type="button"
            disabled={connect.isRunning}
            onClick={() => connect.dispatch(wallet)}
            className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-200 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            Connect {wallet.name}
          </button>
        ))
      )}
    </div>
  );
}
