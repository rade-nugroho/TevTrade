# TevTrade

TevTrade is a local decision desk. A question goes to Ollama. The answer is grounded in trading rules stored in TypeDB and, when a wallet is connected, a SOL balance read through Helius.

The browser never receives `HELIUS_API_KEY`, `OLLAMA_API_KEY`, or `TYPEDB_TOKEN`. Wallet signing stays in the connected wallet.

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

The Decision view is the chat. Desk, Ledger, Analytics, Operations, and Sidebar are the existing interface blocks.

## Services

| Variable | Role |
| --- | --- |
| `OLLAMA_URL_ENDPOINT` | Ollama host. The default is `http://127.0.0.1:11434`. `OLLAMA_URL_ENPOINT` is still accepted. |
| `OLLAMA_MODEL` | Model name. The default is the local model `tev1:4b`. |
| `OLLAMA_API_KEY` | Required only for `https://ollama.com`. |
| `HELIUS_URL` | Helius RPC URL, preferably devnet. Empty falls back to public devnet. |
| `HELIUS_API_KEY` | Appended to `HELIUS_URL` when that URL has no `api-key` parameter. |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | Wallet chain. The default is `solana:devnet`. Match this to `HELIUS_URL`. |
| `TYPEDB_URL` | TypeDB HTTP root, such as `http://127.0.0.1:8000`. |
| `TYPEDB_TOKEN` | Bearer token from `POST /v1/signin`. |
| `TYPEDB_DATABASE` | Database name. The default is `tevtrade`. |

On the first decision, TevTrade creates the TypeDB database when it is missing, defines `trading-rule`, and inserts three seed rules: position size, uncertainty, and signing.

The desk asks the local model `tev1:4b` through Ollama's `/v1/systemone` endpoint. That model picks one listed action and returns probabilities. Confirm the tag with `ollama list`. Ollama 0.35 or later is required.

## Solana client

`lib/client.ts` builds one Kit client with `walletSigner` and `solanaRpc`. Transactions are planned as version 1. The wallet panel shows the cluster, whether the RPC is Helius or public devnet, the connected address, and the SOL balance. A wallet that cannot sign version 1 transactions shows a warning and is not asked to send one from this desk.
