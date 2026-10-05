# TevTrade

TevTrade is a local decision desk. A question goes to Ollama. The answer is grounded in trading rules stored in TypeDB and a SOL balance read through Helius (connected Wallet Standard wallet, or optional public `DESK_WALLET_ADDRESS`).

The browser never receives `HELIUS_API_KEY`, `OLLAMA_API_KEY`, `TYPEDB_TOKEN`, `TITAN_API_KEY`, `TITAN_DART_API_KEY`, `TITAN_DCA_API_KEY`, or `TITAN_JWT`. Wallet signing stays in a Wallet Standard extension. Do not import a filesystem keypair (`id.json`) into the desk. The Quote view asks Titan for a mainnet DART route by default (public `/dart`, 1 req/s) and can use Portal or stream Direct quotes. It does not sign or send the swap. **Trade Automation** runs decision → quote/intent → explicit Approve → Wallet Standard sign/send (spot) or deposit confirm (orders). Spot DART execution is refused on non-mainnet clusters unless you explicitly target the quote chain; there is no fake localnet fill. Orders uses one SIWS signature to link the wallet, then intent → sign deposit → confirm. **Bridge** embeds Wormhole Connect for Solana↔EVM transfers (WTT/CCTP); it is disabled on `solana:localnet` and never loads `id.json`.

## Run

1. Copy the environment file and fill in the services you have.

   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies and start the app.

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

The Decision view is the chat. **Automation** is the enabled decision→quote/intent→approve path: Tev1 + TypeDB stance, then either a DART spot quote (routes / expectedWinner, unsigned V0 simulate before Approve) or a Special Order intent (`dca`, `stop_loss`, `take_profit`, `oco`, `slice`), always waiting for human Approve before any Wallet Standard sign. Quote asks Titan DART by default (or Portal when configured) and can open a Direct quote stream. Bridge opens Wormhole Connect (Testnet on Solana devnet/testnet, Mainnet on mainnet; gated off on localnet). Orders runs SIWS onboard plus partner intent/confirm (raw JSON). Desk shows wallet SOL, partner positions/fills, and pause/resume/cancel/withdraw with the same Approve gate when `TITAN_DCA_*` is set. Analytics shows session counts, personal spent→received fills, and the TypeDB rule book — honest empty states when data is missing.

### Automation path (enabled when you approve)

| Step | What happens | Needs |
| --- | --- | --- |
| Decision | Tev1 letter → stance (`add` advances) | Ollama + TypeDB |
| Spot quote | `POST /api/titan/quote` with `includeInstructions` | Public DART (or Portal key) |
| Spot simulate | Build unsigned V0 + `simulateTransaction` (`sigVerify=false`) on desk RPC | Cluster RPC; mainnet ALTs needed for a green sim |
| Spot approve → execute | V0 tx from DART instructions + ALTs; Wallet Standard sign/send | `NEXT_PUBLIC_SOLANA_CLUSTER=solana:mainnet` **or** explicit “target quote chain”; mainnet-funded wallet |
| Order intent | `dca` / `stop_loss` / `take_profit` / `oco` / `slice` config → partner intent | `TITAN_DCA_BASE_URL` + `TITAN_DCA_API_KEY` |
| Order approve → confirm | Wallet Standard signs deposit; server confirms | Same partner keys + connected wallet |
| Lifecycle | Desk pause/resume/cancel/withdraw → Approve if unsigned tx | Same partner keys + connected wallet |

**Unlock live send (single user action):** set `NEXT_PUBLIC_SOLANA_CLUSTER=solana:mainnet` (or check “target quote chain” on a non-mainnet desk) and connect a funded mainnet Wallet Standard wallet, then Approve. For Special Orders / lifecycle, also set `TITAN_DCA_BASE_URL` + `TITAN_DCA_API_KEY` (server-only).

Still blocked without partner credentials: live Special Order intent/confirm/lifecycle (`TITAN_DCA_*` empty in `.env`). Full mainnet spot send also needs a mainnet Wallet Standard wallet and cluster (or explicit quote-chain targeting with an RPC that can submit mainnet txs).

## Services

| Variable | Role |
| --- | --- |
| `OLLAMA_URL_ENDPOINT` | Ollama host. The default is `http://127.0.0.1:11434`. `OLLAMA_URL_ENPOINT` is still accepted. |
| `OLLAMA_MODEL` | Model name. The default is `tev1:0.8b`, the Ollama tag for togethercomputer/Tev1-0.8B-experimental. |
| `OLLAMA_API_KEY` | Required only for `https://ollama.com`. |
| `HELIUS_URL` | Helius RPC URL, preferably devnet. Empty falls back to public devnet. Ignored when the cluster is `solana:localnet`. |
| `HELIUS_API_KEY` | Appended to `HELIUS_URL` when that URL has no `api-key` parameter. |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | Wallet chain. The default is `solana:devnet`. Use `solana:localnet` with a local validator. |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Optional browser RPC. For localnet set `http://127.0.0.1:8899` so the desk does not go through Helius. |
| `TYPEDB_URL` | TypeDB HTTP root, such as `http://127.0.0.1:8000`. |
| `TYPEDB_TOKEN` | Bearer token from `POST /v1/signin` (local default user `admin` / `password`). Restart the app after updating. |
| `TYPEDB_DATABASE` | Database name. The default is `tevtrade`. |
| `DESK_WALLET_ADDRESS` | Optional public Solana address for Decision balance when no extension wallet is connected. Never a secret key. |
| `TITAN_QUOTE_SOURCE` | Quote surface for `POST /api/titan/quote`. Default `dart`. Set `portal` for Developers Portal. |
| `TITAN_DART_URL` | DART API root. Default `https://api.titan.exchange/dart`. Public access needs no key (1 req/s). |
| `TITAN_DART_API_KEY` | Optional DART partner key (`X-API-Key`). Never send a Portal key here. |
| `TITAN_API_KEY` | Developers Portal key. Used only when `TITAN_QUOTE_SOURCE=portal`. |
| `TITAN_API_URL` | Portal root. The default is `https://portal.api.titan.exchange`. |
| `TITAN_DCA_BASE_URL` | Titan DCA partner API root (no trailing slash). Used by onboard and orders proxies. |
| `TITAN_DCA_API_KEY` | Partner key sent as `X-Titan-Key` from the server only. |
| `TITAN_ENDPOINT` | Titan Direct WebSocket host only (no `wss://`). |
| `TITAN_JWT` | Direct auth token for `V1Client.connect`. Never expose to the browser. |
| `NEXT_PUBLIC_WORMHOLE_NETWORK` | Optional Connect network override: `Testnet` or `Mainnet`. Ignored on localnet (Bridge stays disabled). |
| `NEXT_PUBLIC_WORMHOLE_RPC_*` | Optional Connect RPCs for Solana / Ethereum / Base / Arbitrum (public URLs). |
| `NEXT_PUBLIC_WORMHOLE_WALLETCONNECT_PROJECT_ID` | Optional Reown project id for Connect EVM wallets. |

### Bridge (Wormhole Connect)

- **UX** — Sidebar Bridge loads `@wormhole-foundation/wormhole-connect` client-only (`ssr: false`). Default routes are WTT + CCTP for Solana↔EVM USDC/SOL-style transfers. Custom NTT deploy is out of scope.
- **Network** — Maps `solana:mainnet` → Connect Mainnet, `solana:devnet` / `solana:testnet` → Connect Testnet. On `solana:localnet` the widget is not mounted; set a non-local Solana cluster (or `NEXT_PUBLIC_WORMHOLE_NETWORK` when not on localnet) to enable it.
- **Signing** — Connect prompts the operator’s browser wallets. Kit + Wallet Standard remain the desk path for Quote/Automation. Never import `id.json`.
- **Automation Trade** — Spot DART and Special Orders stay on Solana. Bridge is the separate cross-chain funding path.

### Titan partner flows

- **SIWS onboard** — Connect a wallet, click Link Titan. The desk uses the wallet pubkey as `sub`, builds the canonical SIWS message, signs it, and posts to `POST /api/titan/onboard`. Safe to call on every login.
- **Orders** — `POST /api/titan/orders/intent` (optional `onboardIfNeeded: true`) returns a deposit tx and `feeLamports`. Sign and `POST /api/titan/orders/confirm`. On `409 USER_PUBKEY_CONFLICT`, the UI runs SIWS then re-intents without the flag. Idempotency keys are reuse-safe for the same body.
- **Lifecycle** — `POST /api/titan/orders/:orderId/lifecycle` with `{ sub, action }` proxies pause/resume/cancel/withdraw. Desk shows Approve before Wallet Standard signs any returned unsigned tx.
- **Direct quotes** — `POST /api/titan/direct/price` and `POST /api/titan/direct/stream` keep the JWT on the server.

On the first decision, TevTrade creates the TypeDB database when it is missing, defines `trading-rule`, and inserts three seed rules: position size, uncertainty, and signing.

Local TypeDB (Homebrew example):

```bash
typedb --config /opt/homebrew/etc/typedb/config.yml
curl -s http://127.0.0.1:8000/v1/signin \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"password"}'
# Put the returned token in TYPEDB_TOKEN, then restart npm run dev.
```

For a read-only desk balance without connecting an extension, derive the public address only:

```bash
solana-keygen pubkey id.json
# Set DESK_WALLET_ADDRESS to that pubkey. Do not load id.json as a signer.
```

### Local Solana validator

Run a personal desk against `solana-test-validator` (not SaaS RPC):

```bash
# Ledger stays in the repo; both paths are gitignored
solana-test-validator --ledger .validator
# or reuse an existing project ledger: --ledger test-ledger

# Point the app at localnet (restart `npm run dev` after editing .env)
# NEXT_PUBLIC_SOLANA_CLUSTER=solana:localnet
# NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899

# Optional: fund the desk pubkey only (never import id.json as a signer)
solana airdrop 10 "$(solana-keygen pubkey id.json)" --url http://127.0.0.1:8899
```

RPC is `http://127.0.0.1:8899`, faucet `9900`. Stop with `pkill -f solana-test-validator` or kill the process listening on port 8899.

The desk calls an OpenAI-compatible chat completion. The request sends the Tev1 system instruction, then JSON with `state`, `question`, and 2–24 labeled options. Temperature is 0, `max_tokens` is 8, and thinking is off. The model returns one letter. TevTrade maps that letter to an action key (`add`, `stand_aside`, or `none`). The letter is not a probability, and it is not the sole authority for a trade.

On Ollama 0.35 or later:

```bash
ollama pull tev1:0.8b
```

That tag is about 812 MB. `tev1:4b` uses the same letter interface when `OLLAMA_MODEL=tev1:4b`. Ollama's chat endpoint ignores `chat_template_kwargs`, so the desk also sends `reasoning_effort` `none` to Ollama hosts. That keeps the 8-token budget on the letter.

For vLLM instead of Ollama, serve `togethercomputer/Tev1-0.8B-experimental`, set `OLLAMA_MODEL` to that id, and point `OLLAMA_URL_ENDPOINT` at the server's `/v1` root. The usual vLLM port is 8000, which is also the TypeDB example port, so run one service on that port. This checkpoint is not deployed on Hugging Face Inference Providers.

## Solana client

`lib/client.ts` builds one Kit client with `walletSigner` and `solanaRpc`. Transactions are planned as version 1. The wallet panel shows the cluster, whether the RPC is Helius, public devnet, or a local validator, the connected address, and the SOL balance. A wallet that cannot sign version 1 transactions shows a warning and is not asked to send one from this desk.

### Kit + Wallet Standard (not classic Anza adapters)

TevTrade keeps `@solana/kit` + `@solana/kit-plugin-wallet` as the only connect/sign path. Wallet Standard extensions register themselves; Kit discovers them through `@wallet-standard/app` and filters by `NEXT_PUBLIC_SOLANA_CLUSTER` (often `solana:localnet` for this desk).

The Anza [wallet-adapter](https://github.com/anza-xyz/wallet-adapter) monorepo powered the older `@solana/wallet-adapter-*` React stack (`WalletProvider`, `@solana/web3.js` `Connection`). That stack is not added here: modern wallets already speak Wallet Standard, a second provider would fight Kit signing, and Solana’s current frontend guidance prefers Kit hooks over classic adapters for new work. No filesystem keypair (`id.json`) is ever loaded as a browser signer.
