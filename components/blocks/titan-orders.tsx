"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectedWallet, useSignMessage } from "@solana/kit-plugin-wallet/react";
import {
  getBase58Decoder,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
} from "@solana/kit";
import { useClient } from "@solana/react";
import { TitanOnboardButton } from "@/components/blocks/titan-onboard";
import type { AppClient } from "@/lib/client";
import {
  buildOrderIdempotencyKey,
  buildSiwsMessage,
  readTitanSession,
  titanSubFromWallet,
  writeTitanSession,
  type TitanOnboardResult,
  type TitanOrderConfirmResult,
  type TitanOrderIntentResult,
  type TitanOrderType,
  type TitanSession,
} from "@/lib/titan-dca-public";

const ORDER_TYPES: readonly TitanOrderType[] = [
  "dca",
  "stop_loss",
  "take_profit",
  "oco",
  "slice",
];

/**
 * Partner order create desk: intent preview, deposit sign, confirm, deposit lookup.
 * Config is an open JSON object because per-type fields are not verified in-repo.
 */
export function TitanOrders() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const signMessage = useSignMessage(client);
  const userPubkey = connected?.account.address;
  const [session, setSession] = useState<TitanSession | null>(null);
  const [orderType, setOrderType] = useState<TitanOrderType>("dca");
  const [destination, setDestination] = useState<"external" | "manager">("external");
  const [platformFeeBps, setPlatformFeeBps] = useState("");
  const [configText, setConfigText] = useState('{\n  \n}');
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const [intent, setIntent] = useState<TitanOrderIntentResult | null>(null);
  const [confirm, setConfirm] = useState<TitanOrderConfirmResult | null>(null);
  const [depositLookup, setDepositLookup] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sub = userPubkey ? titanSubFromWallet(userPubkey) : null;
  const idempotencyKey = useMemo(
    () => buildOrderIdempotencyKey(orderType, attemptId),
    [orderType, attemptId],
  );

  useEffect(() => {
    if (!sub) {
      setSession(null);
      return;
    }
    setSession(readTitanSession(sub));
  }, [sub]);

  const onSession = useCallback((next: TitanSession | null) => {
    setSession(next);
  }, []);

  /**
   * Runs SIWS onboard through the same proxy used by the wallet control.
   */
  async function runSiwsOnboard(): Promise<TitanSession> {
    if (!userPubkey || !sub) throw new Error("Connect a wallet first.");
    const message = buildSiwsMessage(userPubkey, sub);
    const signatureBytes = await signMessage.dispatchAsync(new TextEncoder().encode(message));
    const signature = getBase58Decoder().decode(signatureBytes);
    const response = await fetch("/api/titan/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sub, userPubkey, message, signature }),
    });
    const payload = (await response.json()) as TitanOnboardResult | { error?: string; code?: string };
    if (!response.ok || !("userId" in payload)) {
      throw new Error(
        "error" in payload && payload.error
          ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
          : "Onboard failed.",
      );
    }
    writeTitanSession(payload);
    setSession(payload);
    return payload;
  }

  /**
   * Posts an intent, handling USER_PUBKEY_CONFLICT and ONBOARDING_INCOMPLETE.
   */
  async function requestIntent(onboardIfNeeded: true | undefined): Promise<TitanOrderIntentResult> {
    if (!userPubkey || !sub) throw new Error("Connect a wallet first.");

    let config: Record<string, unknown>;
    try {
      const parsed = JSON.parse(configText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config must be a JSON object.");
      }
      config = parsed as Record<string, unknown>;
    } catch (caught) {
      throw new Error(caught instanceof Error ? caught.message : "Config must be valid JSON.");
    }

    const body: Record<string, unknown> = {
      sub,
      orderType,
      userPubkey,
      config,
      idempotencyKey,
    };
    if (onboardIfNeeded === true) body.onboardIfNeeded = true;
    if (destination === "manager") {
      const manager = session?.walletAddress;
      if (!manager) throw new Error("Link Titan first to send output to the manager wallet.");
      body.outputRecipientAddress = manager;
    } else {
      body.outputRecipientAddress = userPubkey;
    }
    if (platformFeeBps.trim()) {
      body.platformFee = { bps: Number(platformFeeBps) };
    }

    const response = await fetch("/api/titan/orders/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as TitanOrderIntentResult | { error?: string; code?: string };

    if (response.status === 409 && "code" in payload && payload.code === "USER_PUBKEY_CONFLICT") {
      await runSiwsOnboard();
      return requestIntent(undefined);
    }
    if (response.status === 409 && "code" in payload && payload.code === "ONBOARDING_INCOMPLETE") {
      await runSiwsOnboard();
      return requestIntent(onboardIfNeeded);
    }
    if (!response.ok || !("pendingOrderId" in payload)) {
      throw new Error(
        "error" in payload && payload.error
          ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
          : "Intent failed.",
      );
    }
    return payload;
  }

  /**
   * Signs the base64 deposit transaction with the connected wallet signer.
   */
  async function signDepositTransaction(base64Tx: string): Promise<string> {
    const signer = connected?.signer;
    if (!signer || !("modifyAndSignTransactions" in signer)) {
      throw new Error("This wallet cannot sign deposit transactions.");
    }
    const txBytes = getBase64Encoder().encode(base64Tx);
    const transaction = getTransactionDecoder().decode(txBytes);
    const [signed] = await signer.modifyAndSignTransactions([transaction]);
    return getBase64Decoder().decode(getTransactionEncoder().encode(signed));
  }

  /**
   * Creates an intent with onboardIfNeeded, then waits for user confirm.
   */
  async function createIntent() {
    setPending(true);
    setError(null);
    setConfirm(null);
    setDepositLookup(null);
    try {
      const next = await requestIntent(true);
      setIntent(next);
    } catch (caught) {
      setIntent(null);
      setError(caught instanceof Error ? caught.message : "Intent failed.");
    } finally {
      setPending(false);
    }
  }

  /**
   * Signs and confirms the pending deposit when still inside the expiry window.
   */
  async function confirmPending() {
    if (!intent || !sub) return;
    const expiresAt = Date.parse(intent.expiresAt);
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
      setError("Intent expired. Request a fresh intent.");
      setIntent(null);
      setAttemptId(crypto.randomUUID());
      return;
    }

    setPending(true);
    setError(null);
    try {
      const signedTransaction = await signDepositTransaction(intent.transaction);
      const response = await fetch("/api/titan/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sub,
          pendingOrderId: intent.pendingOrderId,
          signedTransaction,
          idempotencyKey,
        }),
      });
      const payload = (await response.json()) as TitanOrderConfirmResult | { error?: string; code?: string };
      if (response.status === 409 && "code" in payload && payload.code === "ONBOARDING_INCOMPLETE") {
        await runSiwsOnboard();
        const retry = await fetch("/api/titan/orders/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sub,
            pendingOrderId: intent.pendingOrderId,
            signedTransaction,
            idempotencyKey,
          }),
        });
        const retryPayload = (await retry.json()) as TitanOrderConfirmResult | { error?: string; code?: string };
        if (!retry.ok) {
          throw new Error(
            "error" in retryPayload && retryPayload.error
              ? `${retryPayload.code ? `${retryPayload.code}: ` : ""}${retryPayload.error}`
              : "Confirm failed.",
          );
        }
        setConfirm(retryPayload as TitanOrderConfirmResult);
        setAttemptId(crypto.randomUUID());
        return;
      }
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
            : "Confirm failed.",
        );
      }
      setConfirm(payload as TitanOrderConfirmResult);
      setAttemptId(crypto.randomUUID());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirm failed.");
    } finally {
      setPending(false);
    }
  }

  /**
   * Looks up the recorded deposit for a confirmed order.
   */
  async function lookupDeposit() {
    if (!sub) return;
    const orderId = confirm?.orderId ?? (typeof confirm?.order === "object" && confirm?.order && "id" in confirm.order
      ? String((confirm.order as { id: unknown }).id)
      : intent?.pendingOrderId);
    if (!orderId) {
      setError("No order id available for deposit lookup.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/titan/orders/${encodeURIComponent(orderId)}/deposit?sub=${encodeURIComponent(sub)}`);
      const payload = (await response.json()) as { txSignature?: string; error?: string; code?: string };
      if (!response.ok || !payload.txSignature) {
        throw new Error(payload.error ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}` : "Deposit lookup failed.");
      }
      setDepositLookup(payload.txSignature);
    } catch (caught) {
      setDepositLookup(null);
      setError(caught instanceof Error ? caught.message : "Deposit lookup failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Orders</h1>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            Titan partner intent → sign deposit → confirm. Config fields are unverified JSON; paste only shapes from
            Titan partner docs. Live creates need TITAN_DCA_* env.
          </p>
        </div>
        <TitanOnboardButton onSession={onSession} />
      </div>

      {session ? (
        <p className="font-mono text-xs text-neutral-500">
          userId {session.userId} · manager {session.walletAddress}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">Link Titan once (or let intent onboardIfNeeded try first).</p>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void createIntent();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Order type
          <select
            value={orderType}
            onChange={(event) => {
              setOrderType(event.target.value as TitanOrderType);
              setAttemptId(crypto.randomUUID());
              setIntent(null);
            }}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {ORDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Output destination
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value as "external" | "manager")}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="external">External wallet</option>
            <option value="manager">Manager wallet</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400 sm:col-span-2">
          Platform fee bps (optional)
          <input
            value={platformFeeBps}
            onChange={(event) => setPlatformFeeBps(event.target.value)}
            placeholder="e.g. 50"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400 sm:col-span-2">
          Config JSON (unverified schema)
          <textarea
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
            rows={8}
            spellCheck={false}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <p className="sm:col-span-2 font-mono text-[11px] text-neutral-500">Idempotency {idempotencyKey}</p>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || !userPubkey}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Working…" : "Create intent"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {intent ? (
        <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Intent preview</p>
          <dl className="grid gap-1 font-mono text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-2">
            <div>pendingOrderId {intent.pendingOrderId}</div>
            <div>expiresAt {intent.expiresAt}</div>
            <div>feeLamports {String(intent.feeLamports)}</div>
            <div>output {intent.outputRecipientAddress ?? "—"}</div>
            <div>inputMint {intent.inputMint ?? "—"}</div>
            <div>inputAmount {intent.inputAmount !== undefined ? String(intent.inputAmount) : "—"}</div>
          </dl>
          <button
            type="button"
            disabled={pending}
            onClick={() => void confirmPending()}
            className="mt-2 w-fit rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Sign deposit & confirm
          </button>
        </div>
      ) : null}

      {confirm ? (
        <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Confirmed</p>
          <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
            status {confirm.status ?? "—"} · orderId {confirm.orderId ?? "—"} · tx {confirm.txSignature ?? "—"}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void lookupDeposit()}
            className="w-fit rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Look up deposit
          </button>
          {depositLookup ? (
            <p className="font-mono text-xs text-neutral-500">deposit tx {depositLookup}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
