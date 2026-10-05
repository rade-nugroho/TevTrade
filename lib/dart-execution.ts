import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getAddressDecoder,
  getBase58Decoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  isTransactionSendingSigner,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
  type AccountMeta,
  type Address,
  type AddressesByLookupTableAddress,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import { z } from "zod";
import type { AppClient } from "@/lib/client";
import type { DartSwapInstruction, TitanSwapExecution } from "@/lib/titan-public";

/**
 * Result of an unsigned V0 simulateTransaction for a DART route.
 * Never signs; used so the operator can review RPC feedback before Approve.
 */
export const dartSimulationResultSchema = z.object({
  ok: z.boolean(),
  unitsConsumed: z.number().nullable(),
  logs: z.array(z.string()),
  err: z.string().nullable(),
  note: z.string(),
});

/**
 * Inferred DART simulation result.
 */
export type DartSimulationResult = z.infer<typeof dartSimulationResultSchema>;

/**
 * Size of the address lookup table account header. The stored keys follow it
 * as contiguous 32-byte public keys.
 */
const LOOKUP_TABLE_META_BYTES = 56;

/**
 * Converts one serialized DART instruction into a Kit instruction.
 * `data` arrives base64-encoded; account roles come from the signer/writable flags.
 */
function toKitInstruction(instruction: DartSwapInstruction): Instruction {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.accounts.map<AccountMeta>((meta) => ({
      address: address(meta.pubkey),
      role: meta.isSigner
        ? meta.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : meta.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY,
    })),
    data: getBase64Encoder().encode(instruction.data),
  };
}

/**
 * Fetches one address lookup table and decodes the stored public keys.
 *
 * @param client - Shared Solana Kit client whose `rpc` targets the active cluster.
 * @param tableAddress - Base58 lookup table address returned by DART.
 * @returns The public keys stored in the table.
 */
async function fetchLookupTableAddresses(
  client: AppClient,
  tableAddress: string,
): Promise<readonly Address[]> {
  const response = await client.rpc
    .getAccountInfo(address(tableAddress), { encoding: "base64" })
    .send();
  const account = response.value;
  if (!account) {
    throw new Error(`Address lookup table ${tableAddress} is not on this cluster.`);
  }
  const [encoded] = account.data;
  const raw = getBase64Encoder().encode(encoded);
  const decoder = getAddressDecoder();
  const keys: Address[] = [];
  for (let offset = LOOKUP_TABLE_META_BYTES; offset + 32 <= raw.length; offset += 32) {
    keys.push(decoder.decode(raw.slice(offset, offset + 32)));
  }
  return keys;
}

/**
 * Builds the V0 transaction message for a DART route: compute-budget and swap
 * instructions from the quote, a fee payer, a fresh blockhash, and lookup-table
 * compression when the route carries tables.
 *
 * @param client - Shared Solana Kit client.
 * @param feePayer - Connected Wallet Standard signer or a public fee-payer address.
 * @param execution - Instruction payload carried on the approved quote.
 * @returns A transaction message ready for compile / sign.
 */
export async function buildDartMessage(
  client: AppClient,
  feePayer: TransactionSigner | Address,
  execution: TitanSwapExecution,
) {
  const { value: lifetime } = await client.rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const planned = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) =>
      typeof feePayer === "string"
        ? setTransactionMessageFeePayer(feePayer, draft)
        : setTransactionMessageFeePayerSigner(feePayer, draft),
    (draft) => setTransactionMessageLifetimeUsingBlockhash(lifetime, draft),
    (draft) =>
      appendTransactionMessageInstructions(execution.instructions.map(toKitInstruction), draft),
  );
  if (execution.addressLookupTables.length === 0) return planned;

  const lookups: AddressesByLookupTableAddress = {};
  await Promise.all(
    execution.addressLookupTables.map(async (key) => {
      lookups[address(key)] = [...(await fetchLookupTableAddresses(client, key))];
    }),
  );
  return compressTransactionMessageUsingAddressLookupTables(planned, lookups);
}

/**
 * Builds an unsigned V0 transaction for a DART route and simulates it via RPC.
 * Uses `sigVerify: false` so no Wallet Standard prompt runs.
 *
 * Simulation may fail when the desk RPC is not mainnet (DART ALTs live on mainnet).
 * That failure is surfaced honestly — it is not a fake fill.
 *
 * @param client - Shared Solana Kit client whose RPC targets the active cluster.
 * @param feePayer - Quoting wallet address or connected signer used as fee payer.
 * @param execution - Instruction payload from the quote.
 * @returns Structured simulation outcome for the approval panel.
 */
export async function simulateDartSwap(
  client: AppClient,
  feePayer: TransactionSigner | Address | string,
  execution: TitanSwapExecution,
): Promise<DartSimulationResult> {
  if (execution.instructions.length === 0) {
    return {
      ok: false,
      unitsConsumed: null,
      logs: [],
      err: "no_instructions",
      note: "This quote carries no instructions to simulate.",
    };
  }

  try {
    const payer: TransactionSigner | Address =
      typeof feePayer === "string" ? address(feePayer) : feePayer;
    const message = await buildDartMessage(client, payer, execution);
    const compiled = compileTransaction(message);
    const wire = getBase64EncodedWireTransaction(compiled);
    const { value } = await client.rpc
      .simulateTransaction(wire, {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "confirmed",
      })
      .send();

    const err =
      value.err === null
        ? null
        : typeof value.err === "string"
          ? value.err
          : JSON.stringify(value.err);
    const logs = Array.isArray(value.logs) ? value.logs.filter((line): line is string => typeof line === "string") : [];
    const unitsConsumed =
      typeof value.unitsConsumed === "bigint"
        ? Number(value.unitsConsumed)
        : typeof value.unitsConsumed === "number"
          ? value.unitsConsumed
          : null;

    if (err) {
      return {
        ok: false,
        unitsConsumed,
        logs: logs.slice(-12),
        err,
        note: "Simulation failed on the configured cluster RPC. DART routes expect mainnet accounts; off-cluster desks often fail here until you target the quote chain with a mainnet RPC.",
      };
    }

    return {
      ok: true,
      unitsConsumed,
      logs: logs.slice(-12),
      err: null,
      note: "Unsigned V0 simulation succeeded (sigVerify=false). Review units/logs, then Approve to sign and send.",
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Simulation request failed.";
    return {
      ok: false,
      unitsConsumed: null,
      logs: [],
      err: message,
      note: "Could not simulate on the configured RPC. Approve is still gated; nothing was signed.",
    };
  }
}

/**
 * Signs and sends an approved DART swap through the connected wallet.
 *
 * Wallets that expose `solana:signAndSendTransaction` send via their own RPC.
 * Other wallets sign only; the client then submits through the configured
 * cluster RPC with preflight enabled.
 *
 * @param client - Shared Solana Kit client.
 * @param signer - Connected Wallet Standard signer for the quoting wallet.
 * @param execution - Instruction payload carried on the approved quote.
 * @param abortSignal - Optional signal propagated to the wallet prompt.
 * @returns The sent transaction signature.
 */
export async function executeDartSwap(
  client: AppClient,
  signer: TransactionSigner,
  execution: TitanSwapExecution,
  abortSignal?: AbortSignal,
): Promise<Signature> {
  if (execution.instructions.length === 0) {
    throw new Error("This quote carries no instructions to execute.");
  }
  const message = await buildDartMessage(client, signer, execution);

  if (isTransactionSendingSigner(signer)) {
    const signatureBytes = await signAndSendTransactionMessageWithSigners(message, {
      abortSignal,
    });
    return getBase58Decoder().decode(signatureBytes) as Signature;
  }

  const signed = await signTransactionMessageWithSigners(message, { abortSignal });
  const wire = getBase64EncodedWireTransaction(signed);
  return client.rpc
    .sendTransaction(wire, { encoding: "base64", skipPreflight: false })
    .send();
}
