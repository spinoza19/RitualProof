// Smoke test: call the ONNX precompile (0x0800) directly via eth_call with the
// sample model. First call may JIT-download the model (PrecompileError) — retry.
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import {
  ritualChain, ONNX_PRECOMPILE, DEFAULT_MODEL_ID,
  encodeOnnxRequest, decodeFloatOutput, tensor10,
} from './lib.mjs';

const client = createPublicClient({ chain: ritualChain, transport: http() });

const features = [0.5, -0.14, 0.65, 1.52, -0.23, -0.23, 1.58, 0.77, -0.47, 0.54];
const data = encodeOnnxRequest(DEFAULT_MODEL_ID, tensor10(features));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 1; attempt <= 15; attempt++) {
  try {
    const { data: result } = await client.call({ to: ONNX_PRECOMPILE, data });
    const out = decodeFloatOutput(result);
    console.log(`OK (attempt ${attempt}) — model output:`, out);
    process.exit(0);
  } catch (e) {
    const msg = (e.shortMessage || e.message || '').split('\n')[0];
    console.log(`attempt ${attempt}: not ready yet (${msg}) — model likely downloading, waiting...`);
    await sleep(4000);
  }
}
console.error('ONNX precompile did not return within retry budget.');
process.exit(1);
