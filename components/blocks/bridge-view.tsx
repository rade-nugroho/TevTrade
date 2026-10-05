"use client";

import { BridgeConnect } from "@/components/blocks/bridge-connect";
import { DeskEmpty, DeskField, DeskSection } from "@/components/blocks/desk-section";
import { SOLANA_CHAIN, solanaClusterLabel } from "@/lib/solana-cluster";
import {
  resolveWormholeNetwork,
  wormholeBridgeDisabledMessage,
  wormholeBridgeEnabled,
} from "@/lib/wormhole-network";

/**
 * Personal-desk Bridge surface powered by Wormhole Connect (WTT / CCTP).
 * Separate from Automation spot DART and partner Special Orders.
 * Disabled honestly on solana:localnet.
 */
export function BridgeView() {
  const enabled = wormholeBridgeEnabled();
  const network = resolveWormholeNetwork();
  const clusterLabel = solanaClusterLabel(SOLANA_CHAIN);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Bridge
        </h1>
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
          Cross-chain USDC and SOL-style transfers via Wormhole Connect. Approve
          every sign in your wallet. This desk never loads{" "}
          <code className="font-mono text-[11px]">id.json</code>. Automation
          Trade stays on-Solana (DART / Special Orders); Bridge moves assets
          between Solana and EVM.
        </p>
      </div>

      <DeskSection title="Network" description="Wormhole needs Testnet or Mainnet.">
        <dl className="flex flex-col gap-2">
          <DeskField label="Desk cluster" value={clusterLabel} />
          <DeskField
            label="Wormhole"
            value={network ?? "Disabled (localnet)"}
          />
        </dl>
      </DeskSection>

      {enabled ? (
        <DeskSection
          title="Transfer"
          description="Connect routes WTT and CCTP. Wallet Standard Kit remains the desk signer for Quote and Automation; Connect uses its own chain wallets for the bridge."
        >
          <BridgeConnect />
        </DeskSection>
      ) : (
        <DeskSection title="Transfer">
          <DeskEmpty>{wormholeBridgeDisabledMessage()}</DeskEmpty>
        </DeskSection>
      )}
    </div>
  );
}
