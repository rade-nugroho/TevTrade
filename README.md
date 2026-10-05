# TevTrade

TevTrade is a local decision desk. A question goes to Ollama. The answer is grounded in trading rules stored in TypeDB and, when a wallet is connected, a SOL balance read through Helius.

The browser never receives `HELIUS_API_KEY`, `OLLAMA_API_KEY`, `TYPEDB_TOKEN`, or `TITAN_API_KEY`. Wallet signing stays in the connected wallet. The Quote view asks Titan for a mainnet route and shows the recommended provider. It does not sign or send the swap.

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

The Decision view is the chat. Quote asks Titan for a mainnet route. Desk, Ledger, Analytics, Operations, and Sidebar are the existing interface blocks.

## Services

| Variable | Role |
| --- | --- |
| `OLLAMA_URL_ENDPOINT` | Ollama host. The default is `http://127.0.0.1:11434`. `OLLAMA_URL_ENPOINT` is still accepted. |
| `OLLAMA_MODEL` | Model name. The default is `tev1:0.8b`, the Ollama tag for togethercomputer/Tev1-0.8B-experimental. |
| `OLLAMA_API_KEY` | Required only for `https://ollama.com`. |
| `HELIUS_URL` | Helius RPC URL, preferably devnet. Empty falls back to public devnet. |
| `HELIUS_API_KEY` | Appended to `HELIUS_URL` when that URL has no `api-key` parameter. |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | Wallet chain. The default is `solana:devnet`. Match this to `HELIUS_URL`. |
| `TYPEDB_URL` | TypeDB HTTP root, such as `http://127.0.0.1:8000`. |
| `TYPEDB_TOKEN` | Bearer token from `POST /v1/signin`. |
| `TYPEDB_DATABASE` | Database name. The default is `tevtrade`. |
| `TITAN_API_KEY` | Titan Developers Portal key. Used only by `POST /api/titan/quote`. |
| `TITAN_API_URL` | Portal root. The default is `https://portal.api.titan.exchange`. |

On the first decision, TevTrade creates the TypeDB database when it is missing, defines `trading-rule`, and inserts three seed rules: position size, uncertainty, and signing.

The desk calls an OpenAI-compatible chat completion. The request sends the Tev1 system instruction, then JSON with `state`, `question`, and 2–24 labeled options. Temperature is 0, `max_tokens` is 8, and thinking is off. The model returns one letter. TevTrade maps that letter to an action key (`add`, `stand_aside`, or `none`). The letter is not a probability, and it is not the sole authority for a trade.

On Ollama 0.35 or later:

```bash
ollama pull tev1:0.8b
```

That tag is about 812 MB. `tev1:4b` uses the same letter interface when `OLLAMA_MODEL=tev1:4b`. Ollama's chat endpoint ignores `chat_template_kwargs`, so the desk also sends `reasoning_effort` `none` to Ollama hosts. That keeps the 8-token budget on the letter.

For vLLM instead of Ollama, serve `togethercomputer/Tev1-0.8B-experimental`, set `OLLAMA_MODEL` to that id, and point `OLLAMA_URL_ENDPOINT` at the server's `/v1` root. The usual vLLM port is 8000, which is also the TypeDB example port, so run one service on that port. This checkpoint is not deployed on Hugging Face Inference Providers.

## Solana client

`lib/client.ts` builds one Kit client with `walletSigner` and `solanaRpc`. Transactions are planned as version 1. The wallet panel shows the cluster, whether the RPC is Helius or public devnet, the connected address, and the SOL balance. A wallet that cannot sign version 1 transactions shows a warning and is not asked to send one from this desk.
