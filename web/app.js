// RitualProof — cinematic frontend wired to the live MediaRegistry contract.
// Design ported from the DC prototype; all data now flows from Ritual Chain.
import { CONTRACT_ADDRESS, RPC_URL, EXPLORER } from './config.js';
import { MEDIA_REGISTRY_ABI } from './abi.js';

const GOLD = 'oklch(0.8 0.13 80)';
const GREEN = 'oklch(0.82 0.15 152)';
const RED = 'oklch(0.66 0.21 25)';
const CHAIN_ID = 1979, CHAIN_HEX = '0x7bb';
const TYPE = ['IMAGE', 'VIDEO', 'AUDIO'];
const $ = (id) => document.getElementById(id);
const gsap = window.gsap;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- chain clients ----
const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'ritual' });
const read = new ethers.Contract(CONTRACT_ADDRESS, MEDIA_REGISTRY_ABI, provider);
let signer = null, write = null, threshold = 1_000_000n;

$('ctrLink').href = `${EXPLORER}/address/${CONTRACT_ADDRESS}`;

// ---- helpers ----
const _b = new ArrayBuffer(4), _f = new Float32Array(_b), _i = new Int32Array(_b);
const floatToInt32 = (x) => { _f[0] = x; return _i[0]; };
const shortHash = (h) => h.slice(0, 6) + '…' + h.slice(-4);
const shortAddr = (a) => a.slice(0, 6) + '…' + a.slice(-3);
const scoreOf = (s) => (Number(s) / 1e6);
function ago(ts) {
  let t = Number(ts); if (t > 1e12) t = Math.floor(t / 1000);       // Ritual timestamps are ms
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
}
const verdictWord = (isAI) => isAI ? 'Synthetic' : 'Authentic';
const verdictColor = (isAI) => isAI ? RED : GREEN;

// ---- feature extraction (must match the deployed contract) ----
async function extractFeatures(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const hash = ethers.keccak256(buf);
  let features, previewUrl = null, mediaType = 0;
  if (file.type.startsWith('image/')) { ({ features, previewUrl } = await imageFeatures(file)); mediaType = 0; }
  else if (file.type.startsWith('video/')) { ({ features, previewUrl } = await videoFeatures(file)); mediaType = 1; }
  else { features = byteFeatures(buf); mediaType = file.type.startsWith('audio/') ? 2 : 0; }
  return { hash, features, int32: features.map(floatToInt32), previewUrl, mediaType, name: file.name };
}
function drawToCanvas(src, W = 128, H = 128) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}
function featuresFromImageData(d, w, h) {
  const n = w * h, luma = new Float32Array(n);
  let sR = 0, sG = 0, sB = 0, sL = 0, sL2 = 0, sSat = 0;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], L = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = L; sR += r; sG += g; sB += b; sL += L; sL2 += L * L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sSat += mx === 0 ? 0 : (mx - mn) / mx;
  }
  const meanL = sL / n, varL = Math.max(0, sL2 / n - meanL * meanL);
  let sLap = 0, sGx = 0, sGy = 0, edges = 0, cnt = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = Math.abs(luma[i + 1] - luma[i - 1]), gy = Math.abs(luma[i + w] - luma[i - w]);
    const lap = Math.abs(4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w]);
    sGx += gx; sGy += gy; sLap += lap; if ((gx + gy) / 2 > 20) edges++; cnt++;
  }
  const c01 = (v) => Math.min(1, Math.max(0, v));
  return [c01(meanL / 255), c01(Math.sqrt(varL) / 128), c01(sR / n / 255), c01(sG / n / 255),
    c01(sB / n / 255), c01(sLap / cnt / 255), c01(sGx / cnt / 255), c01(sGy / cnt / 255),
    c01(sSat / n), c01(edges / cnt)];
}
function imageFeatures(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { res({ features: featuresFromImageData(drawToCanvas(img), 128, 128), previewUrl: img.src }); };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
function videoFeatures(file) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true;
    v.onloadeddata = () => { v.currentTime = Math.min(0.1, v.duration || 0.1); };
    v.onseeked = () => { res({ features: featuresFromImageData(drawToCanvas(v), 128, 128), previewUrl: null }); };
    v.onerror = rej; v.src = URL.createObjectURL(file);
  });
}
function byteFeatures(buf) {
  const N = Math.min(buf.length, 65536), hist = new Array(256).fill(0);
  let sum = 0, s2 = 0, zero = 0, high = 0, ascii = 0, ff = 0, dsum = 0;
  for (let i = 0; i < N; i++) { const v = buf[i]; hist[v]++; sum += v; s2 += v * v;
    if (v === 0) zero++; if (v > 200) high++; if (v >= 32 && v < 127) ascii++; if (v === 255) ff++;
    if (i > 0) dsum += Math.abs(v - buf[i - 1]); }
  const mean = sum / N, varr = Math.max(0, s2 / N - mean * mean);
  let ent = 0, uniq = 0; for (let k = 0; k < 256; k++) if (hist[k] > 0) { const p = hist[k] / N; ent -= p * Math.log2(p); uniq++; }
  const c01 = (v) => Math.min(1, Math.max(0, v));
  return [c01(mean / 255), c01(Math.sqrt(varr) / 128), c01(ent / 8), c01(zero / N), c01(high / N),
    c01(ascii / N), c01(dsum / N / 255), c01(uniq / 256), c01(ff / N), c01(Math.log2(buf.length + 1) / 24)];
}
// placeholder specimen for non-image previews
function makeSpecimen(seed) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 640, 480);
  g.addColorStop(0, '#3a3226'); g.addColorStop(0.6, '#191612'); g.addColorStop(1, '#0c0a08');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
  let s = seed || 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 20000; i++) { ctx.fillStyle = 'rgba(237,232,220,' + (rnd() * 0.14).toFixed(3) + ')'; ctx.fillRect(rnd() * 640, rnd() * 480, 1.4, 1.4); }
  return c.toDataURL('image/png');
}

// ======================= CHAIN READS =======================
async function loadModelAndStats() {
  try {
    const [modelId, thr, total, block] = await Promise.all([
      read.modelId(), read.threshold(), read.totalRecords(), provider.getBlockNumber(),
    ]);
    threshold = thr;
    let synthetic = 0, cnt = 0;
    try {
      const [, recs] = await read.recent(50n);
      cnt = recs.length; synthetic = recs.filter(r => r.isAI).length;
    } catch {}
    const pctSyn = cnt ? (synthetic / cnt) * 100 : 0;
    renderStats([
      { label: 'VERDICTS ETCHED', value: Number(total), decimals: 0, suffix: '' },
      { label: 'FLAGGED SYNTHETIC', value: pctSyn, decimals: 1, suffix: '%' },
      { label: 'CHAIN ID', value: CHAIN_ID, decimals: 0, suffix: '' },
      { label: 'LATEST BLOCK', value: Number(block), decimals: 0, suffix: '' },
    ]);
  } catch (e) { console.warn('stats load failed', e); }
}
function renderStats(stats) {
  $('heroStats').innerHTML = stats.map((s, i) =>
    `<div style="background:#0E0D0A;padding:22px 22px 18px;">
      <div style="font-size:clamp(26px,3vw,40px);font-weight:500;color:#EDE8DC;"><span class="statval" data-v="${s.value}" data-d="${s.decimals}">0</span><span class="gold">${s.suffix}</span></div>
      <div style="font-size:10px;letter-spacing:.26em;color:#8F887A;margin-top:8px;">${s.label}</div>
    </div>`).join('');
  document.querySelectorAll('.statval').forEach(el => {
    const target = +el.dataset.v, d = +el.dataset.d;
    el.textContent = fmt(target, d);                       // guaranteed final value
    if (reduced || !gsap) return;
    const o = { n: 0 };
    gsap.to(o, { n: target, duration: 2, ease: 'power2.out', delay: 0.6,
      onUpdate: () => { el.textContent = fmt(o.n, d); } }); // flourish when foregrounded
    setTimeout(() => { el.textContent = fmt(target, d); }, 3200); // timer safety-net vs rAF throttling
  });
}
const fmt = (v, d) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

async function loadRegistry() {
  try {
    const [hashes, recs] = await read.recent(25n);
    const total = await read.totalRecords();
    $('regMeta').textContent = `${total} VERDICTS · IMMUTABLE`;
    const rows = hashes.map((h, i) => ({ hash: h, r: recs[i] }));
    $('registry').innerHTML = rows.length ? rows.map(({ hash, r }) => {
      const col = verdictColor(r.isAI), vb = r.isAI ? 'SYNTHETIC' : 'AUTHENTIC';
      return `<div role="listitem" data-registry-row style="display:grid;grid-template-columns:130px 1fr 120px 90px 100px 120px;gap:16px;align-items:center;padding:18px;border-top:1px solid rgba(237,232,220,0.1);font-size:12px;letter-spacing:.08em;transition:background .25s;" onmouseover="this.style.background='#12100C'" onmouseout="this.style.background='transparent'">
        <span style="color:${col};font-weight:600;letter-spacing:.18em;display:flex;align-items:center;gap:8px;"><span style="width:7px;height:7px;background:${col};transform:rotate(45deg);display:inline-block;"></span>${vb}</span>
        <span style="color:#8F887A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><a href="${EXPLORER}/address/${CONTRACT_ADDRESS}" target="_blank">${hash}</a></span>
        <span style="color:#EDE8DC;">${scoreOf(r.score).toFixed(4)}</span>
        <span style="color:#8F887A;">${TYPE[Number(r.mediaType)]}</span>
        <span style="color:#8F887A;">${ago(r.timestamp)}</span>
        <span style="color:#B8B1A2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shortAddr(r.submitter)}</span>
      </div>`;
    }).join('') : `<div style="padding:28px 18px;color:#5C574C;">No verdicts etched yet — be the first.</div>`;

    // ticker
    const tick = rows.concat(rows).map(({ hash, r }) =>
      `<span style="display:flex;align-items:center;gap:12px;font-size:11px;letter-spacing:.14em;white-space:nowrap;">
        <span style="color:${verdictColor(r.isAI)};">◆ ${r.isAI ? 'SYNTHETIC' : 'AUTHENTIC'}</span>
        <span style="color:#8F887A;">${shortHash(hash)}</span>
        <span style="color:#5C574C;">${scoreOf(r.score).toFixed(3)} · ${ago(r.timestamp)}</span>
      </span>`).join('');
    $('ticker').innerHTML = tick || '';

    if (gsap && !reduced) {
      const rowsEl = gsap.utils.toArray('[data-registry-row]');
      if (rowsEl.length) gsap.from(rowsEl, { x: -30, opacity: 0, duration: 0.7, ease: 'power2.out', stagger: 0.05,
        scrollTrigger: { trigger: rowsEl[0], start: 'top 90%' } });
    }
  } catch (e) { $('registry').innerHTML = `<div style="padding:28px 18px;color:${RED};">Registry read failed: ${e.shortMessage || e.message}</div>`; }
}

// ======================= WALLET =======================
async function connect() {
  if (!window.ethereum) { alert('No wallet found. Install MetaMask to etch verdicts on-chain.'); return false; }
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const cur = await window.ethereum.request({ method: 'eth_chainId' });
  if (cur !== CHAIN_HEX) {
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) {
      if (e.code === 4902) await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: CHAIN_HEX, chainName: 'Ritual', nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
        rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER] }] });
      else throw e;
    }
  }
  const bp = new ethers.BrowserProvider(window.ethereum);
  signer = await bp.getSigner(); write = new ethers.Contract(CONTRACT_ADDRESS, MEDIA_REGISTRY_ABI, signer);
  const addr = await signer.getAddress();
  $('connectBtn').textContent = shortAddr(addr);
  $('netPill').style.color = GREEN;
  return true;
}
$('connectBtn').onclick = () => connect().catch(e => console.warn(e));

// ======================= ANALYZE FLOW =======================
let current = null;   // { hash, int32, mediaType, score, isAI, name }

async function beginAnalysis(file) {
  show('scan');
  $('specLabel').textContent = 'SPECIMEN · ' + file.name.toUpperCase().slice(0, 26);
  let data;
  try { data = await extractFeatures(file); }
  catch (e) { show('idle'); alert('Could not read that file: ' + e.message); return; }
  current = data;
  $('previewImg').src = data.previewUrl || makeSpecimen(file.size % 100000 + 7);

  // real read: run the on-chain model (no wallet needed)
  const scorePromise = read.previewScore(data.int32).then(s => Number(s)).catch(() => null);

  runScan(async () => {
    const raw = await scorePromise;
    if (raw === null) { show('idle'); alert('On-chain inference failed (model may be warming up). Try again.'); return; }
    current.scoreRaw = raw; current.score = raw / 1e6; current.isAI = BigInt(Math.round(raw)) >= threshold;
    showVerdict();
  });
}

const SCAN_STEPS = [
  'INGESTING SPECIMEN — COMPUTING KECCAK-256',
  'EXTRACTING FORENSIC FEATURE VECTOR [10-D]',
  'ENCODING RITUALTENSOR · FLOAT32 [1×10]',
  'INVOKING ONNX PRECOMPILE 0x0800',
  'MODEL INFERENCE INSIDE BLOCK EXECUTION',
  'THRESHOLD COMPARE — RESOLVING VERDICT',
];
function runScan(done) {
  const logEl = $('log'), pctEl = $('pct'); logEl.innerHTML = '';
  const dur = reduced ? 0.5 : 3.4;
  if (!gsap) { pctEl.textContent = '100'; done(); return; }
  const o = { n: 0 };
  const tl = gsap.timeline({ onComplete: done });
  tl.to(o, { n: 100, duration: dur, ease: 'power1.inOut', onUpdate: () => pctEl.textContent = Math.floor(o.n) }, 0);
  SCAN_STEPS.forEach((step, i) => {
    tl.call(() => {
      const line = document.createElement('div'); line.textContent = '> ' + step; line.style.opacity = '0';
      logEl.appendChild(line);
      gsap.to(line, { opacity: 1, x: 0, duration: 0.3, startAt: { x: -12 } });
      const prev = logEl.children[logEl.children.length - 2];
      if (prev) { prev.style.color = '#5C574C'; prev.textContent = prev.textContent.replace('> ', '✓ '); prev.style.opacity = '0.8'; }
    }, [], (dur * (i + 0.4)) / SCAN_STEPS.length);
  });
  if (!reduced) {
    const img = $('previewImg');
    tl.to(img, { filter: 'saturate(0.4) contrast(1.3) brightness(1.15)', duration: 0.12, yoyo: true, repeat: 5, repeatDelay: dur / 7 }, 0.4);
  }
}

function showVerdict() {
  show('verdict');
  const isAI = current.isAI, col = verdictColor(isAI);
  $('verdictWord').textContent = verdictWord(isAI);
  $('verdictWord').style.color = col;
  $('verdictWord').style.textShadow = `0 0 60px ${col.replace(')', ' / 0.35)')}`;
  $('verdictSub').textContent = isAI ? 'FLAGGED SYNTHETIC BY ON-CHAIN MODEL' : 'READS AS AUTHENTIC BY ON-CHAIN MODEL';
  $('verdictPanel').style.borderColor = col.replace(')', ' / 0.45)');
  $('flash').style.background = col; $('ring').style.borderColor = col;
  $('score').style.color = col;
  $('seal').textContent = 'PREVIEW'; $('seal').style.borderColor = '#8F887A'; $('seal').style.color = '#8F887A';
  $('etchStatus').textContent = 'Preview only — this verdict is NOT yet on-chain. Etch it to make it permanent.';
  $('etchBtn').classList.remove('hidden'); $('etchBtn').disabled = false; $('etchBtn').textContent = 'ETCH ON-CHAIN ⟶';
  playReveal();
}

function playReveal() {
  const hashEl = $('hashOut'), scoreEl = $('score');
  if (!gsap || reduced) {
    hashEl.textContent = current.hash; scoreEl.textContent = current.score.toFixed(4);
    $('seal').style.opacity = '1'; return;
  }
  const tl = gsap.timeline();
  tl.set('#verdictWord', { opacity: 0 }).set('#seal', { opacity: 0 })
    .to('#flash', { opacity: 0.9, duration: 0.06, delay: 0.4 })
    .to('#flash', { opacity: 0, duration: 0.5, ease: 'power2.out' })
    .fromTo('#verdictWord', { opacity: 0, scale: 2.6, filter: 'blur(18px)' },
      { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.55, ease: 'power4.in' }, 0.4)
    .to('#verdictPanel', { x: 6, duration: 0.05, repeat: 5, yoyo: true, ease: 'none' }, 0.95)
    .set('#verdictPanel', { x: 0 })
    .fromTo('#ring', { scale: 0.2, opacity: 0.9 }, { scale: 2.2, opacity: 0, duration: 1.4, ease: 'power2.out' }, 0.95)
    .from('#verdictSub', { opacity: 0, y: 14, duration: 0.6 }, 1.2);
  const o = { n: 0 };
  tl.to(o, { n: current.score, duration: 1.4, ease: 'power3.out', onUpdate: () => scoreEl.textContent = o.n.toFixed(4) }, 1.2);
  tl.call(() => scramble(hashEl, current.hash, 1400), [], 1.2);
  tl.fromTo('#seal', { opacity: 0, scale: 2.2, rotate: -8 }, { opacity: 1, scale: 1, rotate: -8, duration: 0.4, ease: 'power4.in' }, 2.3);
}
function scramble(el, target, ms) {
  const glyphs = '0123456789abcdef', start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / ms), solved = Math.floor(p * target.length);
    let out = target.slice(0, solved);
    for (let i = solved; i < target.length; i++) out += glyphs[(Math.random() * 16) | 0];
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick); else el.textContent = target;
  };
  requestAnimationFrame(tick);
}

// ---- etch on-chain (real transaction) ----
async function etch() {
  if (!current) return;
  $('etchBtn').disabled = true;
  try {
    if (!write) { $('etchStatus').textContent = 'Connecting wallet…'; const ok = await connect(); if (!ok) { $('etchBtn').disabled = false; return; } }
    // already recorded?
    const existing = await read.getRecord(current.hash);
    if (existing.exists) { sealEtched(existing, null); $('etchStatus').textContent = 'This fingerprint was already etched — showing the on-chain record.'; return; }

    $('etchStatus').textContent = 'Awaiting signature…';
    const tx = await write.analyze(current.hash, current.int32, current.mediaType, '', { gasLimit: 3_000_000n });
    $('etchStatus').innerHTML = `Etching… <a class="gold" target="_blank" href="${EXPLORER}/tx/${tx.hash}">${shortHash(tx.hash)}</a>`;
    const rcpt = await tx.wait();
    const rec = await read.getRecord(current.hash);
    sealEtched(rec, rcpt.blockNumber);
    loadRegistry(); loadModelAndStats();
  } catch (e) {
    const s = JSON.stringify(e);
    if (/AlreadyRecorded/.test(s)) { const rec = await read.getRecord(current.hash); sealEtched(rec, null); $('etchStatus').textContent = 'Already etched on-chain.'; }
    else { $('etchStatus').textContent = 'Etch failed: ' + (e.shortMessage || e.reason || e.message || 'unknown'); $('etchBtn').disabled = false; }
  }
}
function sealEtched(rec, block) {
  const col = verdictColor(rec.isAI);
  $('seal').textContent = 'ETCHED · PERMANENT'; $('seal').style.borderColor = col; $('seal').style.color = col;
  if (gsap && !reduced) gsap.fromTo('#seal', { scale: 1.6, rotate: -8 }, { scale: 1, rotate: -8, duration: 0.4, ease: 'power4.in' });
  $('etchBtn').classList.add('hidden');
  $('etchStatus').innerHTML = `✓ Verdict <b style="color:${col}">${rec.isAI ? 'SYNTHETIC' : 'AUTHENTIC'}</b> etched immutably` + (block ? ` in block ${block}.` : '.');
}

function resetAnalyze() { current = null; show('idle'); }

function show(phase) {
  $('aIdle').classList.toggle('hidden', phase !== 'idle');
  $('aScan').classList.toggle('hidden', phase !== 'scan');
  $('aVerdict').classList.toggle('hidden', phase !== 'verdict');
}

// ======================= VERIFY FLOW =======================
async function verifyFile(file) {
  vShow('busy'); $('vBusyName').textContent = 'INTERROGATING LEDGER — ' + file.name.toUpperCase().slice(0, 22);
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const hash = ethers.keccak256(buf);
    const rec = await read.getRecord(hash);
    if (!rec.exists) { vShow('missing'); }
    else {
      const col = verdictColor(rec.isAI);
      $('vVerdict').textContent = verdictWord(rec.isAI); $('vVerdict').style.color = col;
      $('vMeta').innerHTML = `MODEL SCORE <span style="color:${col};">${scoreOf(rec.score).toFixed(4)}</span> · JUDGED ${ago(rec.timestamp)} · ${TYPE[Number(rec.mediaType)]}<br>`
        + `BY <span style="color:#B8B1A2;">${rec.submitter}</span><br><span style="color:#5C574C;word-break:break-all;">${hash}</span>`;
      vShow('found');
    }
    if (gsap && !reduced) gsap.from('#verifyCard', { opacity: 0, y: 16, duration: 0.5, ease: 'power2.out' });
  } catch (e) { vShow('missing'); $('vMissing') && ($('vMissing').firstElementChild.textContent = 'LOOKUP FAILED'); }
}
function vShow(p) {
  ['vIdle', 'vBusy', 'vFound', 'vMissing'].forEach(id => $(id).classList.toggle('hidden', id !== 'v' + p.charAt(0).toUpperCase() + p.slice(1)));
}

// ======================= WIRING =======================
function wireDrop(dropId, inputId, handler) {
  const drop = $(dropId), input = $(inputId);
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => input.files[0] && handler(input.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = GOLD; drop.style.background = '#161310'; };
  drop.ondragleave = () => { drop.style.borderColor = ''; drop.style.background = ''; };
  drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ''; drop.style.background = ''; if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]); };
}
wireDrop('drop', 'aInput', beginAnalysis);
wireDrop('vdrop', 'vInput', verifyFile);
$('etchBtn').onclick = etch;
$('resetBtn').onclick = resetAnalyze;

// ======================= INTRO ANIMATION =======================
function intro() {
  if (!gsap) return;
  gsap.registerPlugin(window.ScrollTrigger);
  if (reduced) return;
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('#nav', { y: -40, opacity: 0, duration: 0.8 })
    .from('#heroKicker', { opacity: 0, letterSpacing: '1.2em', duration: 1.1 }, 0.15)
    .from('#heroL1', { y: 90, opacity: 0, skewY: 3, duration: 1.1 }, 0.35)
    .from('#heroL2', { y: 90, opacity: 0, skewY: 3, duration: 1.1 }, 0.55)
    .from('#heroSub', { y: 30, opacity: 0, duration: 0.9 }, 0.9)
    .from('#heroStats', { y: 30, opacity: 0, duration: 0.9 }, 1.05);
  gsap.utils.toArray('[data-reveal]').forEach(sec => gsap.from(sec, {
    y: 60, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: sec, start: 'top 82%' } }));
}

// ======================= BOOT =======================
intro();
loadModelAndStats();
loadRegistry();
if (window.ethereum && window.ethereum.selectedAddress) connect().catch(() => {});
