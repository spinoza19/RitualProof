// Shared helpers for RitualProof: chain def, ONNX encoding/decoding.
import { defineChain, encodeAbiParameters, decodeAbiParameters, toHex } from 'viem';

export const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org'],
      webSocket: [process.env.RITUAL_WS_URL || 'wss://rpc.ritualfoundation.org/ws'],
    },
  },
  blockExplorers: {
    default: { name: 'Ritual Explorer', url: 'https://explorer.ritualfoundation.org' },
  },
});

export const ONNX_PRECOMPILE = '0x0000000000000000000000000000000000000800';

// Default on-chain classifier: Ritual's public sample linear-regression model
// (10 float inputs -> 1 float output). Swap for a trained detector via setModel().
export const DEFAULT_MODEL_ID =
  'hf/Ritual-Net/sample_linreg/linreg_10_features.onnx@fd0501654c4144a9900a670c5c9a074b6bd3d4ef';

// ---- FLOAT32 <-> int32 bit-pattern helpers (RitualTensor dtype 5) ----
const _buf = new ArrayBuffer(4);
const _f32 = new Float32Array(_buf);
const _i32 = new Int32Array(_buf);
export function floatToInt32(f) { _f32[0] = f; return _i32[0]; }
export function int32ToFloat(i) { _i32[0] = i; return _f32[0]; }

// Encode a RitualTensor (dtype, shape, values) — values already int32 bit-patterns.
export function encodeRitualTensor(dtype, shape, values) {
  return encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint16[]' }, { type: 'int32[]' }],
    [dtype, shape, values]
  );
}

// Encode the full ONNX precompile request for a FLOAT32 model.
export function encodeOnnxRequest(modelId, tensorData) {
  return encodeAbiParameters(
    [
      { type: 'bytes' }, // mlModelId (UTF-8)
      { type: 'bytes' }, // tensorData (RitualTensor)
      { type: 'uint8' }, // inputArithmetic  2 = IEEE754 float
      { type: 'uint8' }, // inputFixedPointScale
      { type: 'uint8' }, // outputArithmetic 2 = IEEE754 float
      { type: 'uint8' }, // outputFixedPointScale
      { type: 'uint8' }, // rounding 1 = half-even
    ],
    [toHex(new TextEncoder().encode(modelId)), tensorData, 2, 0, 2, 0, 1]
  );
}

// Decode precompile output -> array of floats.
export function decodeFloatOutput(result) {
  const [tensorData] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'uint8' }, { type: 'uint8' }, { type: 'uint8' }],
    result
  );
  const [dtype, , values] = decodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint16[]' }, { type: 'int32[]' }],
    tensorData
  );
  if (Number(dtype) !== 5) return values.map(Number);
  return values.map((v) => int32ToFloat(Number(v)));
}

// Build a [1,10] FLOAT32 tensor from 10 plain JS floats.
export function tensor10(features) {
  if (features.length !== 10) throw new Error('expected 10 features');
  return encodeRitualTensor(5, [1, 10], features.map(floatToInt32));
}
