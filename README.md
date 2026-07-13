# RitualProof

On chain media authenticity registry. Upload a piece of media, run a machine learning classifier **inside the blockchain**, and write an immutable verdict (AI generated vs authentic) that anyone can verify forever.

Built on [Ritual Chain](https://ritualfoundation.org), an EVM L1 with native AI/ML precompiles. Chain id `1979`.

## Why it matters

Deepfakes and synthetic media are everywhere, and there is no neutral, tamper proof place to record whether a given file is real. RitualProof turns that judgement into public infrastructure: the verdict is produced by an ONNX model that executes during block execution, then stored on chain keyed by the media's cryptographic hash. No trusted API, no central database, no take backs.

## How it works

```
Browser                              Ritual Chain (1979)
  |                                    |
  |  keccak256(file bytes)             |
  |  extract 10 forensic features      |
  |                                    |
  |  analyze(hash, features, type) ->  MediaRegistry.analyze()
  |                                    |   staticcall
  |                                    v
  |                              ONNX precompile 0x0800
  |                                    |   score (fixed point /1e6)
  |                                    v
  |                              store Record { isAI, score, ... }  (immutable)
```

ONNX inference on Ritual is a **synchronous precompile**: the model runs and returns in the same call, so there is no oracle, no deposit, and no async callback. The verdict is produced inside the transaction, which is what makes it verifiable and permanent.

Because a full image is far too large for calldata, the 10 forensic features (luminance mean and variance, mean RGB, Laplacian energy, gradients, saturation, edge density) are extracted client side, then classified on chain.

## Live deployment

| | |
|---|---|
| Contract | `0x1da9fb28c6f3b43f4d4487e833873cf2856b809a` |
| Explorer | [view on Ritual explorer](https://explorer.ritualfoundation.org/address/0x1da9fb28c6f3b43f4d4487e833873cf2856b809a) |
| Chain id | `1979` |
| RPC | `https://rpc.ritualfoundation.org` |

## Features

- Analyze any image and get an on chain verdict with a model score
- Free preview verdict before you commit (read only `previewScore`)
- Etch the verdict permanently with one transaction
- Verify any file against the registry by its hash
- Live registry of the most recent verdicts

## Tech stack

- **Contract**: Solidity, compiled with solc, deployed with viem (no Foundry required)
- **Frontend**: single page app, ethers v6, GSAP for motion, no build step
- **Chain**: Ritual Chain 1979, ONNX precompile `0x0800`

## Project structure

```
contracts/MediaRegistry.sol   registry + ONNX consumer contract
scripts/                      compile, deploy, smoke test, serve
web/                          cinematic frontend (GSAP)
frontend/                     minimal reference frontend
```

## Run locally

```bash
npm install
npm run compile      # solc build, writes out/ and frontend/abi.js
npm run deploy       # deploy, writes address into .env and web/config.js
npm run web          # http://localhost:5180  (main UI)
```

Get testnet RITUAL from the [faucet](https://faucet.ritualfoundation.org). Connect a wallet in the app and it adds the Ritual network automatically.

## On the classifier

The default model is Ritual's public `sample_linreg` model, used as a stand in scorer. The full pipeline is real and runs on chain; only the model is a placeholder. The owner can swap in a trained deepfake detector with `setModel(string)` and no redeploy, and tune the decision boundary with `setThreshold(int256)`.

## Ritual notes worth knowing

- ONNX (`0x0800`) is synchronous. Call it inside a normal transaction, no deposit or callback.
- Request fixed point output (scale 6) so the model returns a clean scaled integer, `score * 1e6`.
- `block.timestamp` on Ritual is in milliseconds, not seconds.
- Model ids require a full commit hash: `hf/owner/repo/file.onnx@<40 hex>`. The first call to an uncached model triggers a just in time download.

## Security

The private key in `.env` is a testnet faucet key with no real value, and `.env` is gitignored. Never reuse it for anything holding real funds.
