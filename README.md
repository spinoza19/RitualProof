# RitualProof — On-chain Media Authenticity Registry

Upload media → a small **forensic feature vector** is extracted in the browser →
an **ONNX classifier runs on-chain** via Ritual's synchronous ONNX precompile
(`0x0800`) → an **immutable verdict** (AI-generated vs authentic) is written to
the registry, keyed by the media's `keccak256` hash. Anyone can later verify a
file against the registry.

Built on **Ritual Chain** (EVM L1 with enshrined AI/ML precompiles), chain id **1979**.

## Why Ritual

ONNX inference is a **synchronous precompile** — the model runs during block
execution and returns in the same call. No oracle, no RitualWallet deposit, no
async callback. The verdict is produced *inside* the transaction and is therefore
verifiable and immutable.

## Live deployment (Ritual testnet)

- Contract `MediaRegistry`: **`0x1da9fb28c6f3b43f4d4487e833873cf2856b809a`**
- Explorer: https://explorer.ritualfoundation.org/address/0x1da9fb28c6f3b43f4d4487e833873cf2856b809a
- Default classifier: `hf/Ritual-Net/sample_linreg/linreg_10_features.onnx@fd05016…` (a stand-in)

> The default model is Ritual's public sample linear-regression model, used as a
> placeholder scorer so the whole pipeline is real and runs on-chain. The owner
> hot-swaps a trained deepfake detector via `setModel(string)` — **no redeploy**.
> `setThreshold(int256)` tunes the AI/authentic cut-off (scaled by 1e6).

## Architecture

```
Browser                          Ritual Chain (1979)
────────                         ───────────────────
file ─┐
      ├─ keccak256(bytes) ───────────────────────┐
      └─ extract 10 features ──► analyze(hash,    │
         (canvas / byte stats)      features,     ▼
                                    type, uri) ─► MediaRegistry.analyze()
                                                     │  staticcall
                                                     ▼
                                               ONNX precompile 0x0800
                                                     │  score (fixed-point /1e6)
                                                     ▼
                                               store Record{isAI,score,…}  (immutable)
```

The 10 image features are cheap forensic stats (mean luma, luma σ, mean R/G/B,
Laplacian energy, ∂x/∂y gradients, saturation, edge density). A real detector
would take a richer vector — swap the model and feature extractor together.

## Project layout

```
contracts/MediaRegistry.sol   the on-chain registry + ONNX consumer
scripts/lib.mjs               chain def + ONNX/RitualTensor encode/decode
scripts/compile.mjs           solc-js compile -> out/ + frontend/abi.js
scripts/deploy.mjs            deploy -> writes .env + frontend/config.js
scripts/smoke-onnx.mjs        eth_call sanity check on the precompile
scripts/test-e2e.mjs          previewScore + analyze + read-back
scripts/serve.mjs             static server for the frontend
frontend/                     single-page dapp (ethers v6 UMD, no build step)
```

## Run it

```bash
npm install
npm run compile          # -> out/MediaRegistry.json, frontend/abi.js
npm run deploy           # deploys, writes address to .env + frontend/config.js
npm run smoke            # optional: verify the ONNX precompile responds
npm run frontend         # http://localhost:5173
```

`.env` holds `PRIVATE_KEY` (testnet faucet key) and `RITUAL_RPC_URL`. Get testnet
RITUAL from https://faucet.ritualfoundation.org.

To use MetaMask in the frontend, connect and approve the Ritual network
(chain 1979) — the app adds it automatically.

## Ritual gotchas encountered (and handled)

- **ONNX is synchronous** (`0x0800`): call it inside a normal tx, no deposit/callback.
- **Fixed-point output**: request `outputArithmetic=1, scale=6` so the model
  returns a clean scaled integer (`score * 1e6`) instead of float bit-patterns.
- **`block.timestamp` is in milliseconds** on Ritual (~350ms blocks), not seconds —
  the frontend normalizes before computing "x ago".
- **Model IDs need a full commit hash** (`hf/owner/repo/file.onnx@<40hex>`); branch
  names are rejected. First call to an uncached model JIT-downloads it.

## Security note

The private key in `.env` is a **testnet faucet key with no real value**. Never
reuse it for anything with real funds.
