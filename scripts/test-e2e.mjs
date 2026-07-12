// End-to-end: previewScore over sample vectors, then analyze() + read back.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ritualChain, floatToInt32 } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'out', 'MediaRegistry.json'), 'utf8'));
const ADDRESS = process.env.MEDIA_REGISTRY_ADDRESS;

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: ritualChain, transport: http() });
const walletClient = createWalletClient({ account, chain: ritualChain, transport: http() });
const abi = artifact.abi;

const asFeatures = (arr) => arr.map(floatToInt32);

const samples = {
  low:  [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  mid:  [0.5, -0.14, 0.65, 1.52, -0.23, -0.23, 1.58, 0.77, -0.47, 0.54],
  high: [0.9, 0.8, 0.95, 0.7, 0.85, 0.9, 0.75, 0.88, 0.92, 0.8],
};

console.log('=== previewScore calibration ===');
for (const [name, vec] of Object.entries(samples)) {
  const score = await publicClient.readContract({
    address: ADDRESS, abi, functionName: 'previewScore', args: [asFeatures(vec)],
  });
  console.log(`${name.padEnd(5)} -> score ${Number(score) / 1e6}`);
}

console.log('\n=== analyze() + store ===');
const mediaHash = keccak256(toBytes('ritualproof-e2e-' + Date.now()));
const features = asFeatures(samples.high);
const hash = await walletClient.writeContract({
  address: ADDRESS, abi, functionName: 'analyze',
  args: [mediaHash, features, 0, 'ipfs://demo-e2e'],
});
console.log('analyze tx:', hash);
const rcpt = await publicClient.waitForTransactionReceipt({ hash });
console.log('status    :', rcpt.status);

const rec = await publicClient.readContract({
  address: ADDRESS, abi, functionName: 'getRecord', args: [mediaHash],
});
console.log('record    :', {
  exists: rec.exists, isAI: rec.isAI, score: Number(rec.score) / 1e6,
  submitter: rec.submitter, mediaType: rec.mediaType, uri: rec.uri,
});
const total = await publicClient.readContract({ address: ADDRESS, abi, functionName: 'totalRecords' });
console.log('total recs:', total.toString());
