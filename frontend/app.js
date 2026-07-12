// RitualProof frontend logic. Uses ethers v6 (loaded as a UMD global).
import { CONTRACT_ADDRESS, RPC_URL, EXPLORER } from './config.js';
import { MEDIA_REGISTRY_ABI } from './abi.js';

const RITUAL_CHAIN_ID = 1979;
const RITUAL_HEX = '0x7bb';
const $ = (id) => document.getElementById(id);

// ---- clients ----
const readProvider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: RITUAL_CHAIN_ID, name: 'ritual',
});
const readContract = new ethers.Contract(CONTRACT_ADDRESS, MEDIA_REGISTRY_ABI, readProvider);

let signer = null;
let writeContract = null;
let threshold = 1_000_000n;

$('ctrLink').textContent = CONTRACT_ADDRESS;
$('ctrLink').href = `${EXPLORER}/address/${CONTRACT_ADDRESS}`;

// ---- float32 bit-pattern helpers (RitualTensor dtype 5) ----
const _b = new ArrayBuffer(4), _f = new Float32Array(_b), _i = new Int32Array(_b);
const floatToInt32 = (x) => { _f[0] = x; return _i[0]; };

// ---- feature extraction ----
async function extractFeatures(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const hash = ethers.keccak256(buf);
  let features;
  let thumb = null;
  if (file.type.startsWith('image/')) {
    ({ features, thumb } = await imageFeatures(file));
  } else if (file.type.startsWith('video/')) {
    ({ features, thumb } = await videoFeatures(file));
  } else {
    features = byteFeatures(buf);
  }
  return { hash, features, int32: features.map(floatToInt32), thumb };
}

function featuresFromImageData(data, w, h) {
  const n = w * h;
  const luma = new Float32Array(n);
  let sumR = 0, sumG = 0, sumB = 0, sumL = 0, sumL2 = 0, sumSat = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = L;
    sumR += r; sumG += g; sumB += b; sumL += L; sumL2 += L * L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sumSat += mx === 0 ? 0 : (mx - mn) / mx;
  }
  const meanL = sumL / n;
  const varL = Math.max(0, sumL2 / n - meanL * meanL);
  let sLap = 0, sGx = 0, sGy = 0, edges = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = Math.abs(luma[idx + 1] - luma[idx - 1]);
      const gy = Math.abs(luma[idx + w] - luma[idx - w]);
      const lap = Math.abs(4 * luma[idx] - luma[idx - 1] - luma[idx + 1] - luma[idx - w] - luma[idx + w]);
      sGx += gx; sGy += gy; sLap += lap;
      if ((gx + gy) / 2 > 20) edges++;
      cnt++;
    }
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return [
    clamp01(meanL / 255),
    clamp01(Math.sqrt(varL) / 128),
    clamp01(sumR / n / 255),
    clamp01(sumG / n / 255),
    clamp01(sumB / n / 255),
    clamp01(sLap / cnt / 255),
    clamp01(sGx / cnt / 255),
    clamp01(sGy / cnt / 255),
    clamp01(sumSat / n),
    clamp01(edges / cnt),
  ];
}

function drawToCanvas(source, W = 128, H = 128) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, W, H);
  return { canvas: c, data: ctx.getImageData(0, 0, W, H).data };
}

function imageFeatures(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { canvas, data } = drawToCanvas(img);
      resolve({ features: featuresFromImageData(data, 128, 128), thumb: canvas });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function videoFeatures(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    v.onloadeddata = () => { v.currentTime = Math.min(0.1, v.duration || 0.1); };
    v.onseeked = () => {
      const { canvas, data } = drawToCanvas(v);
      resolve({ features: featuresFromImageData(data, 128, 128), thumb: canvas });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = reject;
    v.src = URL.createObjectURL(file);
  });
}

function byteFeatures(buf) {
  const N = Math.min(buf.length, 65536);
  const hist = new Array(256).fill(0);
  let sum = 0, sum2 = 0, zero = 0, high = 0, ascii = 0, ff = 0, dsum = 0;
  for (let i = 0; i < N; i++) {
    const v = buf[i];
    hist[v]++; sum += v; sum2 += v * v;
    if (v === 0) zero++;
    if (v > 200) high++;
    if (v >= 32 && v < 127) ascii++;
    if (v === 255) ff++;
    if (i > 0) dsum += Math.abs(v - buf[i - 1]);
  }
  const mean = sum / N;
  const varr = Math.max(0, sum2 / N - mean * mean);
  let ent = 0, uniq = 0;
  for (let k = 0; k < 256; k++) if (hist[k] > 0) { const p = hist[k] / N; ent -= p * Math.log2(p); uniq++; }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return [
    clamp01(mean / 255), clamp01(Math.sqrt(varr) / 128), clamp01(ent / 8),
    clamp01(zero / N), clamp01(high / N), clamp01(ascii / N),
    clamp01(dsum / N / 255), clamp01(uniq / 256), clamp01(ff / N),
    clamp01(Math.log2(buf.length + 1) / 24),
  ];
}

// ---- helpers ----
const FEAT_NAMES = ['lum', 'σlum', 'R', 'G', 'B', 'lap', '∂x', '∂y', 'sat', 'edge'];
const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const TYPE = ['Image', 'Video', 'Audio'];
function ago(ts) {
  // Ritual block timestamps are in milliseconds (~350ms blocks); normalize.
  let t = Number(ts);
  if (t > 1e12) t = Math.floor(t / 1000);
  const s = Math.floor(Date.now() / 1000) - t;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---- banner / model info ----
async function loadModel() {
  try {
    const [modelId, thr, total] = await Promise.all([
      readContract.modelId(), readContract.threshold(), readContract.totalRecords(),
    ]);
    threshold = thr;
    $('modelBanner').innerHTML =
      `On-chain classifier: <span class="mono">${modelId}</span> · ` +
      `threshold <b>${Number(thr) / 1e6}</b> · <b>${total}</b> records registered. ` +
      `Inference runs inside the ONNX precompile (0x0800) during block execution.`;
  } catch (e) {
    $('modelBanner').textContent = 'Could not reach contract: ' + (e.shortMessage || e.message);
  }
}

// ---- registry table ----
async function loadRegistry() {
  try {
    const [hashes, records] = await readContract.recent(25n);
    const total = await readContract.totalRecords();
    $('regCount').textContent = `· ${total} total`;
    if (hashes.length === 0) {
      $('regBody').innerHTML = '<tr><td colspan="6" style="color:var(--muted)">No records yet — be the first.</td></tr>';
      return;
    }
    $('regBody').innerHTML = hashes.map((h, i) => {
      const r = records[i];
      const v = r.isAI ? '<span class="pill ai">AI</span>' : '<span class="pill real">AUTHENTIC</span>';
      return `<tr>
        <td class="mono"><a href="${EXPLORER}/address/${CONTRACT_ADDRESS}" target="_blank">${short(h)}</a></td>
        <td>${v}</td>
        <td class="mono">${(Number(r.score) / 1e6).toFixed(4)}</td>
        <td>${TYPE[Number(r.mediaType)]}</td>
        <td style="color:var(--muted)">${ago(r.timestamp)}</td>
        <td class="mono">${short(r.submitter)}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    $('regBody').innerHTML = `<tr><td colspan="6" class="status err">${e.shortMessage || e.message}</td></tr>`;
  }
}

// ---- wallet ----
async function ensureNetwork() {
  const cur = await window.ethereum.request({ method: 'eth_chainId' });
  if (cur === RITUAL_HEX) return true;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: RITUAL_HEX }] });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: RITUAL_HEX, chainName: 'Ritual',
          nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
          rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER],
        }],
      });
    } else throw err;
  }
  return true;
}

async function connect() {
  if (!window.ethereum) {
    $('analyzeStatus').textContent = 'No injected wallet found. Install MetaMask to write on-chain.';
    $('analyzeStatus').className = 'status err';
    return;
  }
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  await ensureNetwork();
  const bp = new ethers.BrowserProvider(window.ethereum);
  signer = await bp.getSigner();
  writeContract = new ethers.Contract(CONTRACT_ADDRESS, MEDIA_REGISTRY_ABI, signer);
  const addr = await signer.getAddress();
  $('connectBtn').textContent = short(addr);
  $('netDot').classList.add('on');
  $('netLabel').textContent = 'Ritual · connected';
  refreshAnalyzeBtn();
}

// ---- analyze flow ----
let current = null;

async function onFile(file) {
  $('analyzeBody').style.display = 'block';
  $('analyzeStatus').textContent = 'Extracting forensic features…';
  $('analyzeStatus').className = 'status';
  $('fName').textContent = file.name;
  if (file.type.startsWith('video/')) $('mediaType').value = '1';
  else if (file.type.startsWith('audio/')) $('mediaType').value = '2';
  else $('mediaType').value = '0';
  try {
    current = await extractFeatures(file);
  } catch (e) {
    $('analyzeStatus').textContent = 'Feature extraction failed: ' + e.message;
    $('analyzeStatus').className = 'status err';
    return;
  }
  $('fHash').textContent = short(current.hash);
  $('thumb').innerHTML = '';
  if (current.thumb) $('thumb').appendChild(current.thumb);
  $('feats').innerHTML = current.features.map((f, i) =>
    `<div class="feat"><b>${FEAT_NAMES[i]}</b><span>${f.toFixed(3)}</span></div>`).join('');

  // read-only preview of the verdict
  try {
    const score = await readContract.previewScore(current.int32);
    const isAI = score >= threshold;
    $('preVerdict').innerHTML = `<span class="verdict ${isAI ? 'ai' : 'real'}">${isAI ? 'likely AI' : 'likely authentic'} · ${(Number(score) / 1e6).toFixed(4)}</span>`;
  } catch (e) {
    $('preVerdict').textContent = '(preview unavailable)';
  }
  $('analyzeStatus').textContent = 'Ready. Connect a wallet and register the verdict on-chain.';
  refreshAnalyzeBtn();
}

function refreshAnalyzeBtn() {
  $('analyzeBtn').disabled = !(current && writeContract);
}

async function analyze() {
  if (!current || !writeContract) return;
  $('analyzeBtn').disabled = true;
  $('analyzeStatus').className = 'status';
  $('analyzeStatus').textContent = 'Sending transaction…';
  try {
    const mt = Number($('mediaType').value);
    const tx = await writeContract.analyze(current.hash, current.int32, mt, '', { gasLimit: 3_000_000n });
    $('analyzeStatus').innerHTML = `Mining… <a href="${EXPLORER}/tx/${tx.hash}" target="_blank">${short(tx.hash)}</a>`;
    const rcpt = await tx.wait();
    const rec = await readContract.getRecord(current.hash);
    $('analyzeStatus').className = 'status ok';
    $('analyzeStatus').innerHTML =
      `✓ Registered — verdict <b>${rec.isAI ? 'AI-GENERATED' : 'AUTHENTIC'}</b> (score ${(Number(rec.score) / 1e6).toFixed(4)}) in block ${rcpt.blockNumber}.`;
    await loadRegistry();
    await loadModel();
  } catch (e) {
    const msg = e.shortMessage || e.reason || e.message || 'failed';
    $('analyzeStatus').className = 'status err';
    $('analyzeStatus').textContent = /AlreadyRecorded/.test(JSON.stringify(e))
      ? 'This media is already registered. Use “Verify a file” to see its record.'
      : 'Transaction failed: ' + msg;
  }
  refreshAnalyzeBtn();
}

// ---- verify flow ----
async function onVerifyFile(file) {
  $('verifyResult').style.display = 'block';
  $('verifyStatus').textContent = 'Hashing & looking up…';
  $('verifyStatus').className = 'status';
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const hash = ethers.keccak256(buf);
    $('vHash').textContent = hash;
    const rec = await readContract.getRecord(hash);
    if (!rec.exists) {
      $('vVerdict').className = 'verdict none';
      $('vVerdict').textContent = 'not registered';
      $('vDetails').innerHTML = '';
    } else {
      $('vVerdict').className = 'verdict ' + (rec.isAI ? 'ai' : 'real');
      $('vVerdict').textContent = rec.isAI ? 'AI-GENERATED' : 'AUTHENTIC';
      $('vDetails').innerHTML =
        `<div><b>score</b> ${(Number(rec.score) / 1e6).toFixed(4)}</div>` +
        `<div><b>type</b> ${TYPE[Number(rec.mediaType)]}</div>` +
        `<div><b>when</b> ${ago(rec.timestamp)}</div>` +
        `<div><b>submitter</b> <span class="mono">${rec.submitter}</span></div>` +
        (rec.uri ? `<div><b>uri</b> <span class="mono">${rec.uri}</span></div>` : '');
    }
    $('verifyStatus').textContent = '';
  } catch (e) {
    $('verifyStatus').className = 'status err';
    $('verifyStatus').textContent = e.shortMessage || e.message;
  }
}

// ---- wiring ----
function wireDrop(dropId, inputId, handler) {
  const drop = $(dropId), input = $(inputId);
  drop.onclick = () => input.click();
  input.onchange = () => input.files[0] && handler(input.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
  };
}

wireDrop('drop', 'file', onFile);
wireDrop('vdrop', 'vfile', onVerifyFile);
$('connectBtn').onclick = connect;
$('analyzeBtn').onclick = analyze;
$('refreshBtn').onclick = () => { loadRegistry(); loadModel(); };
$('clearBtn').onclick = () => { current = null; $('analyzeBody').style.display = 'none'; };

loadModel();
loadRegistry();
