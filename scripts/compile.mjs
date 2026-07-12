// Compile MediaRegistry.sol with solc-js -> out/MediaRegistry.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'contracts', 'MediaRegistry.sol');
const source = fs.readFileSync(srcPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'MediaRegistry.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let fatal = false;
  for (const e of output.errors) {
    console.log(e.formattedMessage);
    if (e.severity === 'error') fatal = true;
  }
  if (fatal) { console.error('Compilation failed.'); process.exit(1); }
}

const c = output.contracts['MediaRegistry.sol']['MediaRegistry'];
const artifact = {
  contractName: 'MediaRegistry',
  abi: c.abi,
  bytecode: '0x' + c.evm.bytecode.object,
  compiler: solc.version(),
};

const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'MediaRegistry.json'), JSON.stringify(artifact, null, 2));

// Also drop the ABI where the frontend can read it.
const feDir = path.join(root, 'frontend');
fs.mkdirSync(feDir, { recursive: true });
fs.writeFileSync(
  path.join(feDir, 'abi.js'),
  'export const MEDIA_REGISTRY_ABI = ' + JSON.stringify(c.abi, null, 2) + ';\n'
);

console.log('Compiled with', solc.version());
console.log('Bytecode size:', (c.evm.bytecode.object.length / 2), 'bytes');
console.log('Wrote out/MediaRegistry.json and frontend/abi.js');
