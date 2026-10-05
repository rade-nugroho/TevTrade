"use client";

import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus
} from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import type { AppClient } from "../../lib/client";

export function WalletPanel() {
  const client = useClient<AppClient>();
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);

  if (status === "pending") return null;

  if (connected) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm font-mono text-neutral-700 dark:text-neutral-300">
          {connected.account.address.slice(0, 6)}…{connected.account.address.slice(-4)}
        </p>
        <button
          onClick={() => disconnect.dispatch()}
          disabled={disconnect.isRunning}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map((wallet) => (
        <button
          key={wallet.name}
          disabled={connect.isRunning}
          onClick={() => connect.dispatch(wallet)}
          className="px-3 py-1.5 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          Connect {wallet.name}
        </button>
      ))}
    </div>
  );
}